# Bugs e inconsistencias — Movimientos de dinero (POS / Caja / Cuenta Corriente)

> Auditoría transversal del manejo de dinero en toda la plataforma NUTRIFREE,
> excluyendo la pasarela de pago (cubierta por `BUGS_PASARELA_PAGO.md` y
> `BACKEND_PASARELA_PAGO.md`).
>
> Foco: cualquier inconsistencia que produzca ingresos ficticios, ingresos no
> contabilizados, egresos no rastreables, saldos de cuenta corriente erróneos,
> stock descontado sin venta, o ventas sin stock descontado.

Alcance:

| Módulo | Archivos clave |
|--------|----------------|
| POS (mostrador) | [src/pages/POSPage.jsx](src/pages/POSPage.jsx) |
| Kanban de pedidos | [src/pages/OrdersKanbanPage.jsx](src/pages/OrdersKanbanPage.jsx) |
| Caja / Turnos | [src/pages/CashShiftPage.jsx](src/pages/CashShiftPage.jsx) |
| Reportes | [src/pages/ReportsPage.jsx](src/pages/ReportsPage.jsx) |
| Cuenta corriente clientes | [src/pages/CustomersPage.jsx](src/pages/CustomersPage.jsx) |
| Cuenta corriente proveedores | [src/pages/SuppliersPage.jsx](src/pages/SuppliersPage.jsx), [src/pages/ExpensesPage.jsx](src/pages/ExpensesPage.jsx) |
| Mapeo / persistencia | [src/supabase.js](src/supabase.js) |

Leyenda de severidad:

| Sev | Significado |
|-----|-------------|
| 🔴 **CRÍTICO** | Pérdida de dinero, ingreso ficticio o egreso no rastreable hoy |
| 🟠 **ALTO**    | Saldos desalineados, stock descalzado, reportes con cifras irreales |
| 🟡 **MEDIO**   | UX rota, datos confusos, baja resiliencia operativa |
| 🔵 **BAJO**    | Limpieza / hardening |

---

## Resumen ejecutivo

| # | Sev | Bug | Módulo | Impacto |
|---|-----|-----|--------|---------|
| 1 | 🔴 | Venta + descuento de stock sin atomicidad (Postgres tx) | POS / Kanban | Cobro sin descuento de stock o stock descontado sin venta |
| 2 | 🔴 | Cobro de pedido `account` puede dejar `status=closed` sin charge en CC | Kanban / POS | Ingreso ficticio en caja, deuda no registrada |
| 3 | 🔴 | Cancelar pedido NO reembolsa stock | Kanban | Stock fantasma perdido |
| 4 | 🔴 | Ventas MercadoPago (`status='ready'`) quedan fuera de caja y Reports | Caja / Reports | Ingresos online no se contabilizan |
| 5 | 🔴 | `expenses` filtrados por `createdAt` en caja y por `date` en Reports | Caja vs Reports | Mismo gasto sale en distintos turnos / fechas |
| 6 | 🔴 | Multi-step (cargos, pagos, consumo de crédito) sin transacción | CC clientes / proveedores | Inserción parcial deja saldos imposibles |
| 7 | 🟠 | No hay constraint de "un solo turno abierto por vez" | Caja | Dos turnos abiertos en paralelo → doble conteo |
| 8 | 🟠 | El cierre de turno guarda ventas + cobros CC en una sola columna `sales_cash` | Caja | Historial de turnos sin auditoría real |
| 9 | 🟠 | Descuento % sin techo, cambio de precio sin trazabilidad | POS | Venta a precio arbitrario sin auditoría |
| 10 | 🟠 | `editingPrice` (precio editado) no se registra quién lo hizo | POS | Imposible auditar quién cobró menos |
| 11 | 🟠 | Eliminar cliente borra `account_payments` pero deja `sales` huérfanas | CC clientes | Reports muestra ventas sin cliente, mismatch de saldos |
| 12 | 🟠 | Eliminar gasto borra `supplier_payments` retroactivamente | Gastos / CC proveedores | Pagos ya efectuados desaparecen del registro |
| 13 | 🟠 | `customer.balance` (deuda inicial) se mezcla con `account_payments` sin charge espejo | CC clientes / Reports | Posible doble conteo o subconteo de deuda |
| 14 | 🟠 | `complete_sale_stocks` en Kanban se llama ANTES de insertar la sale | Kanban | Stock descontado sin venta si el insert falla |
| 15 | 🟠 | `paid_at` del gasto se setea a `todayStr()` al pagar, perdiendo la fecha real | Gastos | Reportes y caja por fecha equivocada |
| 16 | 🟠 | Reports: `closedSales` excluye `status='ready'` y `'paid'` | Reports | Ingresos MP no entran en el balance |
| 17 | 🟠 | Drag & drop del Kanban acepta transiciones sin validar máquina de estados | Kanban | Cualquier estado a cualquiera, incluso retroceder |
| 18 | 🟡 | Mezcla de `uid()` y `crypto.randomUUID()` para IDs | Toda la app | IDs con dos formatos, busquedas inconsistentes |
| 19 | 🟡 | `Number(payForm.amount)` sin redondeo monetario | CC / POS | Acumulación de errores de coma flotante |
| 20 | 🟡 | No hay RLS ni constraints en DB que protejan los flujos de dinero | Toda la app | Cliente podría modificar montos vía SQL anon key |
| 21 | 🟡 | `expenses` permiten métodos de pago inconsistentes con caja | Gastos | Egresos por "transfer" no se reflejan en panel digital correctamente |
| 22 | 🟡 | Mismo saleId se inserta dos veces si el cliente toca "Cobrar" rápido | POS / Kanban | El `submitting` guard puede no bastar |
| 23 | 🔵 | `audit_log` no es transaccional con la operación | Auditoría | Acción auditada pero efecto fallido |

