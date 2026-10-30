# Backend — Consistencia financiera de toda la plataforma (rediseño)

> Plan por fases para rediseñar el backend de **todos los flujos de dinero**
> en NUTRIFREE: POS, Kanban, Caja, Cuenta Corriente de clientes y proveedores,
> Gastos y Reportes. Cubre los bugs detallados en
> [BUGS_DINERO_PLATAFORMA.md](BUGS_DINERO_PLATAFORMA.md).
>
> La pasarela de pago tiene su propio rediseño en
> [BACKEND_PASARELA_PAGO.md](BACKEND_PASARELA_PAGO.md); este documento se cruza
> con ella en las máquinas de estados de `sales` y en la integración con caja.

---

## 0. Principios

1. **Atomicidad por agregado.** Toda operación de dinero (venta, pago, cobranza, cierre de turno) ocurre en **una sola transacción Postgres**, usualmente expuesta como una RPC.
2. **No mutar desde el cliente, orquestar desde el cliente.** El frontend invoca RPCs; nunca hace múltiples `INSERT`/`UPDATE` encadenados que comprometan la consistencia.
3. **State machines explícitas.** Las transiciones permitidas de `sales.status`, `expenses.payment_status`, `cash_shifts.status` están codificadas en SQL.
4. **Soft delete por defecto.** Borrar dinero retroactivamente está prohibido salvo a través de compensaciones (refund, cancellation).
5. **Saldos derivados, no almacenados.** El saldo de un cliente o proveedor es siempre un `SUM(...)` sobre la tabla de movimientos. Si guardamos un cache, está respaldado por trigger.
6. **Auditoría no opcional.** Cada mutación de dinero produce una fila en `audit_log` en la misma transacción.
7. **Single source of truth por concepto.** Una función para `customerBalance(id)`; una para `expectedCash(shiftId)`; una para `revenue(from, to)`. Frontend y backend usan la misma vista.
8. **Numeric, no float.** Todo monto en SQL es `numeric(14,2)`. Toda operación en JS pasa por `roundMoney(x) = Math.round(x*100)/100` antes de persistir.

---

## 1. Modelo de datos — convergencia

### 1.1 Migraciones de saneamiento

```sql
-- ── 1) Tipos monetarios consistentes ─────────────────────────────────────
ALTER TABLE sales            ALTER COLUMN total           TYPE numeric(14,2);
ALTER TABLE sales            ALTER COLUMN discount_amount TYPE numeric(14,2);
ALTER TABLE account_payments ALTER COLUMN amount          TYPE numeric(14,2);
ALTER TABLE supplier_payments ALTER COLUMN amount         TYPE numeric(14,2);
ALTER TABLE expenses         ALTER COLUMN total           TYPE numeric(14,2);
ALTER TABLE cash_shifts      ALTER COLUMN initial_cash    TYPE numeric(14,2);
-- (sales_cash, sales_transfer, etc.)

-- ── 2) Constraints de invariantes ───────────────────────────────────────
ALTER TABLE sales
  ADD CONSTRAINT sales_total_positive CHECK (total >= 0),
  ADD CONSTRAINT sales_discount_within_subtotal CHECK (discount_amount >= 0),
  ADD CONSTRAINT sales_account_requires_customer
    CHECK (payment_method <> 'account' OR customer_id IS NOT NULL);

ALTER TABLE account_payments
  ADD CONSTRAINT ap_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT ap_type_valid CHECK (type IN ('charge','payment'));

ALTER TABLE supplier_payments
  ADD CONSTRAINT sp_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT sp_type_valid CHECK (type IN ('charge','payment'));

-- ── 3) Un solo turno abierto a la vez ───────────────────────────────────
CREATE UNIQUE INDEX cash_shifts_one_open
  ON cash_shifts (status) WHERE status = 'open';

-- ── 4) Foreign keys explícitas (soft-delete-friendly) ──────────────────
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_customer_id_fkey,
  ADD CONSTRAINT sales_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE SET NULL;

ALTER TABLE account_payments
  DROP CONSTRAINT IF EXISTS account_payments_customer_id_fkey,
  ADD CONSTRAINT account_payments_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE RESTRICT;  -- prohibido borrar cliente con movimientos

-- ── 5) Soft delete ─────────────────────────────────────────────────────
ALTER TABLE customers  ADD COLUMN deleted_at timestamptz;
ALTER TABLE suppliers  ADD COLUMN deleted_at timestamptz;
ALTER TABLE expenses   ADD COLUMN deleted_at timestamptz;

CREATE INDEX customers_active_idx ON customers (id) WHERE deleted_at IS NULL;
CREATE INDEX suppliers_active_idx ON suppliers (id) WHERE deleted_at IS NULL;

-- ── 6) Auditoría reforzada de cambios de precio ────────────────────────
ALTER TABLE sales
  ADD COLUMN created_by text,        -- user que cobró
  ADD COLUMN closed_by  text,        -- user que pasó a closed
  ADD COLUMN cash_shift_id uuid REFERENCES cash_shifts(id);

-- ── 7) Cash shift: separar ventas de cobros CC y dejar lugar para MP ──
ALTER TABLE cash_shifts
  ADD COLUMN sales_mp                numeric(14,2) DEFAULT 0,
  ADD COLUMN account_collected_cash  numeric(14,2) DEFAULT 0,
  ADD COLUMN account_collected_transfer numeric(14,2) DEFAULT 0,
  ADD COLUMN account_collected_card  numeric(14,2) DEFAULT 0,
  ADD COLUMN expenses_transfer       numeric(14,2) DEFAULT 0,
  ADD COLUMN expenses_card           numeric(14,2) DEFAULT 0;
```

