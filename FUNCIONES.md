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
| `ProductsPage`, `ImportPage` | Escritura **absoluta** del campo `stock` (edición manual e import CSV). |
| `mp-webhook` (Edge Function) | `descontar_stock_pedido` al aprobarse el pago; reembolsa si no hay stock. |

---

## `src/utils/viandaForecast.js` — proyección de demanda de viandas

Motor puro (no toca Supabase ni el DOM) que responde "si programo el menú X para
el día D, ¿cuántas unidades voy a vender?". Lo usa `ViandaProjectionPage`.

### Modelo

No es un promedio. Es **mixto: mitad de arriba hacia abajo, mitad de abajo hacia
arriba**, y esa mezcla no es un capricho — sale de medir el error contra el
historial real:

1. **Total del día** = `nivel_diario × f_día_semana × f_mes × f_calendario ×
   f_tendencia × sesgo_global`. Es la parte fuerte del modelo: hay 90+ días de
   historial y en el backtest quedó en ~21% de error.
2. **Reparto** de ese total entre los menús programados, según el nivel propio de
   cada uno.
3. **Nivel propio** de cada menú, reestacionalizado, como estimación
   independiente.
4. La proyección final mezcla 3 y 2 con peso `BOTTOM_UP_BLEND = 0.65`.

El nivel base se calcula sobre observaciones **desestacionalizadas** (cada venta
se divide por los factores de su propio día) para no contar dos veces el efecto
del día de la semana en un menú que solo se ofrece los lunes.

**Los días sin oferta no cuentan como demanda cero:** solo se promedian los días
en que el menú estuvo efectivamente a la venta.

**Por qué repartir el total importa:** el negocio ofrece ~10 menús por día y
vende ~53 viandas diarias con muy poca varianza. Si un día se ofrecen 6 menús se
venden ~8 de cada uno; si se ofrecen 16, ~3. Un modelo plato-por-plato no ve ese
efecto.

| Función | Qué hace |
|---|---|
| `extractViandaHistory(sales, products)` | Unidades de vianda por producto y por día. Expande kits a componentes, ignora canceladas y usa `delivery_date` si existe. |
| `dowFactors` / `monthFactors` / `trendFactor` | Factores de día de semana, estacionalidad mensual y tendencia, con encogimiento hacia 1 cuando hay pocos datos. |
| `calendarFactor(date)` | Feriados (×0.5) y días puente (×0.85). Solo eventos discretos: la estacionalidad de temporada la aporta `f_mes`. |
| `holidaysFor(year)` / `easterSunday(year)` | Feriados nacionales argentinos, incluidos los móviles (Pascua) y los trasladables (Ley 27.399). Los puentes por decreto se agregan a mano en `EXTRA_HOLIDAYS`. |
| `dailyBaseLevel(ctx)` / `forecastDayTotal(ctx, date)` | Total de viandas de un día promedio y proyección del total de un día concreto. |
| `menuLevel(ctx, productId, fallback)` | Nivel propio del menú, encogido hacia `fallback` (el menú promedio del día). Ese encogimiento es también el arranque en frío. |
| `learnedBias(planItems, productId)` | Corrección aprendida: cuánto se equivocó el modelo en las semanas cerradas. Global, y por menú encogido sobre el global. |
| `buildForecastContext(sales, products, planItems, refDate)` | Precalcula historial y factores para toda la semana. |
| `forecastPlan(ctx, plan, opts)` | **Entrada principal.** Los menús del mismo día se resuelven juntos porque se reparten el total y el cupo de producción. |
| `dayCoverageMultiplier(ctx, nivel)` | Cuánto producir de más sobre el total del día para cubrir el nivel de servicio. |
| `coverageMultiplier(ctx, id, nivel)` | Lo mismo para un plato solo. Se muestra como referencia en el detalle, no decide la producción. |
| `allocateIntegers(pesos, total)` | Reparte el cupo del día en enteros por el método del mayor resto. |
| `menuReliability(ctx, productId)` | Confianza, días de historial y unidades promedio de un menú, sin depender del día. |
| `quantile(ordenados, p)` | Percentil con interpolación lineal. |
| `forecastMenu(ctx, opts)` | Atajo para un menú suelto; si ese día hay otros, pasarlos en `dayPlan`. |
| `accuracyReport(planItems)` | MAPE, sesgo, aciertos dentro de ±15% y veces que faltó producción. |
| `actualUnitsFor(ctx, productId, date)` | Lo realmente vendido, para cerrar el ciclo sin carga manual. |