---

# 1. POS (mostrador) — bugs

## 1.1 🔴 Venta y descuento de stock sin atomicidad

**Evidencia:** [src/pages/POSPage.jsx:193-201](src/pages/POSPage.jsx:193). El propio comentario admite el problema:

```js
// Insertar la venta primero: si falla el stock, el pedido queda registrado y se puede corregir manualmente.
// El orden inverso (stock antes que venta) era peor: dejaba el stock reducido sin venta registrada.
const { error: saleErr } = await supabase.from("sales").insert(saleToDb(sale));
if (saleErr) { showToast(...); return; }
const { data: stockResults, error: stockErr } = await supabase.rpc("complete_sale_stocks", { p_stock_deltas: stockDeltas });
if (stockErr) {
  showToast("Venta guardada pero el stock no se descontó: " + stockErr.message, "error");
}
```

**Impacto:** dos escenarios reales:
- **Venta sin stock descontado:** el cliente paga, el ticket se imprime, pero los productos siguen en el sistema. Inventario inflado, próxima venta podría aceptar stock que ya se fue.
- **Stock descontado sin venta (versión Kanban, ver §2.2):** mismo síntoma al revés.

**Solución:** envolver en una sola RPC `registrar_venta_completa(p_sale jsonb, p_stock_deltas jsonb, p_account_payment jsonb)` que haga todo en una transacción Postgres. La función falla atómicamente o tiene éxito atómicamente. Patrón: **Aggregate Transaction** + **Single Source of Truth** (RPC).

## 1.2 🔴 Cobro `account` con `selectedCustomer = null`

**Evidencia:** [src/pages/POSPage.jsx:207](src/pages/POSPage.jsx:207). La condición:

```js
if (status === "closed" && payMethod === "account" && selectedCustomer) {
```

evita generar el charge si no hay cliente seleccionado, **pero la sale igual queda con `paymentMethod: "account"` y `status: "closed"`**. Esa venta aparece en Reports como ingreso por cuenta corriente cobrado, sin que existan los `account_payments` que lo respalden.

**Solución:** validar antes del submit. Si `payMethod === "account" && !selectedCustomer`, abortar con error explícito ("Seleccioná un cliente para cobrar en cuenta"). Idealmente, agregar **CHECK constraint en SQL**:

```sql
ALTER TABLE sales
  ADD CONSTRAINT sales_account_requires_customer
  CHECK (payment_method <> 'account' OR customer_id IS NOT NULL);
```

## 1.3 🟠 Descuento % sin techo + precio editado sin auditoría

**Evidencia:** [src/pages/POSPage.jsx:127-138](src/pages/POSPage.jsx:127):

```js
const overridePrice = (productId, newPrice) => {
  const p = Number(newPrice);
  if (isNaN(p) || p < 0) { setEditingPrice(null); return; }
  setCart(prev => prev.map(i => i.productId===productId ? {...i, price:p, ...} : i));
};
// ...
const discountAmt = discountType==="pct"
  ? Math.round(subtotal * (Number(discountValue)||0) / 100)  // ⚠️ sin cap a 100
  : Math.min(Number(discountValue)||0, subtotal);
```

**Impactos:**
- Un descuento `pct=150` produce `discountAmt > subtotal` → `total` negativo. Si se ingresa, queda guardado y desordena Reports.
- `priceOverridden:true` se persiste como flag, pero **no hay registro de QUIÉN cambió el precio ni de cuánto era el original**. Un cajero podría vender una torta de $25.000 en $1.000 y solo se ve en la sale ya guardada.

