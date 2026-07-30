# Funciones — NutriFree POS

## Funciones RPC de Postgres

Todas hacen ajustes **relativos** (`stock = stock ± delta`) en lugar de escribir un
valor absoluto, para que dos operaciones simultáneas no se pisen.

| Función | Definida en | Qué hace |
|---|---|---|
| `apply_production` | `supabase-concurrency-fixes.sql` | Suma stock al producto, registra el movimiento y descuenta los ingredientes consumidos, todo en una transacción. |
| `complete_sale_stocks` | `supabase/migrations/20260729_fix_stock_deduction.sql` | Descuenta stock de productos por una venta o pedido. No lanza excepción ante falta de stock: devuelve `shortfall` (faltante) y `missing` (producto inexistente) por fila para que la UI avise. |
| `cancel_order_stocks` | `supabase-concurrency-fixes.sql` | Restaura el stock de un pedido cancelado y registra los movimientos con el motivo. |
| `descontar_stock_pedido` | `supabase/migrations/20260729_fix_stock_deduction.sql` | Descuenta stock de un pedido web pagado por MercadoPago. **Sí lanza excepción** si falta stock o el producto no existe: el webhook la captura y reembolsa el pago. |
| `adjust_ingredient_stock` | `supabase-concurrency-fixes.sql` | Ajuste relativo del stock de un ingrediente y, opcionalmente, su costo unitario. |
| `adjust_product_stock` | `supabase-concurrency-fixes.sql` | Ajuste relativo del stock de un producto (registro manual de producción). |
| `adjust_customer_balance` | `supabase-concurrency-fixes.sql` | Ajuste relativo del saldo en cuenta corriente de un cliente. |
| `accumulate_employee_hours` | `supabase-productions.sql` | Acumula horas de cocina y empaque de un empleado. |
| `handle_new_auth_user` | `supabase-business-users.sql` | Trigger: crea el perfil de usuario al registrarse en Auth. |

### Por qué dos políticas distintas ante falta de stock

`complete_sale_stocks` (operación interna) no bloquea: marcar un pedido como listo
o cobrarlo no debe fallar por stock, así que registra el faltante y avisa.
`descontar_stock_pedido` (pago web ya cobrado) sí falla, porque sin stock
corresponde reembolsar al cliente.

---

## `src/utils/stock.js` — modelo de descuento de stock

Única fuente de verdad para el movimiento de stock de ventas y pedidos, compartida
por `POSPage`, `OrdersPage` y `OrdersKanbanPage`.

**Modelo:** el stock se descuenta cuando el pedido pasa a **"Listo para Retirar"**
(`ready`), no al crearlo. Una venta directa del POS nace en `closed` (equivale a
entregada) y descuenta en el acto. Un pedido nace en `open` y todavía no
compromete stock: descuenta al avanzar a `ready` o, si se cobra sin haber pasado
por ahí, al cerrarlo.

**Invariante:** el stock está descontado si y solo si el estado de la venta es uno
de `DEDUCTED_STATUSES` (`ready`, `delivered`, `closed`). Las transiciones son
simétricas: entrar a un estado descontado descuenta, salir de él devuelve.

| Función | Qué hace |
|---|---|
| `buildStockDeltas(items)` | Expande los items a deltas por producto, resolviendo kits a sus componentes y acumulando repetidos. |
| `stockAlreadyDeducted(sale)` | ¿El stock de esta venta ya fue descontado? Se deriva del estado. |
| `deductSaleStock(items)` | Descuenta stock vía `complete_sale_stocks`. Lanza si la RPC falla. |
| `restoreSaleStock(sale)` | Restaura stock vía `cancel_order_stocks`, solo si el pedido lo había descontado. |
| `syncStockForStatusChange(sale, newStatus)` | Descuenta, devuelve o no hace nada según lo que requiera la transición. Devuelve `{action, results, deltas}`. |
| `applyStockResults(products, results)` | Aplica al estado local de React los stocks devueltos por las RPC. |
| `stockWarning(results)` | Arma el aviso de faltantes y productos inexistentes. `null` si salió limpio. |

Tests en `src/utils/stock.test.js` (`npm test`).

### Dónde se toca stock además de ventas y pedidos

| Lugar | Operación |
|---|---|
| `ProductionPage` | `apply_production`: suma producto, descuenta ingredientes. |
| `ProductionLogPage` | `adjust_product_stock`: suma producto por producción registrada. |
| `IngredientsPage`, `ExpensesPage` | `adjust_ingredient_stock`: ajustes y compras de ingredientes. |
| `ProductsPage`, `ImportPage` | Escritura **absoluta** del campo `stock` (edición manual e import CSV). |
| `mp-webhook` (Edge Function) | `descontar_stock_pedido` al aprobarse el pago; reembolsa si no hay stock. |
