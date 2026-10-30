-- Reconciliación de la cuenta corriente de proveedores — APLICADA 2026-08-09
-- ---------------------------------------------------------------------------
-- Contexto: hasta ahora sólo los gastos cargados como "Pendiente" generaban un
-- cargo en supplier_payments. Los gastos cargados directamente como "Pagado"
-- (628 de 629) no entraban a la cuenta, pero sí se registraban pagos manuales
-- contra ellos. Resultado: saldos "a favor" falsos (Escudero Natalia +797.947,
-- Daiana Crespo +742.147) y saldos residuales por ediciones posteriores del
-- total de un gasto ya pagado (Sierra, Real, Descartables pato).
--
-- Objetivo acordado: todos los saldos en cero, salvo MCA Congelados que queda
-- con $19.485 a favor nuestro.
--
-- No se borró ni modificó ningún movimiento histórico: los ajustes son
-- movimientos nuevos y auditables (ver el bloque ROLLBACK al final).

-- ── Paso 0 (DDL): habilitar pagos parciales ────────────────────────────────
-- Existía un índice único que permitía UN SOLO pago por gasto. Venía del modelo
-- viejo (evitar el pago duplicado) y hace imposible el pago parcial. La garantía
-- de no pagar de más ahora la da la imputación en src/utils/supplierAccount.js.
-- Aplicado como migración `allow_partial_supplier_payments`.
drop index if exists uniq_supplier_payment_per_expense;
-- uniq_sp_expense_charge (un cargo por gasto) SE MANTIENE: es la invariante del
-- modelo nuevo.

-- ── Paso 1: imputar el saldo a favor de MCA a su gasto pendiente ───────────
-- MCA tenía un pago "a favor" de $138.735 sin imputar y un gasto pendiente de
-- $119.250 (Pechuga, 2026-08-03). Se salda el gasto contra ese crédito con el
-- par payment + charge que usa la app (efecto neto en el saldo: 0).
-- Queda a favor: 138.735 − 119.250 = $19.485.
with mca as (select id from suppliers where name = 'MCA Congelados'),
     pend as (
       select e.id, e.total
       from expenses e join mca on e.supplier_id = mca.id
       where e.payment_status = 'pending'
       order by e.date
       limit 1
     )
insert into supplier_payments (supplier_id, expense_id, amount, type, payment_method, date, notes)
select mca.id, pend.id, pend.total, 'payment', 'balance', current_date, 'Saldo a favor aplicado' from mca, pend
union all
select mca.id, null,    pend.total, 'charge',  'balance', current_date, 'Saldo a favor consumido' from mca, pend;

update expenses e
set payment_status = 'paid'
from suppliers s
where e.supplier_id = s.id and s.name = 'MCA Congelados' and e.payment_status = 'pending';

-- ── Paso 2: llevar a cero el saldo del resto de los proveedores ────────────
-- Debemos (saldo < 0) → pago de ajuste. A favor (saldo > 0) → cargo de ajuste.
with saldos as (
  select sp.supplier_id,
         sum(case when sp.type = 'payment' then sp.amount else -sp.amount end) as saldo
  from supplier_payments sp
  group by sp.supplier_id
)
insert into supplier_payments (supplier_id, expense_id, amount, type, payment_method, date, notes)
select saldos.supplier_id, null, abs(saldos.saldo),
       case when saldos.saldo < 0 then 'payment' else 'charge' end,
       null, current_date,
       'Ajuste de apertura — reconciliación de cuenta corriente'
from saldos
join suppliers s on s.id = saldos.supplier_id
where saldos.saldo <> 0
  and s.name <> 'MCA Congelados';

-- ── Paso 3: imputar los ajustes al gasto que los originó ───────────────────
-- Los ajustes del paso 2 con signo "debemos" resultaron ser exactamente la
-- diferencia de 4 gastos cuyo total se editó después de pagarlos. Dejarlos
-- sueltos habría mostrado esos gastos como "Parcial" con el saldo del proveedor
-- en cero: se reemplazan por pagos imputados al gasto (mismo efecto en el saldo).
delete from supplier_payments
where date = current_date
  and type = 'payment'
  and notes = 'Ajuste de apertura — reconciliación de cuenta corriente';

with calc as (
  select e.id as expense_id, e.supplier_id,
         (select sum(amount) from supplier_payments sp where sp.expense_id = e.id and sp.type = 'charge')
         - coalesce((select sum(amount) from supplier_payments sp where sp.expense_id = e.id and sp.type = 'payment'), 0) as falta
  from expenses e
  where e.supplier_id is not null
)
insert into supplier_payments (supplier_id, expense_id, amount, type, payment_method, date, notes)
select supplier_id, expense_id, falta, 'payment', null, current_date,
       'Ajuste de apertura — saldo reconciliado'
from calc
where falta is not null and falta > 0;

-- ── Controles (resultado real de la corrida) ───────────────────────────────
-- Saldos <> 0  → sólo MCA Congelados: 19485.00  ✓
-- Gastos con `payment_status` desalineado del estado derivado → 0 filas  ✓

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- DELETE FROM supplier_payments
-- WHERE date = '2026-08-09'
--   AND notes IN ('Ajuste de apertura — reconciliación de cuenta corriente',
--                 'Ajuste de apertura — saldo reconciliado',
--                 'Saldo a favor aplicado',
--                 'Saldo a favor consumido');
-- UPDATE expenses SET payment_status = 'pending' WHERE id = 'oop89up';
-- CREATE UNIQUE INDEX uniq_supplier_payment_per_expense ON public.supplier_payments
--   USING btree (expense_id) WHERE ((type = 'payment') AND (expense_id IS NOT NULL));