**Solución:**
1. Acotar `Math.min(discountValue, 100)` para `pct`.
2. Persistir auditoría por ítem: `originalPrice`, `priceOverridden`, `priceOverrideBy` (user.name), `priceOverrideReason`. Agregar columna o usar JSON en `sales.items`.
3. Si el rol del usuario no es admin, exigir confirmación con clave o bloquear el override.
4. Idealmente: si `total < costo_de_recetas`, alerta visible y registrar en `audit_log`.

## 1.4 🟠 `crypto.randomUUID()` mezclado con `uid()`

**Evidencia:** [src/pages/POSPage.jsx:162](src/pages/POSPage.jsx:162) usa `uid()` para `sale.id` y [POSPage.jsx:210](src/pages/POSPage.jsx:210) usa `crypto.randomUUID()` para `account_payments.id`. La inconsistencia complica búsquedas y joins por id, y `uid()` puede no ser UUID-compatible.

**Solución:** una única función `newId()` que delegue siempre a `crypto.randomUUID()`. Tipo `uuid` en todas las PK.

## 1.5 🟡 Multi-step de cobro `account` sin transacción

**Evidencia:** [src/pages/POSPage.jsx:207-241](src/pages/POSPage.jsx:207). Cuatro INSERTs separados (sale, charge, credit payment, credit consumption) sin tx. Si cualquiera falla en el medio:

- La sale ya está `closed`.
- El charge puede no existir → cliente sin deuda registrada.
- El credit consumption puede no existir → cliente con crédito que no le corresponde.

**Solución:** RPC `registrar_venta_completa` (ver §1.1) que incluya los movimientos de cuenta corriente. Todo en una sola transacción.

---

# 2. Kanban de pedidos — bugs

## 2.1 🔴 Cancelar pedido NO reembolsa stock

**Evidencia:** [src/pages/OrdersKanbanPage.jsx:249-256](src/pages/OrdersKanbanPage.jsx:249):

```js
const cancelOrder = async (sale) => {
  if (!confirm("¿Cancelar este pedido?")) return;
  const { error } = await supabase.from("sales").update({ status: "cancelled" }).eq("id", sale.id);
  // ⚠️ Nada de devolver stock
  ...
};
```

**Impacto:** al crear el pedido se descontó stock (ver §2.2). Al cancelar, **el stock no vuelve al inventario**. Acumulación de "fugas" de stock a lo largo del tiempo.

**Solución:**
1. RPC `cancelar_pedido(p_sale_id uuid)` que:
   - Valide que el `status` actual sea cancelable (no permitir cancelar `closed` o `delivered`).
   - Reverse los `stock_movements` y haga `UPDATE products SET stock = stock + qty`.
   - Cambie `status` a `cancelled`.
   - Inserte un `stock_movement` con `type='cancellation'`.
2. Si el pedido era cuenta corriente y ya tenía charge, generar el `payment` espejo con `paymentMethod='cancellation'` para que el saldo del cliente quede neutro.

## 2.2 🔴 Stock descontado ANTES de insertar la sale

**Evidencia:** [src/pages/OrdersKanbanPage.jsx:339-369](src/pages/OrdersKanbanPage.jsx:339):

```js
if (stockDeltas.length > 0) {
  const { data: stockResults, error: stockErr } = await supabase.rpc("complete_sale_stocks", { ... });
  if (stockErr) throw stockErr;
  setProducts(prev => prev.map(p => { ... }));
}
// ... más abajo:
const { error } = await supabase.from("sales").insert(saleToDb(sale));
if (error) throw error;
```

**Impacto:** si falla el insert de la sale, **el stock ya está descontado sin venta asociada**. Caso opuesto a §1.1, pero peor: nadie sabe a dónde fue ese stock.

**Solución:** misma RPC `registrar_venta_completa` del §1.1.

## 2.3 🔴 Cobrar un pedido ya cobrado — sin guard server-side

**Evidencia:** [src/pages/OrdersKanbanPage.jsx:185-246](src/pages/OrdersKanbanPage.jsx:185). `closeOrder` actualiza `sales.status='closed'` y `payment_method`. No verifica si la sale ya estaba `closed`. Si el cliente abre detalle desde dos dispositivos y presiona "Cobrar" en ambos:

- Webhook MP llega entretanto (con `status='ready'`) y deja la sale en `paid`.
- Cajero abre el modal viendo `ready`, presiona "Cobrar" en cash, queda `closed` con `paymentMethod='cash'`.
- El `account_payments` charge se duplica → la deuda CC se duplica.

**Solución:**
- RPC `cobrar_pedido(p_sale_id uuid, p_payment_method text, p_user text)` con `FOR UPDATE` en la sale y validación de transición permitida (`open|preparing|ready → closed`).
- En el frontend, deshabilitar el botón si `sale.paidAt != null`.

