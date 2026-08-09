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
| `availableStock(product, products)` | Stock realmente disponible. En un kit: mínimo de `stock_componente / qty` (0 si falta un componente). |
| `isKitProduct(product)` | ¿El producto tiene componentes? |

**Kits:** un kit **no tiene stock propio** — su columna `products.stock` nunca se
descuenta (las ventas se expanden a componentes). Lo disponible es cuántos kits
se pueden armar: ej. kit = 1 pan de carne (20) + 1 canastita (15) → **15**.
`availableStock` es la única fuente para mostrar y limitar stock de kits
(`POSPage`, `ProductsPage`, `MenuPage`); en el alta/edición de un kit el campo
"Stock actual" se muestra calculado y deshabilitado.

Tests en `src/utils/stock.test.js` (`npm test`).

### Dónde se toca stock además de ventas y pedidos

| Lugar | Operación |
|---|---|
| `ProductionPage` | `apply_production`: suma producto, descuenta ingredientes. |
| `ProductionLogPage` | `adjust_product_stock`: suma producto por producción registrada. |
| `IngredientsPage`, `ExpensesPage` | `adjust_ingredient_stock`: ajustes y compras de ingredientes. |
| `ProductsPage`, `ImportPage` (pestañas Ingredientes/Productos/Recetas) | Escritura **absoluta** del campo `stock` (edición manual e import CSV). |
| `mp-webhook` (Edge Function) | `descontar_stock_pedido` al aprobarse el pago; reembolsa si no hay stock. |

> La pestaña **Precios** de `ImportPage` es la excepción: nunca escribe `stock`.
> Ver `src/utils/priceImport.js`.

## `src/utils/supplierAccount.js` — cuenta corriente de proveedores

Única fuente de verdad de la deuda con proveedores, compartida por `ExpensesPage`,
`SuppliersPage`, `CashShiftPage` y `ReportsPage`.

**Modelo:** la tabla `supplier_payments` es un libro de movimientos. Un `charge`
es deuda que generamos (un gasto), un `payment` es plata que le pagamos. Un
movimiento con `expense_id` está imputado a ese gasto; sin `expense_id` es
apertura, ajuste o pago a cuenta. Signo del saldo: **positivo = el proveedor nos
debe** (saldo a favor), **negativo = le debemos**.

**Invariante:** todo gasto con proveedor tiene su `charge` —uno solo, garantizado
por el índice `uniq_sp_expense_charge`—, se haya cargado como pagado o pendiente
(si nace pagado, se generan `charge` + `payment` juntos, neto 0). El estado de
pago —`pending` / `partial` / `paid`— **se deriva** de los pagos imputados;
`expenses.payment_status` es sólo un espejo desnormalizado para filtros y
reportes, que se mantiene sincronizado.

**Excepción:** los gastos anteriores a este modelo no tienen ningún movimiento.
Para ellos `hasLedger()` da `false` y vale su `payment_status` guardado — leerlos
como "sin pagos" los mostraría a todos como pendientes. Por el mismo motivo, un
gasto sin cargo nunca se ofrece para pagar: generaría un `payment` sin `charge`
que lo respalde y dejaría al proveedor con saldo a favor de la nada.

**No hay tope de pagos por gasto:** un gasto admite tantos `payment` como haga
falta hasta cubrir su cargo (el índice `uniq_supplier_payment_per_expense`, que
permitía uno solo, se eliminó). Que no se pague de más lo garantiza
`allocatePayment`, que nunca imputa más que el saldo restante.

| Función | Qué hace |
|---|---|
| `supplierBalance(movs, supplierId)` | Saldo del proveedor: pagos − cargos. |
| `supplierDebt(movs, supplierId)` | Lo que le debemos (0 si está al día o a favor). |
| `availableCredit(movs, supplierId)` | Saldo a favor no imputado a ningún gasto. |
| `expensePaid(movs, expenseId)` | Total ya imputado a ese gasto (suma de parciales). |
| `expenseRemaining(expense, movs)` | Lo que falta pagar del gasto. |
| `expenseStatus(expense, movs)` | Estado derivado: `pending` / `partial` / `paid`. |
| `unpaidSupplierExpenses(expenses, movs, supplierId)` | Gastos con saldo, del más viejo al más nuevo (FIFO). |
| `allocatePayment({...})` | Reparte un pago: aplica el saldo a favor y el monto ingresado FIFO sobre los gastos tildados; lo que sobra queda a favor. |
| `buildPaymentMovements({...})` | Traduce esa imputación a las filas de `supplier_payments`. |
| `planExpenseLedger({expense, movs})` | Reconcilia los movimientos de un gasto con su estado: crea/ajusta el cargo, completa el pago, arrastra el proveedor. Devuelve `{insert, update, remove, paymentStatus}`. |
| `expenseStatusUpdates(expenses, movs, ids, method)` | Qué gastos quedaron con el espejo `payment_status` desactualizado. |