### Cuánto producir: nivel de servicio

La proyección es el valor **central**: producir exactamente eso deja sin stock
cerca de la mitad de los días. El colchón no es un porcentaje fijo — sale de la
dispersión real del historial y de un **nivel de servicio** elegido (90% por
defecto): *"que la comida alcance 9 de cada 10 días"*.

**El colchón se calcula sobre el total del día y después se reparte**, no sobre
cada plato por separado. Medido sobre el historial real:

| Política | Producir (demanda = 888 u.) | Sobrante | Días sin comida |
|---|---:|---:|---:|
| Cubrir cada plato al 90% | 2126 u. | 157% | — |
| **Cubrir el día al 90%** | **1293 u.** | **46%** | **1 de 19** |

Cubrir cada plato por separado obliga a producir 2,4 veces lo que se vende:
inviable para comida fresca. La diferencia es que los menús **se sustituyen entre
sí** — quien no encuentra su plato elige otro —, así que lo que no puede faltar
es la comida del día, no un plato en particular.

El reparto del cupo usa el método del mayor resto (`allocateIntegers`), para no
perder ni inventar unidades al redondear.

### Corte del historial

`HISTORY_START = "2026-06-01"`. Antes de esa fecha el sistema no se usaba de
forma consistente y esas ventas no representan demanda real: se ignoran a
propósito. Es preferible un modelo con menos datos que uno con datos que mienten.
`buildForecastContext(..., { from })` permite mover el corte para analizar otro
período.

### Precisión medida (backtest sobre el historial real)

| Métrica | Valor |
|---|---|
| Total de viandas del día | ~21% de error (WAPE) |
| Por menú individual | ±3.6 unidades (MAE), 54% dentro de ±2 u. |

El número confiable es el **total del día**; la asignación plato por plato tiene
un techo bajo porque el catálogo rota constantemente (la mitad de los menús tiene
menos de 3 días de historial) y cada plato vende ~5 unidades. Por eso la pantalla
muestra el total proyectado por día además del detalle por menú.

### Qué significa la confianza

Mide **cuánto se puede creer el número**, no el volumen ni la probabilidad de
vender al menos esa cantidad. Sale de dos cosas: cuántos días se ofreció el menú
(`samples`) y qué tan parejo vendió (`cv`).

| Etiqueta | Criterio |
|---|---|
| alta | 8+ días de historial y `cv` ≤ 0.45 |
| media | 4+ días y `cv` ≤ 0.75, o 8+ días con más dispersión |
| baja | menos de 2 días (arranque en frío) o poco historial y disperso |

Un plato que vende 2 unidades todos los días tiene confianza **alta**: se sabe
bien que va a vender 2. `menuReliability` la expone para mostrarla en el desplegable
al elegir un menú.

Tests en `src/utils/viandaForecast.test.js` (`npm test`).

## `src/utils/viandaPlans.js` — persistencia de la planificación

| Función | Qué hace |
|---|---|
| `fetchViandaPlans()` | Carga todas las planificaciones y sus ítems. |
| `saveViandaPlan({...})` | Guarda una semana: borra los menús que se sacaron, inserta los nuevos, actualiza los que siguen. Los ítems ya cerrados se preservan intactos. |
| `syncActualSales(items, ctx)` | Cierra el ciclo: completa `actual_qty` de los días pasados leyéndolo del historial de ventas. |
| `saveProducedQty(item, qty)` | Registra cuántas unidades se produjeron finalmente. |

Las consultas se limitan a `select / eq / order` y el filtrado fino va en
memoria: es lo único que soporta el cliente del modo demo.