## 2.4 🟠 Drag & drop sin máquina de estados

**Evidencia:** [src/pages/OrdersKanbanPage.jsx:141-154](src/pages/OrdersKanbanPage.jsx:141):

```js
const handleDrop = async (e, newStatus) => {
  // ... acepta cualquier transición sin validar
  const { error } = await supabase.from("sales").update({ status: newStatus }).eq("id", saleId);
};
```

Esto permite arrastrar de `ready` a `open` (retroceder), o saltar `open → ready` sin pasar por `preparing`. Sin RPC ni constraint, **cualquier estado válido se acepta**.

**Solución:** una RPC `cambiar_estado_pedido(p_sale_id, p_new_status, p_user)` con tabla de transiciones permitidas, y `audit_log` que registre quién retrocedió.

## 2.5 🟠 Toggle billing y reapertura de Kanban sin lock

**Evidencia:** `toggleBilling` y `advanceStatus` actualizan sin chequear estado actual server-side. Pueden ejecutarse en paralelo y dejar la sale en estado contradictorio.

**Solución:** WHERE clauses defensivas (`.eq("status", currentStatus)`) y/o RPC con `FOR UPDATE`.

---

# 3. Caja / Cierre de turno — bugs

## 3.1 🔴 Ventas MP (`status='ready'`) no entran al turno

**Evidencia:** [src/pages/CashShiftPage.jsx:33-38](src/pages/CashShiftPage.jsx:33):

```js
const shiftSales = openShift
  ? sales.filter(s =>
      ["closed","delivered"].includes(s.status) &&  // ⚠️ falta "paid" / "ready"
      new Date(s.paidAt || s.createdAt) >= shiftStart
    )
  : [];
```

Las ventas online quedan en `status='ready'` (ver `mp-webhook/index.ts:84-90`). **No entran a `shiftSales` y desaparecen del corte de caja.**

**Impacto:** caja cuadra con efectivo pero los ingresos digitales por MP nunca se ven en el dashboard del turno ni en `cash_shifts.sales_*`.

**Solución:** incluir explícitamente los estados `paid` y `ready` cuando `paymentMethod='mercadopago'`. Y agregar columna `sales_mercadopago` en `cash_shifts` para reflejarlos separados (ver §3.5).

## 3.2 🔴 Filtrado por `createdAt` vs `date` en gastos

**Evidencia:** [src/pages/CashShiftPage.jsx:53-58](src/pages/CashShiftPage.jsx:53):

```js
const shiftExpenses = openShift
  ? expenses.filter(e => e.createdAt && new Date(e.createdAt) >= shiftStart)
  : [];
```

Pero Reports usa `expense.date >= from && expense.date <= to` ([ReportsPage.jsx:250](src/pages/ReportsPage.jsx:250)). Para el mismo gasto:

- Si lo cargás hoy con `date='ayer'`, **aparece en el turno de hoy** (createdAt=hoy).
- Pero en Reports del día de ayer también aparece (`date=ayer`).
- Caja del turno de ayer NO lo ve.

**Impacto:** caja y reports disienten. Egresos pueden contarse dos veces, o ninguna, según el filtro.

**Solución:** decidir **una única fuente de verdad**:
- Si el gasto se "ejecuta" cuando se carga, usar siempre `createdAt`.
- Si el gasto pertenece a una fecha de negocio, usar `date` y exigir `date` ≥ shiftStart.
- Recomendado: `date` para reports, `createdAt` para auditoría, **y exigir `date >= openedAt::date`** al cargar un gasto durante un turno abierto.

## 3.3 🔴 No existe constraint de "un solo turno abierto"

**Evidencia:** el chequeo es solo en cliente (`cashShifts.find(s.status==='open')`). Si dos usuarios cargan la app, ambos verán "Sin turno abierto" si ninguno persistió aún, y pueden abrir dos turnos simultáneos. El siguiente fetch tendrá dos `open`, el `find()` devuelve uno, las ventas se asignan a uno solo → caja desfasada.

**Solución:**

```sql
CREATE UNIQUE INDEX cash_shifts_one_open
  ON cash_shifts (status)
  WHERE status = 'open';
```

Con eso, el segundo INSERT falla y el segundo usuario ve el turno del primero.

## 3.4 🟠 Cierre de turno mezcla ventas y cobros CC en `sales_cash`

**Evidencia:** [src/pages/CashShiftPage.jsx:98](src/pages/CashShiftPage.jsx:98):

```js
salesCash: sCash + apCash,        // ventas efectivo + cobros CC efectivo, sin desglose
salesTransfer: sTransfer + apTransfer,
salesCard: sCard + apCard,
salesAccount: sAccount,
```

**Impacto:** el historial de turnos cerrados (`cash_shifts`) ya no permite saber cuánto fue "venta del día" vs "cobranza de deudas viejas". Para conciliación contable es relevante.