### 1.2 Una sola visión del balance del cliente

```sql
CREATE OR REPLACE VIEW v_customer_balance AS
SELECT c.id                                          AS customer_id,
       coalesce(sum(CASE WHEN ap.type='payment' THEN  ap.amount
                         WHEN ap.type='charge'  THEN -ap.amount END), 0)
       AS balance
FROM customers c
LEFT JOIN account_payments ap ON ap.customer_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

-- Same for suppliers
CREATE OR REPLACE VIEW v_supplier_balance AS
SELECT s.id AS supplier_id,
       coalesce(sum(CASE WHEN sp.type='payment' THEN  sp.amount
                         WHEN sp.type='charge'  THEN -sp.amount END), 0)
       AS balance
FROM suppliers s
LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id;
```

Migración del `customer.balance` legado:

```sql
-- Espejar la deuda inicial como un account_payment irreversible y poner balance a 0.
INSERT INTO account_payments (id, customer_id, amount, type, payment_method, date, notes, created_at)
SELECT gen_random_uuid(),
       c.id,
       abs(c.balance),
       CASE WHEN c.balance < 0 THEN 'charge' ELSE 'payment' END,
       'opening',
       current_date,
       'Saldo apertura (migrado)',
       now()
FROM customers c
WHERE c.balance IS NOT NULL AND c.balance <> 0;

UPDATE customers SET balance = 0 WHERE balance IS NOT NULL;
```

---

## 2. Máquina de estados de `sales` unificada

```
                              (POS cobra)            (Kanban cobra)
                                  │                       │
                                  ▼                       ▼
                                paid ◀───── pending_payment (MP)
                                  │
                                  ▼
   open ───▶ preparing ──▶ ready ──▶ closed ──▶ delivered
     │           │           │         ▲                │
     │           │           │         │                │
     └───────────┴───────────┴─────────┘                ▼
                                                    refunded
                       cancelled (compensa stock y deuda)
```

Encapsulada en una función:

```sql
CREATE FUNCTION assert_sale_transition(p_from text, p_to text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
    -- Online (pasarela)
    (p_from = 'pending_payment' AND p_to IN ('paid','cancelled')) OR
    (p_from = 'paid'            AND p_to IN ('ready','refunded','cancelled')) OR
    -- POS / Kanban
    (p_from = 'open'            AND p_to IN ('preparing','closed','cancelled')) OR
    (p_from = 'preparing'       AND p_to IN ('ready','closed','cancelled')) OR
    (p_from = 'ready'           AND p_to IN ('closed','delivered','cancelled','refunded')) OR
    (p_from = 'closed'          AND p_to IN ('delivered','refunded')) OR
    (p_from = 'delivered'       AND p_to =  'refunded')
  ) THEN
    RAISE EXCEPTION 'Transición inválida sales.status: % → %', p_from, p_to;
  END IF;
END $$;
```

Todas las mutaciones de `sales.status` la usan.

---

## 3. RPC `registrar_venta_completa` — corazón del POS y el Kanban

