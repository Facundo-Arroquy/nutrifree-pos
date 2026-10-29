-- Verificación del estado FINAL del acceso anónimo: 20261027210000_cerrar_acceso_anonimo.sql
-- más 20261028000100_cerrar_insert_anonimo_sales.sql (anon no inserta ni siquiera en sales;
-- el pedido web se crea con create_web_order, que se verifica en create_web_order.check.sql).
--
-- Ejecutar DESPUÉS de aplicar esas migraciones (SQL Editor, psql o MCP). No deja datos:
-- cada prueba que escribe corre en un sub-bloque que se revierte (SQLSTATE P0099).
-- Ante el primer chequeo incumplido falla con "FALLO: ..."; si todo está bien
-- termina con NOTICE "OK: N chequeos".

do $check$
declare
  n int;
  n_total int;
  checks int := 0;
  t text;
  v text;
  tablas text[] := array[
    'sales', 'customers', 'expenses', 'account_payments', 'products',
    'recipes', 'ingredients', 'categories', 'expense_categories'
  ];
  -- Columnas de sales para los inserts directos de prueba.
  cols text := 'id, status, customer_id, payment_method, paid_at, billing_status, needs_billing, price_list, notes, total';
begin
  ---------------------------------------------------------------- estructura
  foreach t in array tablas loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'solo_autenticados') then
      raise exception 'FALLO: falta solo_autenticados en %', t;
    end if;
    checks := checks + 1;
  end loop;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = any (tablas) and policyname ilike 'allow%';
  if n <> 0 then raise exception 'FALLO: quedan % politicas allow_*', n; end if;
  checks := checks + 1;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'sales' and policyname = 'anon_insert_web_orders';
  if n <> 0 then raise exception 'FALLO: sigue la politica anon_insert_web_orders'; end if;
  checks := checks + 1;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = any (tablas)
    and roles && array['anon', 'public']::name[]
    and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
    and policyname <> 'anon_read_categories';
  if n <> 0 then raise exception 'FALLO: quedan % politicas abiertas para anon/public', n; end if;
  checks := checks + 1;

  ------------------------------------------------- anon no lee ni toca nada
  foreach t in array array['sales', 'customers', 'expenses', 'account_payments', 'recipes', 'ingredients', 'expense_categories'] loop
    begin
      set local role anon;
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then raise exception 'FALLO: anon ve % filas de %', n, t; end if;
      execute format('delete from public.%I', t);
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'FALLO: anon borro % filas de %', n, t; end if;
      raise exception using errcode = 'P0099', message = 'rollback';
    exception when sqlstate 'P0099' then
      checks := checks + 2;
    end;
  end loop;

  begin
    set local role anon;
    update public.sales set total = total;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: anon modifico % ventas', n; end if;
    update public.customers set name = name;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: anon modifico % clientes', n; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 2;
  end;

  begin
    set local role anon;
    insert into public.customers (id, name) values ('chk-cliente', 'chk');
    raise exception 'FALLO: anon pudo insertar un cliente';
  exception when insufficient_privilege then
    checks := checks + 1;
  end;

  ------------------------------------------------ anon sigue viendo el menú
  begin
    set local role anon;
    select count(*) into n from public.products where active is not true;
    if n <> 0 then raise exception 'FALLO: anon ve % productos inactivos', n; end if;
    select count(*) into n from public.products where active;
    if n = 0 then raise exception 'FALLO: anon no ve productos activos'; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 2;
  end;

  -- Componentes de kits: activos pero no publicados. Deben seguir visibles.
  select count(*) into n_total from public.products where active and show_in_menu is not true;
  begin
    set local role anon;
    select count(*) into n from public.products where active and show_in_menu is not true;
    if n <> n_total then raise exception 'FALLO: anon ve % de % productos activos no publicados (componentes de kits)', n, n_total; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 1;
  end;

  select count(*) into n_total from public.categories;
  begin
    set local role anon;
    select count(*) into n from public.categories;
    if n <> n_total then raise exception 'FALLO: anon ve % de % categorias', n, n_total; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 1;
  end;

  --------------------------------------------- anon no inserta directo en sales
  -- Ni siquiera un pedido web válido: se crea con create_web_order.
  begin
    set local role anon;
    insert into public.sales (id, status, customer_id, payment_method, paid_at, billing_status, needs_billing, price_list, notes, total)
    values ('chk-web-1', 'open', null, null, null, null, false, 'retail', '[WEB] WhatsApp: 2281000000', 1000);
    raise exception 'FALLO: anon pudo insertar un pedido directo en sales';
  exception when insufficient_privilege then
    checks := checks + 1;
  end;

  -- Variantes (válidas o no): ninguna entra por INSERT directo.
  foreach v in array array[
    $v$'chk-x1', 'closed', null, null, null, null, false, 'retail', '[WEB] a', 100$v$,     -- estado distinto de open
    $v$'chk-x2', 'open', null, 'cash', null, null, false, 'retail', '[WEB] a', 100$v$,     -- con medio de pago
    $v$'chk-x3', 'open', 'cli-1', null, null, null, false, 'retail', '[WEB] a', 100$v$,    -- atribuido a un cliente
    $v$'chk-x4', 'open', null, null, now(), null, false, 'retail', '[WEB] a', 100$v$,      -- ya pagado
    $v$'chk-x5', 'open', null, null, null, 'issued', false, 'retail', '[WEB] a', 100$v$,   -- ya facturado
    $v$'chk-x6', 'open', null, null, null, null, true, 'retail', '[WEB] a', 100$v$,        -- pide facturación
    $v$'chk-x7', 'open', null, null, null, null, false, 'otra', '[WEB] a', 100$v$,         -- lista de precios inexistente
    $v$'chk-x8', 'open', null, null, null, null, false, 'retail', 'sin marca', 100$v$,     -- sin la marca [WEB]
    $v$'chk-x9', 'open', null, null, null, null, false, 'retail', '[WEB] a', -1$v$         -- total negativo
  ] loop
    begin
      set local role anon;
      execute format('insert into public.sales (%s) values (%s)', cols, v);
      raise exception 'FALLO: anon pudo insertar directo en sales: %', v;
    exception when insufficient_privilege then
      checks := checks + 1;
    end;
  end loop;

  ------------------------------------------- el personal logueado no pierde nada
  foreach t in array tablas loop
    execute format('select count(*) from public.%I', t) into n_total;
    begin
      perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      set local role authenticated;
      execute format('select count(*) from public.%I', t) into n;
      if n <> n_total then raise exception 'FALLO: authenticated ve % de % filas de %', n, n_total, t; end if;
      raise exception using errcode = 'P0099', message = 'rollback';
    exception when sqlstate 'P0099' then
      checks := checks + 1;
    end;
  end loop;

  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    -- El personal puede cargar una venta en cualquier estado y modificarla.
    insert into public.sales (id, status, customer_id, payment_method, price_list, notes, total)
    values ('chk-staff-1', 'closed', null, 'cash', 'retail', 'chk', 500);
    update public.sales set total = 600 where id = 'chk-staff-1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALLO: authenticated no pudo modificar su venta'; end if;
    delete from public.sales where id = 'chk-staff-1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALLO: authenticated no pudo borrar su venta'; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then
    checks := checks + 3;
  end;

  raise notice 'OK: % chequeos', checks;
end
$check$;
