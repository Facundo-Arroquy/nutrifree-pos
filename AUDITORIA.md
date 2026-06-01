# Auditorías — NutriFree POS

Queries de control periódico para detectar inconsistencias en la base de datos.

---

## 1. Cuenta Corriente — Créditos sin consumo

**¿Qué detecta?**
Pagos realizados con crédito (saldo a favor) aplicados a un pedido que no tienen
su cargo de consumo correspondiente. Si hay filas, el balance de ese cliente está inflado.

**Resultado esperado:** 0 filas.

**Frecuencia sugerida:** semanal o después de cada cierre de caja.

```sql
SELECT
    ap.customer_id,
    c.name,
    ap.sale_id,
    ap.amount,
    ap.date,
    ap.created_at
FROM account_payments ap
JOIN customers c ON ap.customer_id = c.id
WHERE ap.type             = 'payment'
  AND ap.payment_method   = 'balance'
  AND ap.sale_id          IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM account_payments ap2
    WHERE ap2.customer_id    = ap.customer_id
      AND ap2.type           = 'charge'
      AND ap2.payment_method = 'balance'
      AND ap2.sale_id        IS NULL
      AND ap2.amount         = ap.amount
      AND ap2.date           = ap.date
  )
ORDER BY ap.created_at DESC;
```

**Si devuelve filas**, ejecutar por cada fila:
```sql
INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
VALUES (gen_random_uuid(), '<customer_id>', null, <amount>, 'charge', 'balance', '<date>', 'Crédito consumido');
```

**Contexto:** bug detectado el 2026-05-20. La migración inicial corrigió 3 registros
(sih1ak2, vk18hgt, mh0skfv). El código en `registerPayment` fue corregido para
que no vuelva a ocurrir. Ver `CAMBIOS_2026-05-20.md`.

--- 

## 2. Cuenta Corriente — Balance calculado vs almacenado

**¿Qué detecta?**
Diferencia entre el campo `customers.balance` (campo en DB, no usado en display)
y el balance real calculado desde `account_payments`.

> Nota: `customers.balance` NO es el que se muestra en la app. La app usa `custBal()`
> que recalcula desde `account_payments`. Esta query es solo informativa.

```sql
SELECT
    c.id,
    c.name,
    c.balance                                                              AS balance_guardado,
    SUM(CASE WHEN ap.type = 'payment' THEN ap.amount ELSE -ap.amount END) AS balance_real,
    c.balance - SUM(CASE WHEN ap.type = 'payment' THEN ap.amount ELSE -ap.amount END) AS diferencia
FROM customers c
LEFT JOIN account_payments ap ON ap.customer_id = c.id
GROUP BY c.id, c.name, c.balance
HAVING c.balance != SUM(CASE WHEN ap.type = 'payment' THEN ap.amount ELSE -ap.amount END)
ORDER BY ABS(c.balance - SUM(CASE WHEN ap.type = 'payment' THEN ap.amount ELSE -ap.amount END)) DESC;
```

---

## 3. Ventas en cuenta sin movimiento en account_payments

**¿Qué detecta?**
Ventas cerradas con método de pago `account` que no tienen un cargo registrado
en `account_payments`. Indican que el cargo no se creó correctamente al cerrar la venta.

**Resultado esperado:** 0 filas.

```sql
SELECT s.id, s.customer_id, s.customer_name, s.total, s.created_at
FROM sales s
WHERE s.payment_method = 'account'
  AND s.status         = 'closed'
  AND NOT EXISTS (
    SELECT 1 FROM account_payments ap
    WHERE ap.sale_id    = s.id
      AND ap.type       = 'charge'
  )
ORDER BY s.created_at DESC;
```

---

## Historial de ejecuciones

| Fecha | Query | Resultado | Acción tomada |
|-------|-------|-----------|---------------|
| 2026-05-20 | Query 1 | 3 filas (sih1ak2, vk18hgt, mh0skfv) | INSERT de 3 cargos de consumo |
