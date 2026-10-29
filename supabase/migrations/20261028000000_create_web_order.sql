-- Pedido web calculado en el servidor (/menu y /menu-mayorista).
--
-- Hasta ahora el checkout armaba la venta en el navegador (precios, descuento y
-- total) y la insertaba directo en sales. Un cliente técnico podía mandar el total
-- que quisiera. Esta función recibe SOLO lo que el cliente decide (nombre, teléfono,
-- fecha, lista de precios, productos con cantidad y cupón) y calcula el resto con los
-- datos de la base: precios de products, descuento de coupons y total. Después
-- inserta la venta como pedido abierto.
--
-- Es aditiva: puede aplicarse antes de desplegar el front nuevo. El INSERT directo
-- de anon se cierra aparte, en 20261028000100_cerrar_insert_anonimo_sales.sql, que
-- debe aplicarse DESPUÉS de desplegar el front que usa esta función.
--
-- Errores: la función falla con un mensaje 'web_order:<motivo>' que el front traduce
-- (src/utils/createWebOrder.js): invalid_name, invalid_phone, invalid_price_list,
-- invalid_date, empty_cart, invalid_item, invalid_qty, min_qty, coupon_not_found.
--
-- Reglas que NO se validan acá (siguen siendo del front): el plazo de 48 horas para
-- productos sin stock y el tope de unidades por stock. Acá solo se exige que la
-- fecha sea de lunes a sábado, desde mañana y dentro de ~60 días.

create or replace function public.create_web_order(
  p_customer_name text,
  p_phone text,
  p_delivery_date date,
  p_price_list text,
  p_items jsonb,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  c_min_wholesale_qty constant int := 4;   -- MIN_WHOLESALE_QTY en WholesaleMenuPage.jsx
  c_max_qty constant int := 999;
  -- "|" separa las partes de las notas del pedido: no puede venir en nombre ni teléfono.
  v_name text := btrim(regexp_replace(coalesce(p_customer_name, ''), '[|[:cntrl:]]+', ' ', 'g'));
  v_phone text := btrim(regexp_replace(coalesce(p_phone, ''), '[^0-9+() -]', '', 'g'));
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_id text := gen_random_uuid()::text;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_pct numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_code text;
  v_notes text;
  r record;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'web_order:invalid_name';
  end if;
  if char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 or char_length(v_phone) > 30 then
    raise exception 'web_order:invalid_phone';
  end if;
  if p_price_list is null or p_price_list not in ('retail', 'wholesale') then
    raise exception 'web_order:invalid_price_list';
  end if;
  -- Lunes a sábado, desde mañana. El tope es +62 porque el front calcula su "max"
  -- con la fecha UTC, que de noche en Argentina ya es la del día siguiente.
  if p_delivery_date is null
     or p_delivery_date < v_today + 1
     or p_delivery_date > v_today + 62
     or extract(dow from p_delivery_date) = 0 then
    raise exception 'web_order:invalid_date';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'web_order:empty_cart';
  end if;

  -- Productos: solo publicados en el menú. El precio sale de products, nunca del cliente.
  for r in
    select g.qty, p.id as pid, p.name, p.category, p.kit_items,
           case when p_price_list = 'wholesale' then p.price_wholesale else p.price_retail end as price
    from (
      select e.value ->> 'productId' as product_id,
             sum((e.value ->> 'qty')::numeric) as qty,
             min(e.n) as pos
      from jsonb_array_elements(p_items) with ordinality as e(value, n)
      group by 1
    ) g
    left join public.products p
      on p.id = g.product_id and p.active and p.show_in_menu
    order by g.pos
  loop
    if r.pid is null then
      raise exception 'web_order:invalid_item';
    end if;
    if r.qty is null or r.qty <> floor(r.qty) or r.qty < 1 or r.qty > c_max_qty then
      raise exception 'web_order:invalid_qty';
    end if;
    if coalesce(r.price, 0) <= 0 then
      raise exception 'web_order:invalid_item';
    end if;
    if p_price_list = 'wholesale' and r.qty < c_min_wholesale_qty then
      raise exception 'web_order:min_qty';
    end if;

    v_subtotal := v_subtotal + r.price * r.qty;
    -- Misma forma que arma el carrito del front: stock y facturación leen estos campos.
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'productId', r.pid,
      'name', r.name,
      'qty', r.qty::int,
      'price', r.price,
      'originalPrice', r.price,
      'priceOverridden', false,
      'subtotal', r.price * r.qty,
      'isKit', jsonb_array_length(coalesce(r.kit_items, '[]'::jsonb)) > 0,
      'kitItems', coalesce(r.kit_items, '[]'::jsonb),
      'includeInTicket', true,
      'category', r.category,
      'frozen', false
    ));
  end loop;

  -- Cupón: se vuelve a buscar acá, no se confía en lo que el cliente vio.
  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    select c.code, c.discount_pct into v_code, v_pct
    from public.coupons c
    where c.code = upper(regexp_replace(p_coupon_code, '\s+', '', 'g'));
    if not found then
      raise exception 'web_order:coupon_not_found';
    end if;
    v_discount := least(round(v_subtotal * v_pct / 100), v_subtotal);
  end if;
  v_total := v_subtotal - v_discount;

  v_notes := '[WEB] WhatsApp: ' || v_phone
    || case when p_price_list = 'wholesale' then ' | Pedido mayorista' else '' end
    || case when v_code is not null then ' | Cupón ' || v_code || ' (-' || trim_scale(v_pct)::text || '%)' else '' end;

  insert into public.sales (
    id, customer_id, customer_name, items, total, price_list, payment_method, status, notes,
    created_at, paid_at, discount_type, discount_value, discount_amount, delivery_date,
    needs_billing, billing_status
  ) values (
    v_id, null, v_name, v_items, v_total, p_price_list, null, 'open', v_notes,
    now(), null, 'pct', v_pct, v_discount, p_delivery_date,
    false, null
  );

  return jsonb_build_object(
    'saleId', v_id,
    'subtotal', v_subtotal,
    'discountAmount', v_discount,
    'total', v_total,
    'couponCode', v_code,
    'discountPct', v_pct
  );
end;
$$;

comment on function public.create_web_order(text, text, date, text, jsonb, text) is
  'Crea un pedido web calculando precios, cupon y total en el servidor. Ejecutable por anon (checkout publico).';

revoke all on function public.create_web_order(text, text, date, text, jsonb, text) from public;
grant execute on function public.create_web_order(text, text, date, text, jsonb, text) to anon, authenticated;
