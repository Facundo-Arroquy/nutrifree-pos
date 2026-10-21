-- Datos 100% ficticios para Supabase local.
-- Nunca agregar aquí exportaciones ni credenciales de producción.
-- Contraseña común de los usuarios locales: NutrifreeDev2026!

insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change,
  phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'admin@nutrifree.local', crypt('NutrifreeDev2026!', gen_salt('bf')), now(),
   '', '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{"name":"Admin Local"}', now(), now(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'ventas@nutrifree.local', crypt('NutrifreeDev2026!', gen_salt('bf')), now(),
   '', '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{"name":"Ventas Local"}', now(), now(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'cocina@nutrifree.local', crypt('NutrifreeDev2026!', gen_salt('bf')), now(),
   '', '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{"name":"Cocina Local"}', now(), now(), 'authenticated', 'authenticated');

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  ('20000000-0000-0000-0000-000000000001', 'admin@nutrifree.local', '10000000-0000-0000-0000-000000000001',
   '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@nutrifree.local","email_verified":true,"phone_verified":false}',
   'email', now(), now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'ventas@nutrifree.local', '10000000-0000-0000-0000-000000000002',
   '{"sub":"10000000-0000-0000-0000-000000000002","email":"ventas@nutrifree.local","email_verified":true,"phone_verified":false}',
   'email', now(), now(), now()),
  ('20000000-0000-0000-0000-000000000003', 'cocina@nutrifree.local', '10000000-0000-0000-0000-000000000003',
   '{"sub":"10000000-0000-0000-0000-000000000003","email":"cocina@nutrifree.local","email_verified":true,"phone_verified":false}',
   'email', now(), now(), now());

-- El trigger crea business_users; ajustamos explícitamente los roles de prueba.
update public.business_users set role = 'admin' where email = 'admin@nutrifree.local';
update public.business_users set role = 'vendor' where email = 'ventas@nutrifree.local';
update public.business_users set role = 'cocina' where email = 'cocina@nutrifree.local';

insert into public.categories (name) values
  ('Viandas'), ('Panadería'), ('Postres'), ('Bebidas'), ('Otros');

insert into public.products (
  id, name, category, price_retail, price_wholesale, unit, stock,
  active, description, kit_items, is_favorite, show_in_menu, freezable
)
values
  ('dev-product-1', 'Milanesa con puré', 'Viandas', 8500, 7200, 'unidad', 12, true,
   'Producto ficticio de desarrollo', '[]', true, true, true),
  ('dev-product-2', 'Pollo al horno con verduras', 'Viandas', 7900, 6800, 'unidad', 8, true,
   'Producto ficticio de desarrollo', '[]', false, true, true),
  ('dev-product-3', 'Tarta de verduras', 'Viandas', 6900, 5900, 'unidad', 6, true,
   'Producto ficticio de desarrollo', '[]', false, true, true),
  ('dev-product-4', 'Brownie de chocolate', 'Postres', 3200, 2700, 'unidad', 20, true,
   'Producto ficticio de desarrollo', '[]', true, true, true);

insert into public.ingredients (
  id, name, category, unit, stock, stock_min, unit_cost, supplier, notes
)
values
  ('30000000-0000-0000-0000-000000000001', 'Papa de prueba', 'Verduras', 'kg', 20, 5, 1200, 'Proveedor ficticio', ''),
  ('30000000-0000-0000-0000-000000000002', 'Pollo de prueba', 'Carnes', 'kg', 15, 4, 4500, 'Proveedor ficticio', 'Solo para desarrollo'),
  ('30000000-0000-0000-0000-000000000003', 'Chocolate de prueba', 'Repostería', 'kg', 8, 2, 8200, 'Proveedor ficticio', '');

insert into public.customers (
  id, name, phone, address, notes, price_list, balance,
  discount_pct, email, cuit, default_billing
)
values
  ('dev-customer-1', 'Cliente Minorista Ficticio', '2281-000001', 'Dirección de prueba 123',
   'Sin información real', 'retail', 0, 0, 'cliente1@example.test', '', false),
  ('dev-customer-2', 'Comercio Mayorista Ficticio', '2281-000002', 'Dirección de prueba 456',
   'Cuenta exclusiva de desarrollo', 'wholesale', 0, 5, 'cliente2@example.test', '30-00000000-0', true);

insert into public.sales (
  id, customer_id, customer_name, items, total, price_list,
  payment_method, status, notes, created_at, delivery_date
)
values
  ('dev-sale-1', 'dev-customer-1', 'Cliente Minorista Ficticio',
   '[{"productId":"dev-product-1","name":"Milanesa con puré","qty":1,"price":8500,"subtotal":8500}]',
   8500, 'retail', 'cash', 'closed', 'Venta ficticia', now() - interval '1 day', current_date),
  ('dev-sale-2', 'dev-customer-2', 'Comercio Mayorista Ficticio',
   '[{"productId":"dev-product-2","name":"Pollo al horno con verduras","qty":2,"price":6800,"subtotal":13600}]',
   13600, 'wholesale', 'transfer', 'open', 'Pedido ficticio', now(), current_date + 1);

insert into public.weekly_menus (id, week_start, days, created_by)
values (
  '40000000-0000-0000-0000-000000000001',
  date_trunc('week', current_date)::date,
  jsonb_build_object(
    'monday', jsonb_build_object('lunch', 'Milanesa con puré', 'dinner', 'Tarta de verduras'),
    'tuesday', jsonb_build_object('lunch', 'Pollo al horno con verduras', 'dinner', 'Milanesa con puré'),
    'wednesday', jsonb_build_object('lunch', 'Tarta de verduras', 'dinner', 'Pollo al horno con verduras'),
    'thursday', jsonb_build_object('lunch', 'Milanesa con puré', 'dinner', 'Tarta de verduras'),
    'friday', jsonb_build_object('lunch', 'Pollo al horno con verduras', 'dinner', 'Milanesa con puré')
  ),
  '10000000-0000-0000-0000-000000000001'
);
