-- Cierra el último acceso directo de anon a las tablas del negocio: el INSERT en sales.
--
-- Con 20261028000000_create_web_order.sql el checkout público ya no inserta en sales:
-- llama a create_web_order, que corre con los permisos del dueño. La política
-- anon_insert_web_orders (20261027210000_cerrar_acceso_anonimo.sql) deja de hacer falta.
--
-- ORDEN: aplicar DESPUÉS de desplegar el front que usa create_web_order. Si se aplica
-- antes, el checkout del front viejo (INSERT directo) deja de registrar pedidos. Las
-- pestañas abiertas con el front viejo fallan hasta que se recarguen.
--
-- Para volver atrás: recrear la política (ver 20261027210000_cerrar_acceso_anonimo.sql).

begin;

-- Seguro: sin la función no hay forma de crear pedidos web; abortar antes de cerrar el INSERT.
do $$
begin
  if to_regprocedure('public.create_web_order(text,text,date,text,jsonb,text)') is null then
    raise exception 'Falta public.create_web_order: aplicar primero 20261028000000_create_web_order.sql';
  end if;
end $$;

drop policy if exists "anon_insert_web_orders" on public.sales;

commit;
