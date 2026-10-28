-- Verificación de 20261028000000_create_web_order.sql
--
-- Ejecutar DESPUÉS de aplicar la migración (SQL Editor, psql o MCP). No deja datos:
-- cada prueba que escribe corre en un sub-bloque que se revierte (SQLSTATE P0099).
-- Usa un producto publicado real de la base para comparar contra su precio.
-- Ante el primer chequeo incumplido falla con "FALLO: ..."; si todo está bien
-- termina con NOTICE "OK: N chequeos".

do $check$
declare
  checks int := 0;
  n int;
  msg text;
  r jsonb;
  s record;
  c record;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_date date;
  v_sunday date;
  p_id text;
  p_retail numeric;
  p_wholesale numeric;
  p_hidden text;
  v_ok jsonb;
  v_sub numeric;
  v_disc numeric;
begin
  -- Un día hábil válido (de lunes a sábado, desde pasado mañana) y el próximo domingo.
  v_date := v_today + 2;
  while extract(dow from v_date) = 0 loop v_date := v_date + 1; end loop;
  v_sunday := v_today + 1;
  while extract(dow from v_sunday) <> 0 loop v_sunday := v_sunday + 1; end loop;

  select id, price_retail, price_wholesale into p_id, p_retail, p_wholesale
  from public.products
  where active and show_in_menu and price_retail > 0 and price_wholesale > 0
  order by id limit 1;
  if p_id is null then
    raise exception 'FALLO: no hay un producto publicado con precio minorista y mayorista para probar';
  end if;
  select id into p_hidden from public.products
  where not (coalesce(active, false) and coalesce(show_in_menu, false))
  order by id limit 1;
  v_ok := jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 1));

  ---------------------------------------------------------------- estructura
  if not exists (select 1 from pg_proc where oid = 'public.create_web_order(text,text,date,text,jsonb,text)'::regprocedure and prosecdef) then
    raise exception 'FALLO: create_web_order no es SECURITY DEFINER';
  end if;
  checks := checks + 1;
  if not exists (select 1 from pg_proc where oid = 'public.create_web_order(text,text,date,text,jsonb,text)'::regprocedure
                 and exists (select 1 from unnest(proconfig) cfg where cfg like 'search_path=%')) then
    raise exception 'FALLO: create_web_order no tiene search_path fijo';
  end if;
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.create_web_order(text,text,date,text,jsonb,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_web_order(text,text,date,text,jsonb,text)', 'execute') then
    raise exception 'FALLO: anon o authenticated no pueden ejecutar create_web_order';
  end if;
  checks := checks + 1;
  select count(*) into n from information_schema.routine_privileges
  where routine_schema = 'public' and routine_name = 'create_web_order' and grantee = 'PUBLIC';
  if n <> 0 then raise exception 'FALLO: PUBLIC puede ejecutar create_web_order'; end if;
  checks := checks + 1;

  -------------------------------------- pedido minorista: el precio sale de la base
  begin
    set local role anon;
    -- El cliente intenta imponer precio y subtotal: la función los ignora.
    r := public.create_web_order('Cliente Chk', '2281 000000', v_date, 'retail',
      jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 3, 'price', 1, 'subtotal', 3)), null);
    select count(*) into n from public.sales where id = r ->> 'saleId';
    if n <> 0 then raise exception 'FALLO: anon puede leer el pedido que creo'; end if;
    reset role;

    if (r ->> 'total')::numeric <> p_retail * 3 or (r ->> 'subtotal')::numeric <> p_retail * 3
       or (r ->> 'discountAmount')::numeric <> 0 or r ->> 'couponCode' is not null then
      raise exception 'FALLO: totales devueltos incorrectos: %', r;
    end if;
    select * into s from public.sales where id = r ->> 'saleId';
    if s.id is null then raise exception 'FALLO: el pedido no se guardo'; end if;
    if s.status <> 'open' or s.customer_id is not null or s.payment_method is not null or s.paid_at is not null
       or s.billing_status is not null or s.needs_billing is not false then
      raise exception 'FALLO: estado inicial del pedido incorrecto';
    end if;
    if s.price_list <> 'retail' or s.total <> p_retail * 3 or s.customer_name <> 'Cliente Chk' or s.delivery_date <> v_date
       or s.discount_type <> 'pct' or s.discount_value <> 0 or s.discount_amount <> 0 then
      raise exception 'FALLO: campos del pedido incorrectos';
    end if;
    if s.notes <> '[WEB] WhatsApp: 2281 000000' then raise exception 'FALLO: notas incorrectas: %', s.notes; end if;
    if jsonb_array_length(s.items) <> 1
       or s.items -> 0 ->> 'productId' <> p_id
       or (s.items -> 0 ->> 'price')::numeric <> p_retail
       or (s.items -> 0 ->> 'qty')::int <> 3
       or (s.items -> 0 ->> 'subtotal')::numeric <> p_retail * 3
       or (s.items -> 0 ->> 'includeInTicket')::boolean is not true
       or s.items -> 0 -> 'kitItems' is null or s.items -> 0 -> 'isKit' is null then
      raise exception 'FALLO: items incorrectos: %', s.items;
    end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 6;
  end;

  -- Productos repetidos se suman en una sola línea.
  begin
    set local role anon;
    r := public.create_web_order('Cliente Chk', '2281000000', v_date, 'retail',
      jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 2), jsonb_build_object('productId', p_id, 'qty', 1)), null);
    reset role;
    select * into s from public.sales where id = r ->> 'saleId';
    if jsonb_array_length(s.items) <> 1 or (s.items -> 0 ->> 'qty')::int <> 3 or s.total <> p_retail * 3 then
      raise exception 'FALLO: no sumo los productos repetidos: %', s.items;
    end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 1;
  end;

  -------------------------------------------------- pedido mayorista (mín. 4 u.)
  begin
    set local role anon;
    r := public.create_web_order('Mayorista Chk', '+54 9 2281 000000', v_date, 'wholesale',
      jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 4)), null);
    reset role;
    select * into s from public.sales where id = r ->> 'saleId';
    if s.price_list <> 'wholesale' or s.total <> p_wholesale * 4 or (s.items -> 0 ->> 'price')::numeric <> p_wholesale then
      raise exception 'FALLO: precio mayorista incorrecto';
    end if;
    if s.notes <> '[WEB] WhatsApp: +54 9 2281 000000 | Pedido mayorista' then
      raise exception 'FALLO: notas mayoristas incorrectas: %', s.notes;
    end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 2;
  end;

  ------------------------------------------------------------------- cupones
  begin
    insert into public.coupons (code, discount_pct) values ('CHKCUPON', 15), ('CHKMEDIO', 7.5), ('CHKGRATIS', 100);
    set local role anon;
    -- Se normaliza el código (mayúsculas y espacios), igual que validate_coupon.
    r := public.create_web_order('Cliente Chk', '2281 000000', v_date, 'retail',
      jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 3)), ' chk cupon ');
    reset role;
    v_sub := p_retail * 3;
    v_disc := least(round(v_sub * 15 / 100), v_sub);
    if (r ->> 'subtotal')::numeric <> v_sub or (r ->> 'discountAmount')::numeric <> v_disc
       or (r ->> 'total')::numeric <> v_sub - v_disc or r ->> 'couponCode' <> 'CHKCUPON' then
      raise exception 'FALLO: cupon 15%% mal aplicado: %', r;
    end if;
    select * into s from public.sales where id = r ->> 'saleId';
    if s.total <> v_sub - v_disc or s.discount_type <> 'pct' or s.discount_value <> 15 or s.discount_amount <> v_disc
       or s.notes <> '[WEB] WhatsApp: 2281 000000 | Cupón CHKCUPON (-15%)' then
      raise exception 'FALLO: venta con cupon mal guardada: % / %', s.notes, s.total;
    end if;

    set local role anon;
    r := public.create_web_order('Cliente Chk', '2281000000', v_date, 'wholesale',
      jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 4)), 'CHKMEDIO');
    reset role;
    select * into s from public.sales where id = r ->> 'saleId';
    if s.notes <> '[WEB] WhatsApp: 2281000000 | Pedido mayorista | Cupón CHKMEDIO (-7.5%)' then
      raise exception 'FALLO: nota con porcentaje decimal incorrecta: %', s.notes;
    end if;

    set local role anon;
    r := public.create_web_order('Cliente Chk', '2281000000', v_date, 'retail', v_ok, 'CHKGRATIS');
    reset role;
    if (r ->> 'total')::numeric <> 0 or (r ->> 'discountAmount')::numeric <> p_retail then
      raise exception 'FALLO: cupon del 100%% no deja el total en 0: %', r;
    end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 3;
  end;

  ---------------------------------------------------------- limpieza de textos
  begin
    set local role anon;
    r := public.create_web_order(E'Chk | Pérez\nX', 'tel: 2281-000000 abc', v_date, 'retail', v_ok, null);
    reset role;
    select * into s from public.sales where id = r ->> 'saleId';
    if position('|' in s.customer_name) > 0 or position(E'\n' in s.customer_name) > 0 then
      raise exception 'FALLO: el nombre conserva separadores: %', s.customer_name;
    end if;
    if s.notes <> '[WEB] WhatsApp: 2281-000000' then raise exception 'FALLO: telefono sin limpiar: %', s.notes; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 2;
  end;

  -- El personal logueado también puede usarla.
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    r := public.create_web_order('Cliente Chk', '2281000000', v_date, 'retail', v_ok, null);
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 1;
  end;

  ----------------------------------------------------------- pedidos rechazados
  for c in
    select * from (values
      ('nombre vacio',          '',           '2281000000', v_date,            'retail',    v_ok,                                              null::text, 'web_order:invalid_name'),
      ('nombre solo barras',    ' | ',        '2281000000', v_date,            'retail',    v_ok,                                              null,       'web_order:invalid_name'),
      ('telefono corto',        'Ana',        '1234567',    v_date,            'retail',    v_ok,                                              null,       'web_order:invalid_phone'),
      ('telefono nulo',         'Ana',        null,         v_date,            'retail',    v_ok,                                              null,       'web_order:invalid_phone'),
      ('lista inexistente',     'Ana',        '2281000000', v_date,            'otra',      v_ok,                                              null,       'web_order:invalid_price_list'),
      ('lista nula',            'Ana',        '2281000000', v_date,            null,        v_ok,                                              null,       'web_order:invalid_price_list'),
      ('fecha domingo',         'Ana',        '2281000000', v_sunday,          'retail',    v_ok,                                              null,       'web_order:invalid_date'),
      ('fecha de hoy',          'Ana',        '2281000000', v_today,           'retail',    v_ok,                                              null,       'web_order:invalid_date'),
      ('fecha pasada',          'Ana',        '2281000000', v_today - 5,       'retail',    v_ok,                                              null,       'web_order:invalid_date'),
      ('fecha muy lejana',      'Ana',        '2281000000', v_today + 90,      'retail',    v_ok,                                              null,       'web_order:invalid_date'),
      ('fecha nula',            'Ana',        '2281000000', null::date,        'retail',    v_ok,                                              null,       'web_order:invalid_date'),
      ('carrito vacio',         'Ana',        '2281000000', v_date,            'retail',    '[]'::jsonb,                                       null,       'web_order:empty_cart'),
      ('items no es lista',     'Ana',        '2281000000', v_date,            'retail',    '{"productId":"x","qty":1}'::jsonb,                null,       'web_order:empty_cart'),
      ('items nulo',            'Ana',        '2281000000', v_date,            'retail',    null::jsonb,                                       null,       'web_order:empty_cart'),
      ('producto inexistente',  'Ana',        '2281000000', v_date,            'retail',    '[{"productId":"no-existe","qty":1}]'::jsonb,      null,       'web_order:invalid_item'),
      ('producto sin id',       'Ana',        '2281000000', v_date,            'retail',    '[{"qty":1}]'::jsonb,                              null,       'web_order:invalid_item'),
      ('producto no publicado', 'Ana',        '2281000000', v_date,            'retail',    jsonb_build_array(jsonb_build_object('productId', coalesce(p_hidden, 'no-existe'), 'qty', 1)), null, 'web_order:invalid_item'),
      ('cantidad cero',         'Ana',        '2281000000', v_date,            'retail',    jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 0)),   null, 'web_order:invalid_qty'),
      ('cantidad decimal',      'Ana',        '2281000000', v_date,            'retail',    jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 1.5)), null, 'web_order:invalid_qty'),
      ('cantidad ausente',      'Ana',        '2281000000', v_date,            'retail',    jsonb_build_array(jsonb_build_object('productId', p_id)),             null, 'web_order:invalid_qty'),
      ('cantidad enorme',       'Ana',        '2281000000', v_date,            'retail',    jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 1000)), null, 'web_order:invalid_qty'),
      ('mayorista bajo minimo', 'Ana',        '2281000000', v_date,            'wholesale', jsonb_build_array(jsonb_build_object('productId', p_id, 'qty', 3)),   null, 'web_order:min_qty'),
      ('cupon inexistente',     'Ana',        '2281000000', v_date,            'retail',    v_ok,                                              'NOEXISTE', 'web_order:coupon_not_found')
    ) as t(label, nm, ph, d, pl, it, cp, expected)
  loop
    begin
      set local role anon;
      perform public.create_web_order(c.nm, c.ph, c.d, c.pl, c.it, c.cp);
      raise exception 'FALLO: [%] debia fallar con %', c.label, c.expected;
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg <> c.expected then
        raise exception 'FALLO: [%] esperaba % y fue %', c.label, c.expected, msg;
      end if;
      checks := checks + 1;
    end;
  end loop;

  select count(*) into n from public.sales where customer_name ilike '%chk%';
  if n <> 0 then raise exception 'FALLO: quedaron % filas de prueba', n; end if;
  checks := checks + 1;

  raise notice 'OK: % chequeos', checks;
end
$check$;