```sql
CREATE FUNCTION registrar_venta_completa(
  p_sale           jsonb,        -- shape de sales (sin id si nueva)
  p_stock_deltas   jsonb,        -- [{id, delta}]
  p_account_charge jsonb         -- null o {customer_id, amount, sale_id, notes}
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id uuid;
  v_delta   jsonb;
  v_shift_id uuid;
BEGIN
  -- 0) Validar invariantes en input
  IF (p_sale->>'total')::numeric < 0 THEN
    RAISE EXCEPTION 'Total negativo no permitido';
  END IF;

  -- 1) Resolver turno abierto (si existe). Falla si no hay turno y el método requiere caja.
  SELECT id INTO v_shift_id FROM cash_shifts WHERE status = 'open' FOR SHARE;
  IF v_shift_id IS NULL AND p_sale->>'paymentMethod' IN ('cash','transfer','card') THEN
    RAISE EXCEPTION 'No hay turno de caja abierto';
  END IF;

  -- 2) Insertar la sale
  v_sale_id := coalesce((p_sale->>'id')::uuid, gen_random_uuid());
  INSERT INTO sales (id, customer_id, customer_name, items, total, price_list,
                     payment_method, status, notes, created_at, paid_at,
                     discount_type, discount_value, discount_amount,
                     delivery_date, needs_billing, billing_status,
                     created_by, cash_shift_id)
  VALUES (
    v_sale_id,
    nullif(p_sale->>'customerId','')::uuid,
    p_sale->>'customerName',
    p_sale->'items',
    (p_sale->>'total')::numeric,
    p_sale->>'priceList',
    p_sale->>'paymentMethod',
    p_sale->>'status',
    p_sale->>'notes',
    coalesce((p_sale->>'createdAt')::timestamptz, now()),
    nullif(p_sale->>'paidAt','')::timestamptz,
    p_sale->>'discountType',
    (p_sale->>'discountValue')::numeric,
    (p_sale->>'discountAmount')::numeric,
    nullif(p_sale->>'deliveryDate','')::date,
    coalesce((p_sale->>'needsBilling')::bool, false),
    p_sale->>'billingStatus',
    p_sale->>'createdBy',
    v_shift_id
  );

  -- 3) Descontar stock atómicamente
  FOR v_delta IN SELECT * FROM jsonb_array_elements(p_stock_deltas) LOOP
    UPDATE products
    SET stock = stock - (v_delta->>'delta')::numeric
    WHERE id = (v_delta->>'id')::uuid
      AND stock >= (v_delta->>'delta')::numeric;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', v_delta->>'id';
    END IF;
    INSERT INTO stock_movements (product_id, qty, type, notes)
    VALUES ((v_delta->>'id')::uuid, -(v_delta->>'delta')::numeric, 'sale', v_sale_id::text);
  END LOOP;

  -- 4) Charge de cuenta corriente si corresponde
  IF p_account_charge IS NOT NULL THEN
    INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
    VALUES (
      gen_random_uuid(),
      (p_account_charge->>'customer_id')::uuid,
      v_sale_id,
      (p_account_charge->>'amount')::numeric,
      'charge', null, current_date,
      coalesce(p_account_charge->>'notes', '')
    );
  END IF;

  -- 5) Audit log
  INSERT INTO audit_log (action, scope, detail, created_at)
  VALUES ('venta', 'pos', jsonb_build_object('sale_id', v_sale_id, 'total', p_sale->>'total'), now());

  RETURN v_sale_id;
END $$;
```

El POS y el Kanban hacen **una sola llamada** y se acabaron los estados intermedios.

---

## 4. RPC `cancelar_pedido` con reversión

```sql
CREATE FUNCTION cancelar_pedido(p_sale_id uuid, p_user text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item jsonb;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  PERFORM assert_sale_transition(v_sale.status, 'cancelled');

  -- Revertir stock (excepto para pedidos online ya pagados, que requieren refund)
  IF v_sale.payment_method <> 'mercadopago' OR v_sale.status NOT IN ('paid','ready') THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale.items) LOOP
      UPDATE products SET stock = stock + (v_item->>'qty')::numeric
       WHERE id = (v_item->>'productId')::uuid;
      INSERT INTO stock_movements (product_id, qty, type, notes)
      VALUES ((v_item->>'productId')::uuid, (v_item->>'qty')::numeric, 'cancellation', p_sale_id::text);
    END LOOP;
  END IF;

  -- Compensar account_payments si era cuenta corriente cobrada
  IF v_sale.payment_method = 'account' AND v_sale.status = 'closed' THEN
    INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
    VALUES (gen_random_uuid(), v_sale.customer_id, p_sale_id, v_sale.total,
            'payment', 'cancellation', current_date, 'Cancelación de pedido');
  END IF;

  UPDATE sales SET status = 'cancelled', notes = coalesce(notes,'') || ' [Cancelado por ' || p_user || ']'
   WHERE id = p_sale_id;

  INSERT INTO audit_log (action, scope, detail)
  VALUES ('cancelar', 'pedido', jsonb_build_object('sale_id', p_sale_id, 'user', p_user));
END $$;
```

---

## 5. RPC `aplicar_pago_cliente` — cuenta corriente

Reemplaza el flujo multi-step de `CustomersPage.registerPayment`. Recibe una asignación pre-calculada y la ejecuta en transacción.