**Solución:** agregar columnas `account_collections_cash/transfer/card` y guardar separado.

## 3.5 🟠 No hay columna para MercadoPago en `cash_shifts`

**Evidencia:** [src/supabase.js:227-243](src/supabase.js:227). El mapeo `dbToCashShift/cashShiftToDb` solo conoce `sales_cash/transfer/card/account`. MP queda sin lugar.

**Solución:** agregar `sales_mp` y `expenses_transfer`, `expenses_mp` (si pagás algo con MP business).

## 3.6 🟡 Egresos por transferencia no se restan de "Digital" en el panel

**Evidencia:** [src/pages/CashShiftPage.jsx:207-212](src/pages/CashShiftPage.jsx:207) muestra `− Egresos por transferencia` pero **no se suman en `expectedCash` ni en columnas del cierre**, solo se visualizan. El balance bancario real no se persiste.

**Solución:** incluir `eTransfer` en una métrica `digital_balance` y persistirla en `cash_shifts`.

---

# 4. Cuenta corriente clientes — bugs

## 4.1 🔴 Multi-step en `registerPayment` sin transacción

**Evidencia:** [src/pages/CustomersPage.jsx:177-280](src/pages/CustomersPage.jsx:177). El flujo realiza hasta 6 INSERTs encadenados (payment, charge consumo crédito, payment a deuda inicial, payment a pedidos efectivo, charge "deuda apertura", excedente). Cada uno con su propio `if (error)`.

**Impacto:** si el 4to falla, los 3 anteriores ya están persistidos. El saldo del cliente queda en un estado imposible: por ejemplo, pago aplicado pero crédito no consumido (cliente recibe doble beneficio).

**Solución:** RPC `aplicar_pago_cliente(p_customer_id, p_allocations jsonb)` en una transacción. Patrón: **Application Service** + **Transactional Outbox** (`audit_log` dentro de la misma tx).

## 4.2 🔴 Eliminar cliente deja `sales` huérfanas

**Evidencia:** [src/pages/CustomersPage.jsx:156-174](src/pages/CustomersPage.jsx:156):

```js
const del = async (id) => {
  // ...
  await supabase.from("account_payments").delete().eq("customer_id", id);
  await supabase.from("customers").delete().eq("id", id);
};
```

Las `sales` con `customer_id = id` quedan con FK rota (si la FK existe con ON DELETE CASCADE, las ventas también se borran — peor; si no, queda inconsistente). En cualquier caso, **Reports usa `customer.id` y deja de ver al cliente**, mientras que `customer_name` está denormalizado en `sales` y sí aparece.

**Solución:**
1. NO borrar clientes: `is_active = false` (soft delete). Mantiene auditoría.
2. Si realmente hay que eliminar (GDPR / pedido del usuario), exigir que no tenga ventas. O reasignar todo a un cliente "Anónimo".
3. FK explícita en SQL: `customer_id REFERENCES customers(id) ON DELETE SET NULL`.

## 4.3 🟠 `customer.balance` mezclado con `account_payments`

**Evidencia:** [src/pages/ReportsPage.jsx:113-118](src/pages/ReportsPage.jsx:113):

```js
const outstandingDebt = (customers || []).reduce((sum, c) => {
  const charges  = (accountPayments || []).filter(p => p.customerId === c.id && p.type === "charge").reduce((a, b) => a + b.amount, 0);
  const payments = (accountPayments || []).filter(p => p.customerId === c.id && p.type === "payment").reduce((a, b) => a + b.amount, 0);
  const bal = (c.balance ?? 0) + payments - charges;
  return bal < 0 ? sum + Math.abs(bal) : sum;
}, 0);
```

Mientras tanto [src/pages/POSPage.jsx:19-21](src/pages/POSPage.jsx:19) calcula:

```js
const custBal = (id) =>
  accountPayments.filter(p => p.customerId === id)
    .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);
```

**No incluye `c.balance`**. Diferentes fórmulas en distintas pantallas → diferentes saldos. Si la convención fue espejar `balance` en un `account_payment` "Saldo apertura", entonces Reports lo duplica al sumarlo. Si no se espejó, POS subestima.

**Solución:**
1. Migración única: por cada cliente con `balance != 0`, crear un `account_payment` `type='charge'/'payment'` con notas "Saldo apertura". Setear `customers.balance = 0`. Eliminar la columna `balance` o conservarla solo como histórico inmutable.
2. Una única función `customerBalance(id)` en `shared.jsx` y usar en TODAS las pantallas.
3. Mejor: vista SQL `v_customer_balances` materializada o calculada on-demand.

## 4.4 🟠 `paymentMethod = 'balance'` para crédito interno mezclado con métodos reales

