-- Migración: customer.balance → account_payments
-- Convierte el campo balance de cada cliente en movimientos de cuenta corriente trazables.
-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor.

-- 1. Clientes con balance positivo (crédito a favor) → registro de tipo "payment"
INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
SELECT
  gen_random_uuid(),
  id,
  NULL,
  balance,
  'payment',
  NULL,
  now()::date,
  'Saldo inicial migrado'
FROM customers
WHERE balance > 0;

-- 2. Clientes con balance negativo (deuda previa) → registro de tipo "charge"
INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
SELECT
  gen_random_uuid(),
  id,
  NULL,
  ABS(balance),
  'charge',
  NULL,
  now()::date,
  'Deuda inicial migrada'
FROM customers
WHERE balance < 0;

-- 3. Resetear todos los balances a 0
UPDATE customers SET balance = 0 WHERE balance != 0;

-- Verificación: saldos resultantes por cliente (deben coincidir con los saldos actuales)
SELECT
  c.name,
  c.balance AS balance_nuevo,
  COALESCE(SUM(CASE WHEN ap.type = 'payment' THEN ap.amount ELSE -ap.amount END), 0) AS movimientos_netos,
  c.balance + COALESCE(SUM(CASE WHEN ap.type = 'payment' THEN ap.amount ELSE -ap.amount END), 0) AS saldo_total
FROM customers c
LEFT JOIN account_payments ap ON ap.customer_id = c.id
GROUP BY c.id, c.name, c.balance
ORDER BY saldo_total;