```sql
CREATE FUNCTION aplicar_pago_cliente(
  p_customer_id    uuid,
  p_payment_method text,             -- 'cash' | 'transfer' | 'card' | 'balance'
  p_cash_amount    numeric,
  p_notes          text,
  p_allocations    jsonb              -- [{sale_id, amount, source}]; source ∈ 'cash'|'credit'
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_alloc jsonb;
  v_total_cash numeric := 0;
BEGIN
  PERFORM 1 FROM customers WHERE id = p_customer_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente inexistente'; END IF;

  -- Lock para evitar carrera con otras pantallas / mismo cliente
  PERFORM pg_advisory_xact_lock(hashtext('customer:' || p_customer_id::text));

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    IF v_alloc->>'source' = 'credit' THEN
      -- Aplica crédito: payment al pedido + charge "Crédito consumido"
      INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
      VALUES (gen_random_uuid(), p_customer_id, nullif(v_alloc->>'sale_id','')::uuid,
              (v_alloc->>'amount')::numeric, 'payment', 'balance', current_date, 'Crédito aplicado');
      INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
      VALUES (gen_random_uuid(), p_customer_id, null,
              (v_alloc->>'amount')::numeric, 'charge', 'balance', current_date, 'Crédito consumido');
    ELSIF v_alloc->>'source' = 'cash' THEN
      INSERT INTO account_payments (id, customer_id, sale_id, amount, type, payment_method, date, notes)
      VALUES (gen_random_uuid(), p_customer_id, nullif(v_alloc->>'sale_id','')::uuid,
              (v_alloc->>'amount')::numeric, 'payment', p_payment_method, current_date, p_notes);
      v_total_cash := v_total_cash + (v_alloc->>'amount')::numeric;
    END IF;
  END LOOP;

  IF v_total_cash <> p_cash_amount THEN
    RAISE EXCEPTION 'Asignación de efectivo (% ) no coincide con el monto declarado (% )', v_total_cash, p_cash_amount;
  END IF;

  INSERT INTO audit_log (action, scope, detail)
  VALUES ('cobrar_cc', 'cliente',
          jsonb_build_object('customer_id', p_customer_id, 'amount', v_total_cash, 'method', p_payment_method));
END $$;
```

Mismo patrón para `aplicar_pago_proveedor`.

---

## 6. RPCs de Caja

```sql
CREATE FUNCTION abrir_turno(p_user text, p_initial_cash numeric) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  -- El UNIQUE index parcial impide dos abiertos. Si falla, devuelve el existente.
  BEGIN
    INSERT INTO cash_shifts (id, opened_by, opened_at, status, initial_cash)
    VALUES (gen_random_uuid(), p_user, now(), 'open', p_initial_cash)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM cash_shifts WHERE status='open';
    RAISE EXCEPTION 'Ya hay un turno abierto (id %)', v_id;
  END;
  RETURN v_id;
END $$;

CREATE FUNCTION cerrar_turno(p_shift_id uuid, p_counted_cash numeric, p_notes text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_shift cash_shifts%ROWTYPE;
  v_sales_cash numeric; v_sales_transfer numeric; v_sales_card numeric;
  v_sales_account numeric; v_sales_mp numeric;
  v_ap_cash numeric; v_ap_transfer numeric; v_ap_card numeric;
  v_exp_cash numeric; v_exp_transfer numeric; v_exp_card numeric;
BEGIN
  SELECT * INTO v_shift FROM cash_shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift.status <> 'open' THEN RAISE EXCEPTION 'Turno no está abierto'; END IF;

  -- Ventas del período
  SELECT
    coalesce(sum(total) FILTER (WHERE payment_method='cash'), 0),
    coalesce(sum(total) FILTER (WHERE payment_method='transfer'), 0),
    coalesce(sum(total) FILTER (WHERE payment_method='card'), 0),
    coalesce(sum(total) FILTER (WHERE payment_method='account'), 0),
    coalesce(sum(total) FILTER (WHERE payment_method='mercadopago'), 0)
  INTO v_sales_cash, v_sales_transfer, v_sales_card, v_sales_account, v_sales_mp
  FROM sales
  WHERE cash_shift_id = p_shift_id
    AND status IN ('closed','delivered','paid','ready');

  -- Cobros CC del período (excluye 'balance')
  SELECT
    coalesce(sum(amount) FILTER (WHERE payment_method='cash'), 0),
    coalesce(sum(amount) FILTER (WHERE payment_method='transfer'), 0),
    coalesce(sum(amount) FILTER (WHERE payment_method='card'), 0)
  INTO v_ap_cash, v_ap_transfer, v_ap_card
  FROM account_payments
  WHERE type='payment'
    AND created_at BETWEEN v_shift.opened_at AND now()
    AND payment_method <> 'balance';

  -- Egresos del período (decidimos: por created_at, único filtro consistente)
  SELECT
    coalesce(sum(total) FILTER (WHERE payment_method='cash'), 0),
    coalesce(sum(total) FILTER (WHERE payment_method='transfer'), 0),
    coalesce(sum(total) FILTER (WHERE payment_method='card'), 0)
  INTO v_exp_cash, v_exp_transfer, v_exp_card
  FROM expenses
  WHERE deleted_at IS NULL
    AND payment_status = 'paid'
    AND created_at BETWEEN v_shift.opened_at AND now();

  UPDATE cash_shifts SET
    status                       = 'closed',
    closed_at                    = now(),
    sales_cash                   = v_sales_cash,
    sales_transfer               = v_sales_transfer,
    sales_card                   = v_sales_card,
    sales_account                = v_sales_account,
    sales_mp                     = v_sales_mp,
    account_collected_cash       = v_ap_cash,
    account_collected_transfer   = v_ap_transfer,
    account_collected_card       = v_ap_card,
    expenses_cash                = v_exp_cash,
    expenses_transfer            = v_exp_transfer,
    expenses_card                = v_exp_card,
    expected_cash                = v_shift.initial_cash + v_sales_cash + v_ap_cash - v_exp_cash,
    counted_cash                 = p_counted_cash,
    difference                   = p_counted_cash - (v_shift.initial_cash + v_sales_cash + v_ap_cash - v_exp_cash),
    notes                        = p_notes
  WHERE id = p_shift_id;

  INSERT INTO audit_log (action, scope, detail)
  VALUES ('cerrar_turno', 'caja', jsonb_build_object('shift_id', p_shift_id, 'difference', p_counted_cash - v_shift.initial_cash));
END $$;
```