**Evidencia:** `account_payments.payment_method = 'balance'` se usa para movimientos internos de crédito (sin dinero real). [src/pages/ReportsPage.jsx:104-107](src/pages/ReportsPage.jsx:104) lo excluye correctamente para ingresos:

```js
const pAccountPayments = (accountPayments || []).filter(p =>
  p.type === "payment" && p.paymentMethod && p.paymentMethod !== "balance" && ...
);
```

Pero **CashShiftPage no aplica el mismo filtro** ([CashShiftPage.jsx:46](src/pages/CashShiftPage.jsx:46)):

```js
const shiftAccPayments = (accountPayments || []).filter(p => p.type === "payment" && p.createdAt && new Date(p.createdAt) >= shiftStart);
```

`apCash/apTransfer/apCard` después filtran por método explícito (`'cash'/'transfer'/'card'`), por lo que `'balance'` queda fuera del cierre — pero aparece en la tabla "Cobros de cuenta corriente" del panel, confundiendo al cajero.

**Solución:** excluir `'balance'` también en el filtro inicial de `shiftAccPayments`. O renderizarlos en una sección aparte ("Movimientos internos de crédito").

## 4.5 🟡 `payForm.amount` sin sanitización de decimales

**Evidencia:** `Number(payForm.amount)` puede aceptar `1.234567`. ARS no maneja más de 2 decimales. La suma de pagos puede generar discrepancias visibles ($0.01 sobrantes/faltantes).

**Solución:** redondear a 2 decimales en input + en SQL (`numeric(12,2)`).

---

# 5. Cuenta corriente proveedores / Gastos — bugs

## 5.1 🔴 Eliminar gasto borra `supplier_payments` retroactivamente

**Evidencia:** [src/pages/ExpensesPage.jsx:328-340](src/pages/ExpensesPage.jsx:328):

```js
const del = async (id) => {
  if (confirm("¿Eliminar gasto?")) {
    await supabase.from("expenses").delete().eq("id", id);
    await supabase.from("supplier_payments").delete().eq("expense_id", id);
  }
};
```

**Impacto:** si el gasto ya estaba pagado (con `payment` registrado en `supplier_payments`), ese pago también se elimina. El proveedor "vuelve a deber" lo que ya cobró. **El dinero ya salió de caja**, pero el sistema lo borra.

**Solución:**
- No permitir eliminar gastos `paid`. Solo permitir `cancelled` con compensación: agregar un `payment` negativo o un `refund`.
- Mejor: soft delete (`deleted_at`) que filtra de las vistas pero conserva historia.

## 5.2 🟠 `paymentMethod` del payment usa `todayStr()` perdiendo la fecha real del pago

**Evidencia:** [src/pages/ExpensesPage.jsx:214](src/pages/ExpensesPage.jsx:214) y [ExpensesPage.jsx:308](src/pages/ExpensesPage.jsx:308):

```js
const payment = { ..., date: todayStr(), notes: "Pago de gasto" };
```

Si pagás un gasto retroactivamente (vino factura de octubre, la cargás en noviembre como `paid`), el `payment` queda con `date=hoy`. La conciliación con el extracto bancario falla.

**Solución:** preguntar fecha de pago en el modal de cierre del gasto. Default = hoy, editable.

## 5.3 🟠 Eliminar proveedor sin tx

**Evidencia:** [src/pages/SuppliersPage.jsx:63-80](src/pages/SuppliersPage.jsx:63). Tres operaciones secuenciales:
1. `delete from supplier_payments`
2. `update expenses set supplier=null`
3. `delete from suppliers`

Si la 2 falla, el proveedor sigue existiendo pero sus movimientos no.

**Solución:** RPC `eliminar_proveedor(p_supplier_id)` con tx. O mejor, soft-delete (`is_active=false`).

## 5.4 🟡 Gastos de `Ingredientes` con IVA — cálculo en cliente

**Evidencia:** [src/pages/ExpensesPage.jsx:190-194](src/pages/ExpensesPage.jsx:190). `unitPrice` se calcula en el cliente y se guarda. Si el `vatRate` global cambia mañana, los gastos viejos no se recalculan, pero los nuevos sí. Inconsistencia para reportes históricos.

**Solución:** guardar `vat_rate_at_save` como parte del expense. Mostrarlo en los reportes.

---

# 6. Reports — bugs

## 6.1 🔴 `closedSales` excluye `'paid'` y `'ready'`

**Evidencia:** [src/pages/ReportsPage.jsx:95](src/pages/ReportsPage.jsx:95):

```js
const closedSales = pSales.filter(s => s.status === "closed" || s.status === "delivered");
```

Mientras tanto las ventas MP se quedan en `status='ready'` y nunca pasan a `closed`. **No aparecen en Reports.**

