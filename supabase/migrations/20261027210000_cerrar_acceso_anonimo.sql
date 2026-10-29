-- Cierra el acceso anónimo abierto a las tablas del negocio.
--
-- Problema: nueve tablas tenían una política "allow_all_*" (ALL, USING true) para
-- el rol público. Con la clave anon, que viaja en el JS de la web, cualquiera
-- podía leer y modificar ventas, clientes, gastos, pagos de cuenta corriente,
-- productos, recetas e ingredientes. La app del personal NO depende de esas
-- políticas: usa "solo_autenticados" (creada en supabase-rls.sql), que se conserva.
--
-- Lo que el público necesita de verdad, y se deja:
--   * leer categories y products del menú (anon_read_categories / anon_read_active_products)
--   * insertar el pedido web desde el checkout de /menu y /menu-mayorista (sales)
-- El webhook de MercadoPago usa la service role y no pasa por RLS.
--
-- Para volver atrás (no recomendado): recrear las políticas borradas, por ejemplo
--   create policy "allow_all_sales" on public.sales for all using (true) with check (true);

begin;

-- 0. Seguro: no seguir si falta "solo_autenticados" en alguna tabla, porque al
--    borrar allow_all_* el personal se quedaría sin acceso.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sales', 'customers', 'expenses', 'account_payments', 'products',
    'recipes', 'ingredients', 'categories', 'expense_categories'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'solo_autenticados'
    ) then
      raise exception 'Falta la politica solo_autenticados en public.%: migracion abortada', t;
    end if;
  end loop;
end $$;

-- 1. Pedido web: el público solo puede INSERTAR una venta nueva, abierta, sin
--    cliente, sin pago y sin facturación, con la marca [WEB] en las notas
--    (WEB_ORDER_MARKER en src/utils/webOrder.js). No puede leerla ni modificarla.
create policy "anon_insert_web_orders"
on public.sales for insert to anon
with check (
  status = 'open'
  and customer_id is null
  and payment_method is null
  and paid_at is null
  and billing_status is null
  and coalesce(needs_billing, false) = false
  and price_list in ('retail', 'wholesale')
  and left(coalesce(notes, ''), 5) = '[WEB]'
  and coalesce(total, 0) >= 0
);

-- 2. Menú: leer todos los productos activos. Antes alcanzaba con show_in_menu,
--    pero el menú también lee el stock de los componentes de cada kit y esos
--    componentes están activos sin estar publicados (hoy los lograba por allow_all_products).
alter policy "anon_read_active_products" on public.products
using (active = true);

-- 3. Borrar las políticas abiertas.
drop policy if exists "allow_all_sales" on public.sales;
drop policy if exists "allow_all_customers" on public.customers;
drop policy if exists "allow_all_expenses" on public.expenses;
drop policy if exists "allow_all_account_payments" on public.account_payments;
drop policy if exists "allow_all_products" on public.products;
drop policy if exists "allow_all_recipes" on public.recipes;
drop policy if exists "allow all" on public.ingredients;
drop policy if exists "allow_all_ingredients" on public.ingredients;
drop policy if exists "allow_all_categories" on public.categories;
drop policy if exists "allow_all_expense_categories" on public.expense_categories;

commit;