---

## 7. Reports — vista única de revenue

Eliminar la lógica de agregación del frontend y dejarla en una vista SQL:

```sql
CREATE OR REPLACE VIEW v_revenue_per_day AS
WITH direct AS (
  SELECT created_at::date AS day,
         payment_method,
         sum(total) AS amount
  FROM sales
  WHERE status IN ('closed','delivered','paid','ready')
    AND payment_method <> 'account'
  GROUP BY 1, 2
),
collected AS (
  SELECT created_at::date AS day,
         payment_method,
         sum(amount) AS amount
  FROM account_payments
  WHERE type='payment' AND payment_method <> 'balance'
  GROUP BY 1, 2
)
SELECT day, payment_method, sum(amount) AS amount
FROM (SELECT * FROM direct UNION ALL SELECT * FROM collected) x
GROUP BY 1, 2;
```

`ReportsPage` consulta `v_revenue_per_day` con `WHERE day BETWEEN from AND to`. Eso evita los bugs de §6.1 y §6.2 del documento de bugs.

---

## 8. Fases del rediseño

| Orden | Fase | Esfuerzo | Riesgo si no se hace |
|-------|------|----------|---------------------|
| 1 | Fase 1 — Saneamiento de datos y constraints | M | Inconsistencias persisten silenciosas |
| 2 | Fase 2 — `registrar_venta_completa` (RPC) | M | Ventas sin stock / stock sin venta |
| 3 | Fase 3 — Estados unificados + `assert_sale_transition` | S | Reportes y caja siguen disonando con MP |
| 4 | Fase 4 — RPCs caja (`abrir/cerrar_turno`) | M | Doble turno abierto, cierres inconsistentes |
| 5 | Fase 5 — `aplicar_pago_cliente/proveedor` | M | Saldos imposibles si falla un step |
| 6 | Fase 6 — `cancelar_pedido` con reversión | S | Stock perdido por cancelaciones |
| 7 | Fase 7 — Reports sobre vistas SQL | S | Cifras del balance siguen en JS, divergen entre páginas |
| 8 | Fase 8 — Soft delete y FKs explícitas | S | Huérfanos al borrar |
| 9 | Fase 9 — Hardening (RLS, rate limit, auditoría rica) | M | Vulnerabilidades de servicio anon |
| 10 | Fase 10 — Tests E2E financieros | M | Regresiones sin red |

### Fase 1 — Saneamiento (bloqueante)

**Por qué:** los demás cambios construyen sobre tipos y constraints sanos; si dejamos `double precision` o columnas sin CHECK, cualquier RPC que escribamos arriba hereda el problema. `numeric(14,2)` elimina la clase entera de bugs de coma flotante (`0.1 + 0.2 = 0.30000000000000004`) que en finanzas se convierten en centavos faltantes que **nadie sabe a quién pertenecen**. Los CHECKs (no totales negativos, no `account` sin cliente, etc.) impiden que datos imposibles entren al sistema desde **cualquier path** (UI, importación, RPC nueva escrita mañana, SQL manual). Es la diferencia entre "rezamos para que el código sea correcto" y "la DB rechaza lo incorrecto por construcción". El UNIQUE parcial sobre turnos abiertos es un ejemplo cristalino: cualquier lógica en cliente que intente abrir un segundo turno **no puede** porque Postgres se lo impide; resolvimos un bug de concurrencia con una línea de SQL.

1. Migraciones `numeric(14,2)` (sección 1.1).
2. CHECK constraints de invariantes.
3. UNIQUE parcial en turnos abiertos.
4. FKs con `ON DELETE` explícito.
5. Vista `v_customer_balance`, `v_supplier_balance`.
6. Migración `customer.balance` → `account_payments`.

### Fase 2 — `registrar_venta_completa` (bloqueante)