**Solución:** incluir `ready`, `paid` y `delivered` cuando `paid_at != null`. O unificar la máquina de estados (ver `BACKEND_PASARELA_PAGO.md` §2).

## 6.2 🟠 `directIncome` excluye `payment_method='account'` pero no `'mercadopago'`

Probablemente OK, pero combinado con §6.1, los ingresos por MP no se computan.

## 6.3 🟠 Mezcla `expense.date` (string) con `Date()`

**Evidencia:** [src/pages/ReportsPage.jsx:296-299](src/pages/ReportsPage.jsx:296). Comparaciones de fechas via `e.date >= from && e.date <= to` donde `from/to` son strings ISO. Funciona porque ISO es ordenable lexicográficamente, **pero** si `e.date` viniera como `null`, el filtro silenciosamente lo deja afuera (o lo incluye según ordenamiento). Sin coverage de tests.

**Solución:** normalizar todos los `date` como `DATE` SQL no nulo. CHECK constraint.

---

# 7. Queries SQL de diagnóstico (no ejecutar sin backup)

> Estas queries identifican inconsistencias reales en los datos actuales.
> Correr **en SQL Editor de Supabase** una por una, leer los resultados antes
> de tomar acción.

### Q1 — Ventas `closed` cuyo total no cuadra con la suma de items

```sql
SELECT id, customer_name, total,
       (SELECT sum((i->>'subtotal')::numeric) FROM jsonb_array_elements(items) i) AS items_sum,
       status, created_at
FROM sales
WHERE status IN ('closed','delivered','paid','ready')
  AND abs(
    total -
    coalesce((SELECT sum((i->>'subtotal')::numeric)
              FROM jsonb_array_elements(items) i
              WHERE (i->>'includeInTicket')::bool IS NOT FALSE), 0)
    - coalesce(discount_amount, 0)
  ) > 1
ORDER BY created_at DESC;
```

### Q2 — Ventas `account` sin charge en `account_payments`

```sql
SELECT s.id, s.customer_name, s.total, s.paid_at
FROM sales s
LEFT JOIN account_payments ap
  ON ap.sale_id = s.id AND ap.type = 'charge'
WHERE s.payment_method = 'account'
  AND s.status IN ('closed','delivered')
  AND ap.id IS NULL;
```

### Q3 — Charges en `account_payments` sin sale (cuando deberían tenerla)

```sql
SELECT ap.id, ap.customer_id, ap.amount, ap.notes, ap.created_at
FROM account_payments ap
WHERE ap.type = 'charge'
  AND ap.sale_id IS NULL
  AND ap.payment_method NOT IN ('balance')        -- excluir consumos de crédito
  AND ap.notes NOT ILIKE '%apertura%'             -- excluir saldo inicial
ORDER BY ap.created_at DESC;
```

### Q4 — Stock movements vs ventas: productos vendidos sin movement

```sql
WITH sold AS (
  SELECT (i->>'productId')::uuid AS pid,
         sum((i->>'qty')::numeric) AS qty_sold
  FROM sales, jsonb_array_elements(items) i
  WHERE status IN ('closed','delivered','paid','ready')
    AND created_at::date = current_date
  GROUP BY 1
),
moved AS (
  SELECT product_id AS pid, sum(-qty) AS qty_moved
  FROM stock_movements
  WHERE created_at::date = current_date
    AND type LIKE '%sale%'
  GROUP BY 1
)
SELECT p.name, s.qty_sold, coalesce(m.qty_moved, 0) AS qty_moved,
       s.qty_sold - coalesce(m.qty_moved, 0) AS diff
FROM sold s
JOIN products p ON p.id = s.pid
LEFT JOIN moved m ON m.pid = s.pid
WHERE s.qty_sold <> coalesce(m.qty_moved, 0);
```

### Q5 — Saldo de cliente: 3 cálculos distintos, ¿coinciden?

```sql
SELECT c.id, c.name,
       c.balance AS balance_col,
       coalesce(sum(CASE WHEN ap.type='payment' THEN ap.amount
                         WHEN ap.type='charge'  THEN -ap.amount END), 0) AS ap_sum,
       c.balance + coalesce(sum(CASE WHEN ap.type='payment' THEN ap.amount
                                     WHEN ap.type='charge'  THEN -ap.amount END), 0) AS reports_total
FROM customers c
LEFT JOIN account_payments ap ON ap.customer_id = c.id
GROUP BY c.id, c.name, c.balance
HAVING c.balance <> 0;  -- foco en quienes traen saldo apertura
```

### Q6 — Cash shifts solapados (no debería haber dos `open` jamás)

```sql
SELECT id, opened_by, opened_at FROM cash_shifts WHERE status = 'open';
-- Esperado: 0 o 1 fila. Más de 1 = bug crítico.
```

