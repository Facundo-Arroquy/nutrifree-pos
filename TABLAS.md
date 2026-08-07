# Tablas de la base de datos — NutriFree POS

| Tabla (nombre en DB)   | Traducción           | Contenido                                                                                                      |
|------------------------|----------------------|----------------------------------------------------------------------------------------------------------------|
| `products`             | Productos            | Nombre, categoría, precios (minorista/mayorista), unidad, stock, activo, foto, descripción, ítems de kit, `is_favorite` (boolean — favorito global compartido entre todos los usuarios), `freezable` (boolean — el producto es **apto para freezer**; es una propiedad del producto, no su estado de venta: no indica si hoy se vende fresco o congelado). Si `kit_items` no está vacío el producto es un kit: su columna `stock` se ignora (el disponible se calcula con `availableStock` a partir de los componentes). |
| `customers`            | Clientes             | Nombre, teléfono, dirección, notas, lista de precios, saldo en cuenta corriente, descuento, email, CUIT, `default_billing` (boolean — activa facturación automáticamente en el POS al seleccionar el cliente). |
| `sales`                | Ventas / Pedidos     | Cliente, ítems comprados, total, método de pago, estado del pedido, descuento, fecha de entrega, facturación. |
| `recipes`              | Recetas              | Producto asociado, tiempos de preparación y cocción, rendimiento, pasos (JSONB), margen mínimo, notas, `is_favorite` (boolean — favorito global compartido entre todos los usuarios). |
| `recipe_ingredients`   | Ingredientes de receta | Relación receta ↔ ingrediente con cantidad, unidad y costo unitario.                                        |
| `ingredients`          | Ingredientes         | Nombre, categoría, unidad, stock actual, stock mínimo, costo unitario, proveedor, notas e información nutricional (calorías, proteínas, carbs, grasa, fibra, azúcar, sodio). |
| `expenses`             | Gastos               | Fecha, proveedor, concepto, cantidad, unidad, precio unitario, total, método y estado de pago, categoría, subcategoría (texto libre para categorías no-ingredientes), notas, proveedor vinculado, líneas de ingredientes (cada línea puede tener su propia subcategoría). |
| `suppliers`            | Proveedores          | Nombre, teléfono, email, dirección, notas.                                                                     |
| `supplier_payments`    | Pagos a proveedores  | Movimientos de cuenta corriente del proveedor: cargos (gastos) y pagos realizados, con monto, método y fecha. |
| `account_payments`     | Pagos en cuenta corriente | Movimientos de cuenta corriente de clientes: cargos (ventas en cuenta) y pagos recibidos.               |
| `stock_movements`      | Movimientos de stock | Registro de cada suma o baja de stock de productos: tipo (producción, cancelación), cantidad y notas.         |
| `cash_shifts`          | Turnos de caja       | Apertura y cierre de caja: usuario, efectivo inicial, ventas por método de pago, gastos en efectivo, efectivo contado y diferencia. |
| `categories`           | Categorías           | Lista de categorías de productos (solo nombre).                                                                |
| `expense_categories`   | Categorías de gastos | Lista de categorías de gastos (solo nombre).                                                                   |
| `expense_subcategories` | Subcategorías de gastos | Subcategorías vinculadas a una categoría de gasto (`name`, `category_name`). Creadas por admins. Se usan para clasificar gastos con mayor detalle. En gastos de Ingredientes, la subcategoría se asigna por línea (dentro de `ingredient_lines` JSONB). |
| `faq_entries`          | Entradas de FAQ      | Preguntas y respuestas del asistente de ayuda interno.                                                         |
| `faq_missed`           | Preguntas sin respuesta | Consultas que el asistente de ayuda no pudo responder, para revisión posterior.                             |
| `app_settings`         | Configuración de la app | Parámetros globales de la aplicación (nombre del negocio, moneda, etc.).                                   |
| `audit_log`            | Registro de auditoría | Log de acciones importantes: ventas, producciones, eliminaciones y accesos, con usuario, acción y detalle.  |
| `customer_inactive_dismissed` | Clientes inactivos contactados | Registro de clientes inactivos cuya alerta fue descartada: cliente, última venta al descartar, quién la descartó y cuándo. La alerta reaparece automáticamente si el cliente hace una nueva compra. |
| `vianda_plans`         | Planificación semanal de viandas | Una fila por semana planificada: `week_start` (lunes, único), `service_level_pct` (nivel de servicio objetivo), notas y quién la creó. `safety_margin_pct` quedó sin uso, por compatibilidad. |
| `vianda_plan_items`    | Menús programados    | Un menú programado para un día: producto, `forecast_qty` (proyección **congelada** al generarla), `recommended_qty` (proyección + colchón del día), `produced_qty` (lo que se produjo), `actual_qty` (lo vendido real), confianza y `forecast_detail` (JSONB con los factores usados). Único por (`date`, `product_id`). |

## Por qué la proyección se congela

`vianda_plan_items.forecast_qty` guarda la proyección tal como se calculó esa
semana y nunca se recalcula. El modelo aprende comparando lo proyectado
*entonces* contra lo vendido: recalcular al vuelo borraría la evidencia del error
y el sesgo no podría estimarse. Al reguardar una semana, los ítems que ya tienen
`actual_qty` se preservan intactos.

## Estados de `sales` y stock

El campo `status` determina si el stock de la venta ya fue descontado — no hay
columna aparte que lo registre:

| Estado | Significado | ¿Stock descontado? |
|---|---|---|
| `pending`   | Pedido web esperando pago de MercadoPago | No |
| `open`      | Pedido cargado, sin preparar | No |
| `preparing` | En preparación | No |
| `ready`     | Listo para retirar | **Sí** |
| `delivered` | Entregado | **Sí** |
| `closed`    | Cobrado y cerrado | **Sí** |
| `cancelled` | Cancelado (el stock se devolvió si se había descontado) | No |

La lógica que mantiene este invariante vive en `src/utils/stock.js`; ver
`FUNCIONES.md`.