**Por qué:** los `INSERT` encadenados desde el frontend (`sales`, luego `complete_sale_stocks`, luego `account_payments`) son la causa raíz de **al menos seis bugs distintos**: venta sin stock, stock sin venta, cobro `account` sin charge, doble cobro por re-click, descontrol al cancelar, registros sin auditoría. Una sola RPC en una transacción Postgres cierra todos esos casos de golpe porque la garantía es del motor, no del programador. Además mueve el control de invariantes (total positivo, stock disponible, cliente requerido para `account`) al lugar donde se aplica a **cualquier camino** que escriba sales (incluyendo POS, Kanban y futuras integraciones). El frontend pasa de orquestar a invocar — más simple, más testeable, más seguro.

1. SQL de la sección 3.
2. Reemplazar el bloque `submit` de `POSPage.completeSale` (líneas 147-260) por una sola llamada `await supabase.rpc("registrar_venta_completa", {...})`.
3. Mismo cambio en `OrdersKanbanPage.saveNewOrder` (líneas 320-378).
4. Tests:
   - Venta normal: sale, stock y charge consistentes.
   - Falla de stock: nada queda persistido.
   - Falla de validación de monto: nada queda persistido.
   - Concurrencia: dos cobros simultáneos al último producto → uno gana, otro recibe error.

### Fase 3 — Estados unificados (bloqueante)

**Por qué:** hoy conviven tres convenciones de estado (`closed` en POS, `ready` en MP webhook, `delivered` ad-hoc, `paid` referenciado en código pero nunca seteado). Resultado: `CashShiftPage` filtra unos, `ReportsPage` filtra otros, el Kanban arrastra entre estados sin reglas. La consecuencia financiera es que **la misma venta entra o no en distintas pantallas según la pestaña**. Una máquina de estados centralizada termina con eso. Pasar las transiciones por una función SQL hace **imposible** retroceder de `closed` a `open` por error, y hace **explícito** dónde entra MP. Trabajar con estados es trabajo barato; las inconsistencias que produce no son.

1. Crear `assert_sale_transition` (sección 2).
2. Toda mutación de `sales.status` pasa por RPC dedicada que llama `assert_sale_transition`.
3. Reescribir `OrdersKanbanPage.handleDrop` para llamar RPC.
4. Renombrar `mp-webhook` para usar `paid` (no `ready` directo). Caja y Reports incluyen `paid`/`ready` explícitamente.

### Fase 4 — RPCs caja (bloqueante)

**Por qué:** el cierre de turno calcula totales en JS (`shiftSales.filter().reduce()`) que dependen del estado del cliente al momento de cerrar. Si dos cajeros tienen la app abierta, ven datasets distintos y el que cierra escribe sus propias sumas a la DB. Mover el cálculo a SQL convierte el cierre en una operación **determinística**: dada la hora de apertura y la actual, el sistema siempre devuelve los mismos totales sin importar quién dispara la operación. Además aliviana al frontend (deja de ser una calculadora) y deja al backend como la única fuente de verdad para conciliación contable. El UNIQUE parcial sobre turno abierto (Fase 1) protege la otra mitad: solo puede haber un turno activo, por lo tanto solo hay un cierre posible.

1. SQL de la sección 6.
2. `CashShiftPage.doOpenShift` y `doCloseShift` invocan las RPC.
3. Decidir filtro de gastos: **por `created_at`** (uniforme con caja). Reports se alinea con esto.
4. Snapshot del turno se calcula 100% en SQL, frontend solo muestra.

### Fase 5 — Pago a cuenta (bloqueante)

**Por qué:** `registerPayment` hace hasta seis `INSERT` secuenciales (pago, charge consumo crédito, charge a deuda inicial, pago efectivo a varios pedidos, excedente como crédito, etc.). Si el quinto falla, los cuatro anteriores quedan persistidos y el saldo del cliente queda en un estado **inválido por construcción** (crédito consumido pero pago no aplicado). La RPC en transacción no es un "nice to have", es la única forma de que la cuenta corriente sea siempre auditable. El advisory lock por `customer_id` evita que dos operaciones simultáneas sobre el mismo cliente (por ejemplo, registrar pago desde dos dispositivos) produzcan estados imposibles. El frontend pasa de operador a calculadora: arma el plan de asignación y el backend lo ejecuta atómicamente.

1. SQL de la sección 5.
2. Frontend calcula `allocations` y envía la lista. Sin INSERTs sueltos.

### Fase 6 — Cancelar pedido (bloqueante)

**Por qué:** cancelar es la operación financiera más subestimada del sistema. El código actual solo cambia `status='cancelled'` y olvida revertir stock y compensar deuda. Resultado acumulativo: meses después el inventario físico no coincide con el digital y nadie sabe dónde se fue. La RPC dedicada hace explícitas las tres acciones que SIEMPRE deben ocurrir juntas (cambio de estado, devolución de stock, payment de compensación si la sale ya tenía charge). Llevar esta lógica a una función única (DRY) elimina la posibilidad de que un developer futuro escriba "cancelar versión 2" sin todos los pasos.

1. SQL de la sección 4.
2. `OrdersKanbanPage.cancelOrder` llama la RPC.
3. Verificar que el `audit_log` registra cancelaciones.

