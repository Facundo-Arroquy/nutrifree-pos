# Tablas de la base de datos — NutriFree POS

| Tabla (nombre en DB)   | Traducción           | Contenido                                                                                                      |
|------------------------|----------------------|----------------------------------------------------------------------------------------------------------------|
| `products`             | Productos            | Nombre, categoría, precios (minorista/mayorista), unidad, stock, activo, foto, descripción, ítems de kit.     |
| `customers`            | Clientes             | Nombre, teléfono, dirección, notas, lista de precios, saldo en cuenta corriente, descuento, email, CUIT.      |
| `sales`                | Ventas / Pedidos     | Cliente, ítems comprados, total, método de pago, estado del pedido, descuento, fecha de entrega, facturación. |
| `recipes`              | Recetas              | Producto asociado, tiempos de preparación y cocción, rendimiento, pasos (JSONB), margen mínimo, notas.        |
| `recipe_ingredients`   | Ingredientes de receta | Relación receta ↔ ingrediente con cantidad, unidad y costo unitario.                                        |
| `ingredients`          | Ingredientes         | Nombre, categoría, unidad, stock actual, stock mínimo, costo unitario, proveedor, notas e información nutricional (calorías, proteínas, carbs, grasa, fibra, azúcar, sodio). |
| `expenses`             | Gastos               | Fecha, proveedor, concepto, cantidad, unidad, precio unitario, total, método y estado de pago, categoría, notas, proveedor vinculado, líneas de ingredientes. |
| `suppliers`            | Proveedores          | Nombre, teléfono, email, dirección, notas.                                                                     |
| `supplier_payments`    | Pagos a proveedores  | Movimientos de cuenta corriente del proveedor: cargos (gastos) y pagos realizados, con monto, método y fecha. |
| `account_payments`     | Pagos en cuenta corriente | Movimientos de cuenta corriente de clientes: cargos (ventas en cuenta) y pagos recibidos.               |
| `stock_movements`      | Movimientos de stock | Registro de cada suma o baja de stock de productos: tipo (producción, cancelación), cantidad y notas.         |
| `cash_shifts`          | Turnos de caja       | Apertura y cierre de caja: usuario, efectivo inicial, ventas por método de pago, gastos en efectivo, efectivo contado y diferencia. |
| `categories`           | Categorías           | Lista de categorías de productos (solo nombre).                                                                |
| `expense_categories`   | Categorías de gastos | Lista de categorías de gastos (solo nombre).                                                                   |
| `faq_entries`          | Entradas de FAQ      | Preguntas y respuestas del asistente de ayuda interno.                                                         |
| `faq_missed`           | Preguntas sin respuesta | Consultas que el asistente de ayuda no pudo responder, para revisión posterior.                             |
| `app_settings`         | Configuración de la app | Parámetros globales de la aplicación (nombre del negocio, moneda, etc.).                                   |
| `audit_log`            | Registro de auditoría | Log de acciones importantes: ventas, producciones, eliminaciones y accesos, con usuario, acción y detalle.  |
| `customer_inactive_dismissed` | Clientes inactivos contactados | Registro de clientes inactivos cuya alerta fue descartada: cliente, última venta al descartar, quién la descartó y cuándo. La alerta reaparece automáticamente si el cliente hace una nueva compra. |