### Q7 — Gastos pagados sin payment en `supplier_payments`

```sql
SELECT e.id, e.concept, e.total, e.payment_method, e.supplier
FROM expenses e
WHERE e.supplier_id IS NOT NULL
  AND e.payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM supplier_payments sp
    WHERE sp.expense_id = e.id AND sp.type = 'payment'
  );
```

### Q8 — Saldo de proveedor con totales inconsistentes (cargo sin gasto vinculado)

```sql
SELECT sp.id, sp.supplier_id, sp.amount, sp.type, sp.notes, sp.expense_id
FROM supplier_payments sp
WHERE sp.type = 'charge'
  AND sp.expense_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = sp.expense_id);
```

### Q9 — Ventas con total negativo (descuento > subtotal)

```sql
SELECT id, customer_name, total, discount_amount, discount_value, discount_type, created_at
FROM sales
WHERE total <= 0 AND status IN ('closed','delivered','paid','ready');
```

### Q10 — Ventas MP en estado `ready` (no contabilizadas en caja)

```sql
SELECT id, customer_name, total, payment_method, status, paid_at
FROM sales
WHERE status = 'ready'
  AND payment_method = 'mercadopago'
ORDER BY paid_at DESC;
```

### Q11 — Pedidos cancelados sin reversa de stock

```sql
-- Suma vendida en pedidos cancelados HOY que probablemente no se reembolsó.
SELECT s.id, s.customer_name, s.total, s.created_at,
       (SELECT sum((i->>'qty')::numeric)
        FROM jsonb_array_elements(s.items) i) AS qty_perdida_de_stock
FROM sales s
WHERE s.status = 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements m
    WHERE m.created_at >= s.created_at - interval '1 day'
      AND m.type IN ('cancellation','refund')
      AND m.notes ILIKE '%' || s.id::text || '%'
  );
```

### Q12 — Duplicación de cobros (mismo sale_id con dos charges)

```sql
SELECT sale_id, count(*) FROM account_payments
WHERE type = 'charge' AND sale_id IS NOT NULL
GROUP BY sale_id HAVING count(*) > 1;
```

### Q13 — Suma de turno cerrado vs realidad

```sql
SELECT cs.id, cs.opened_at, cs.closed_at,
       cs.sales_cash AS guardado_cash,
       (SELECT coalesce(sum(total), 0)
        FROM sales
        WHERE payment_method = 'cash'
          AND status IN ('closed','delivered')
          AND coalesce(paid_at, created_at) BETWEEN cs.opened_at AND cs.closed_at) AS real_cash
FROM cash_shifts cs
WHERE cs.status = 'closed'
ORDER BY cs.closed_at DESC LIMIT 30;
-- Diferencias entre guardado_cash y real_cash = bug histórico
```

---

# 8. Tabla de control para el merge

| # | Bug | Fix obligatorio antes de prod | Fix recomendado primera iteración |
|---|-----|:--:|:--:|
| 1 | Venta+stock+CC en una sola RPC | ✅ | |
| 2 | `account` requiere customer (CHECK constraint) | ✅ | |
| 3 | Cancelar pedido reembolsa stock | ✅ | |
| 4 | Estados MP unificados → caja y reports | ✅ | |
| 5 | Filtro de gastos `date` vs `createdAt` | ✅ | |
| 6 | `aplicar_pago_cliente` como RPC | ✅ | |
| 7 | UNIQUE index `cash_shifts(status='open')` | ✅ | |
| 8 | Desglose ventas vs cobros CC en turno | | ✅ |
| 9 | Cap descuento al 100% y total ≥ 0 | ✅ | |
| 10 | Auditoría de override de precios | | ✅ |
| 11 | Soft delete cliente, FK explícita | ✅ | |
| 12 | Eliminar gasto solo si pending | ✅ | |
| 13 | Migrar `customer.balance` a `account_payments` | ✅ | |
| 14 | Reservar stock atómicamente | ✅ | |
| 15 | Fecha de pago editable en gasto | | ✅ |
| 16 | Reports incluye ready/paid | ✅ | |
| 17 | Máquina de estados Kanban | ✅ | |
| 18 | `crypto.randomUUID()` unificado | | ✅ |
| 19 | `numeric(12,2)` y redondeo monetario | | ✅ |
| 20 | RLS y CHECK constraints | ✅ | |
| 21 | Egresos por transfer en panel digital | | ✅ |
| 22 | Idempotencia con submitting + lock SQL | ✅ | |
| 23 | `audit_log` transaccional | | ✅ |

**Bloqueantes (🔴 directos): 1, 2, 3, 4, 5, 6, 7, 14, 16, 17, 20.**
