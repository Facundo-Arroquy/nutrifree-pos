INSERT INTO business_users (id, email, name, role, active)
SELECT id, email, 'Facundo', 'admin', true
FROM auth.users
WHERE email = 'facundoarroquy.w@gmail.com';