### Fase 7 — Reports vía SQL (alto)

**Por qué:** hoy cada pantalla calcula totales con su propia lógica JS. POS usa una fórmula de saldo; Reports usa otra; CashShift una tercera. Las tres son "casi" iguales y por eso nadie nota cuando difieren en $5. Mover la agregación a vistas SQL crea una **fuente única de verdad por concepto**: "el revenue de mayo" es lo que dice `v_revenue_per_day`, no lo que reconstruya cada componente. Esto resuelve además el bug §3.2 (filtros divergentes `createdAt` vs `date`): la vista define cuál es el filtro y todo lo demás se alinea. CQRS-light: el modelo de escritura (sales, account_payments) sigue normalizado; el modelo de lectura está optimizado para reportes sin contaminar la tx.

1. Vistas `v_revenue_per_day`, `v_expenses_per_day`, `v_outstanding_debt`.
2. `ReportsPage` consulta las vistas con un solo `select` por widget. Saca lógica del cliente.

### Fase 8 — Soft delete (alto)

**Por qué:** en contabilidad, **nada se borra**: se anula con un asiento contrario. El delete físico actual viola este principio y rompe la historia (eliminar un cliente borra los pagos que hicimos cobrar de él; eliminar un gasto pagado hace desaparecer un egreso real de caja). Soft delete (`deleted_at`) preserva la auditoría y permite recuperar errores operativos. El costo es agregar `WHERE deleted_at IS NULL` en queries activas, un precio bajo a cambio de no perder historia. Combinado con FKs `ON DELETE RESTRICT`, garantiza que un cliente con movimientos **no puede** desaparecer accidentalmente.

1. Migraciones `deleted_at`.
2. Todas las queries activas filtran `WHERE deleted_at IS NULL`.
3. Renombrar `del()` a `archive()` en customer/supplier/expense; ya no DELETE.

### Fase 9 — Hardening (medio)

**Por qué:** sin RLS, el `anon` key (publicado en el bundle del frontend) puede mutar cualquier tabla. Mientras el sistema viva solo en una panadería con staff de confianza, el riesgo es contenido; en cuanto el anon key se filtre (gist, repo público, alguien lo extrae del bundle minificado) cualquiera mueve dinero. RLS es la defensa que **separa la confianza en los usuarios de la confianza en sus dispositivos**. Mover todo a RPCs además reduce la superficie de ataque a una API explícita; mucho más auditable que "todas las tablas son escribibles".

1. **RLS** sobre `sales`, `account_payments`, `supplier_payments`, `expenses`, `cash_shifts`. Solo `service_role` y `authenticated` con rol staff.
2. Quitar `INSERT/UPDATE/DELETE` directos del cliente; todo va por RPC.
3. **Audit log** dentro de cada RPC, con `user`, IP, timestamp.
4. Sentry para Edge Functions / errores SQL.
5. Backup diario + restore mensual probado.

### Fase 10 — Tests E2E financieros (medio)

**Por qué:** los tests unitarios validan funciones; los E2E validan que el dinero llega a la fila correcta de la tabla correcta. Sin ellos, cada despliegue es un acto de fe. En finanzas, una regresión silenciosa (por ejemplo "el cobro funciona pero el `cash_shift_id` quedó null") puede pasar semanas sin notarse y mezclar dos turnos. Los casos elegidos abajo no son ejercicios académicos: son **exactamente** los bugs documentados en `BUGS_DINERO_PLATAFORMA.md`. Convertir cada bug en un test garantiza que **nunca vuelva**.

Playwright + datos de fixture en una base efímera. Casos a cubrir:

- POS: cobrar en efectivo / transferencia / cuenta / MP. Verificar `cash_shifts` post-cierre.
- POS: descuento al límite (100%, > 100%).
- Kanban: drag de open a closed sin pasar por estados intermedios → debe fallar.
- Cancelar pedido pago en cuenta → saldo cliente vuelve.
- Caja: dos usuarios abren turno simultáneo → solo uno tiene éxito.
- CC: aplicar crédito a varios pedidos → suma 0 en saldo.
- Eliminar cliente con movimientos → falla por FK.
- Gasto pagado → no se puede eliminar, solo "archivar con compensación".

---

## 9. Concurrencia — checklist por escenario

| Escenario | Mecanismo |
|-----------|-----------|
| Dos cajeros venden el último producto a la vez | `UPDATE ... SET stock = stock - X WHERE stock >= X` atómico fila por fila |
| Dos pestañas cobran el mismo pedido CC en paralelo | `SELECT ... FOR UPDATE` en `sales` + `assert_sale_transition` |
| Mismo cliente recibe 2 aplicaciones de crédito simultáneas | `pg_advisory_xact_lock(hashtext('customer:'||id))` en `aplicar_pago_cliente` |
| Dos usuarios abren turno a la vez | `UNIQUE INDEX cash_shifts (status) WHERE status='open'` |
| MP webhook pisa una venta cobrada en cash | Lock por `payment_id` + `assert_sale_transition` (rechaza `closed → paid`) |
| Drag & drop del Kanban concurrente | RPC `cambiar_estado_pedido` con `FOR UPDATE` |
| Cierre de turno mientras llega una venta | El cierre selecciona `WHERE cash_shift_id = p_shift_id`; ventas posteriores entran al próximo turno |