**Pago desde Proveedores:** el botón "Pagar" abre `components/SupplierPayModal.jsx`,
que lista los gastos pendientes con checkbox y acepta un monto libre. Con dos
gastos de $50.000 y un pago de $70.000, el más viejo queda saldado y el segundo
parcialmente pagado, mostrando el importe original tachado junto al saldo que
queda. El saldo a favor se aplica solo, siempre a los gastos más viejos, con el
par `payment` imputado + `charge` de consumo (mismo patrón que en clientes).

**Caja:** los egresos del turno se cuentan por una sola vía para no descontar dos
veces — los gastos **sin** proveedor por el gasto, los gastos **con** proveedor
por su movimiento en la cuenta corriente, que es cuando la plata sale de verdad.
Los movimientos con método `balance` son saldo a favor y no mueven efectivo.

Tests en `src/utils/supplierAccount.test.js` (`npm test`).

## `src/utils/priceImport.js` — actualización masiva de precios

Motor de la pestaña **Precios** de `ImportPage` (UI en `src/components/PriceUpdatePanel.jsx`).
A diferencia de las otras pestañas de importación, que parten de una plantilla
vacía y hacen upsert de la fila entera, acá la planilla se genera **con los
productos ya cargados** y el importador escribe **solo** `price_retail` y
`price_wholesale`.

**Ciclo:** descargar `.xlsx` → editar las columnas de precio en Excel → volver a
subir el mismo archivo → **auditar la planilla** → revisar el diff → aplicar.

| Función | Qué hace |
|---|---|
| `buildPriceSheet(products, {onlyActive})` | Arma la matriz de la planilla (`id`, `producto`, `categoria`, `precio_minorista`, `precio_mayorista`) ordenada por categoría y nombre. |
| `parsePriceSheet(matrix)` | Normaliza el archivo subido: encabezados sin acentos ni mayúsculas, filas vacías descartadas. Devuelve `{rows, missing}`. |
| `parsePrice(value)` | Interpreta precios en formato es-AR (`"$ 1.234,50"`) y en-US (`"1,234.50"`). Celda vacía → `null`. |
| `auditPriceSheet(rows, products)` | Verifica que la planilla siga íntegra: `{missing, duplicates, renamed, expected}`. |
| `diffPriceRows(rows, products)` | Compara contra la base y devuelve `{changes, unchanged, errors}`. Solo produce cambios de precio. |
| `changeToDbPatch(change)` | Patch mínimo para Supabase: únicamente las columnas de precio que cambiaron. |
| `applyChangeToProduct(product, change)` | Aplica el cambio al estado local de React sin tocar el resto de los campos. |

**Invariantes:**
- El match es por `id`, no por nombre: renombrar un producto en la planilla no
  rompe nada y **nunca se crean productos nuevos** desde acá (un `id` inexistente
  se reporta como error).
- Una celda de precio **vacía significa "no cambiar"**, no "poner en 0".
- Si algún precio de la fila es negativo, la fila entera se descarta.
- Ediciones en `producto` o `categoria` se ignoran silenciosamente.
- Los cambios se agrupan por patch idéntico y se aplican con un `update ... in(ids)`
  por grupo (subir 200 productos al mismo precio = 1 sola query).

**Integridad de la planilla.** Excel no permite bloquear el borrado de filas
dejando las celdas de precio editables: haría falta escribir estilos por celda
—para desbloquearlas— y la build community de SheetJS no los escribe, así que
proteger la hoja la volvería de solo lectura. El control se hace entonces al
importar, con `auditPriceSheet`:

| Detecta | Qué pasa |
|---|---|
| **Filas borradas** — falta algún producto que debería estar | Aviso con la lista; hay que tildar "actualizar igual" para seguir. Los que faltan quedan con su precio actual. |
| **Ids repetidos** — la misma fila pegada dos veces | **Bloquea**: no se puede saber qué precio vale. Sin opción de forzar. |
| **Nombres corridos** — el `producto` de la fila no es el de la base | Aviso con las filas; hay que confirmar. Es la señal de una columna de precios pegada desfasada, que asignaría precios al producto equivocado. |
| **Columnas borradas o renombradas** | `parsePriceSheet` devuelve `missing` y no se procesa nada. |

El alcance se infiere de la propia planilla: si no trae ningún producto inactivo
se asume que se descargó con "solo activos", así que los inactivos ausentes no
cuentan como filas borradas.

Tests en `src/utils/priceImport.test.js` (`npm test`).