---

## 10. Patrones de diseño aplicados — y por qué cada uno

| Patrón | Dónde | Por qué |
|--------|-------|---------|
| **Aggregate / Single Transaction** | `registrar_venta_completa` envuelve sale + stock + CC | Es la única forma de que "se vendió" y "se descontó stock" sean inseparables. Sin tx, **todo lo demás es esperanza**. |
| **State Machine** | `assert_sale_transition` centraliza transiciones | Codifica reglas de negocio en SQL para que sean inmutables ante developers nuevos. La validación de UI puede olvidarse; la del motor no. |
| **Event Sourcing (light)** | `audit_log` como historial completo | "¿Por qué este saldo es así?" tiene que tener respuesta siempre. Una columna `last_modified_by` no alcanza para auditoría financiera. |
| **CQRS (light)** | Vistas `v_revenue_per_day`, `v_customer_balance` para lecturas | Separa el modelo que escribe del modelo que lee. Sin esto, optimizar reportes requiere desnormalizar la tabla transaccional, que es donde menos hay que tocar. |
| **Saga / Compensation** | `cancelar_pedido` compensa stock y CC | Las operaciones que afectan dinero NUNCA deben "ignorarse" o "rollback in spirit". Se compensan con asientos contrarios y queda traza. |
| **Pessimistic Locking** | `FOR UPDATE` en sales, cash_shifts | El conflicto es real (dos cajeros, dos ventanas). Pessimistic es más simple que optimistic acá porque la duración de la tx es < 100 ms. |
| **Advisory Lock** | `pg_advisory_xact_lock` por customer/supplier/payment_id | Serializa solo lo que necesita serializarse. `SERIALIZABLE` global sería un cañón para una hormiga. |
| **Soft Delete** | `deleted_at` en customers/suppliers/expenses | En contabilidad nada se borra. Soft delete preserva historia y permite undo operativo sin restaurar backups. |
| **Idempotency Key** | UNIQUE constraints y validación de transición | Doble click, doble request, retry de red: pasa todo el tiempo. Sin idempotencia, cada uno es un cobro doble. |
| **Repository / Application Service** | RPCs como puerta de entrada única | El frontend deja de poder hacer "lo que se le ocurra"; tiene que usar la API. Eso hace que el modelo sea controlable. |
| **Audit Trail** | `audit_log` dentro de cada RPC | Inserción en la misma tx que la mutación → o se registran las dos cosas o ninguna. Sin esto, "quién hizo qué" se vuelve adivinanza. |
| **Money Pattern** | `numeric(14,2)` + `roundMoney()` en JS | Elimina centavos imposibles antes de que aparezcan. Bug ARS-clásico: "el sistema dice $1234.999999". |

---

## 11. Definición de "hecho"

- [ ] Todas las migraciones de Fase 1 aplicadas, sin errores en datos existentes.
- [ ] Las queries Q1–Q13 de [BUGS_DINERO_PLATAFORMA.md §7](BUGS_DINERO_PLATAFORMA.md) devuelven **0 filas** (estado limpio).
- [ ] POS, Kanban, Caja, CC clientes/proveedores invocan RPCs en vez de INSERTs múltiples.
- [ ] `audit_log` registra cada operación de dinero del último día (chequear con `SELECT count(*) FROM audit_log WHERE created_at::date = current_date GROUP BY action`).
- [ ] Tests E2E financieros pasan al 100%.
- [ ] Reconciliación contable diaria: para 7 días consecutivos, `cash_shifts.sales_cash + sales_transfer + sales_card + sales_mp = SUM(sales.total) del período`.
- [ ] RLS auditado: el `anon` key no puede leer ni mutar `sales`, `account_payments`, `supplier_payments`, `expenses`, `cash_shifts`.
- [ ] El cliente nunca hace `INSERT/UPDATE/DELETE` directo a estas tablas (búsqueda en código).

---

## 12. Roadmap a futuro (no bloqueante)

- **Multi-sucursal:** introducir `branch_id` en tablas de dinero. Vistas por sucursal.
- **Multi-moneda:** preparar para USD si se vende online a turistas.
- **Conciliación bancaria:** importar extractos y matcheo automático contra `payment_method='transfer'`.
- **Reportes contables formales:** libro IVA ventas / compras exportable.
- **Reservas de fecha de entrega:** capacidad por día con cupo máximo.
- **Refunds parciales:** dividir una sale en items y reembolsar solo algunos.
- **Programa de fidelidad:** puntos como saldo virtual separado del crédito CC.
