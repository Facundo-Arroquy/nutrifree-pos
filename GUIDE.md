# Nutrifree Manager — Guía de uso

## Acceso y usuarios

| Usuario | Contraseña | Rol | Acceso |
|---|---|---|---|
| Administrador | *(ver src/shared.jsx)* | admin | Todo el sistema |
| Vendedor | *(ver src/shared.jsx)* | vendor | Todo excepto Reportes |
| Demo | demo1234 | admin (demo) | Entorno aislado, sin DB real |

El usuario **Demo** opera completamente sobre localStorage. Ningún dato demo toca Supabase.

---

## Navegación

El sidebar izquierdo está dividido en secciones:

### Sección superior
- **Dashboard** — resumen del día, ventas y estado del turno actual

### Ventas
- **Caja / POS** — registrar ventas en tiempo real
- **Pedidos** — ver y gestionar todos los pedidos
- **Clientes** — CRUD de clientes y cuenta corriente

### Productos
- **Productos** — catálogo de productos, kits y stock
- **Recetas** — recetas vinculadas a productos con ingredientes y costos
- **Ingredientes** — inventario de materias primas
- **Producción** — registrar producción: sube stock de producto y descuenta ingredientes

### Finanzas
- **Cierre de Caja** — turnos: abrir, monitorear y cerrar caja
- **Gastos** — registro de egresos por categoría y proveedor
- **Proveedores** — CRUD de proveedores y cuenta corriente

### Inferior
- **Reportes** — análisis de ventas, rentabilidad y tendencias *(solo admin)*
- **Configuración** — categorías, horario de recordatorios, usuarios

---

## Módulos en detalle

### Dashboard
- Filtra ventas por rango de fechas (por defecto: hoy)
- Muestra totales: ventas, cantidad de pedidos, efectivo, transferencias y cuenta corriente
- Acceso rápido a abrir el POS o ver pedidos pendientes
- Tabla de ventas del día con totales por método de pago

### Caja / POS
1. Seleccioná la lista de precios (minorista / mayorista) en la parte superior
2. (Opcional) Seleccioná un cliente con el botón de persona
3. Hacé clic en los productos para agregarlos al carrito
4. Desde el carrito: modificá cantidades, aplicá descuento (% o monto fijo), editá precios
5. Clic en **Cobrar** → elegí estado del pedido y método de pago → **Confirmar**
6. Si el pedido queda abierto, podés registrar una fecha de entrega

### Pedidos
- Filtros por estado (Abierto, Listo, Entregado, Cerrado, Cancelado) y método de pago
- Clic en un pedido para ver detalle y cambiar estado o método de pago
- Cancelar un pedido devuelve el stock automáticamente
- Cerrar un pedido con método **Cuenta corriente** registra cargo en la cuenta del cliente

### Clientes
- CRUD completo (nombre, teléfono, dirección, descuento %, lista de precios)
- Vista de cuenta corriente: historial de cargos y pagos
- Botón **Registrar pago** para registrar abonos a la cuenta

### Productos
- CRUD con nombre, categoría, precios (minorista/mayorista), unidad, stock y descripción
- Soporte para **kits**: un producto compuesto por otros productos
- Filtros por categoría y búsqueda por nombre

### Recetas
- Cada receta se vincula a un producto
- Ingredientes se seleccionan desde el catálogo (`Ingredientes`); el costo se calcula automáticamente (`qty × costo unitario`)
- Muestra: tiempo de preparación, rendimiento, costo total, costo por unidad y margen
- Exportar receta como PDF imprimible

### Ingredientes
- Stock, stock mínimo y costo unitario por ingrediente
- Alerta visual cuando el stock está por debajo del mínimo
- Edición rápida de stock y precio directamente en la tabla (sin abrir modal)
- Valor total del inventario calculado automáticamente

### Producción
- Lista todos los productos activos
- Ingresá la cantidad a producir y presioná **Aplicar**:
  - Sube el stock del producto
  - Descuenta ingredientes según la receta (si existe)
  - Registra movimiento en `stock_movements`
- Si el producto no tiene receta, el stock sube igual pero se avisa

### Cierre de Caja
- **Sin turno abierto**: botón para abrir turno (registra responsable y efectivo inicial)
- **Con turno abierto**: dashboard en tiempo real con ventas y egresos del turno
  - Ventas por método: efectivo, transferencia, tarjeta, cuenta corriente
  - Cobros de cuenta corriente recibidos durante el turno
  - Egresos en efectivo registrados durante el turno
  - **Efectivo esperado** = inicial + efectivo en ventas + cobros CC en efectivo − egresos
- Cerrar turno: ingresá el efectivo contado → el sistema calcula la diferencia (faltante/sobrante)
- Historial de turnos cerrados

### Gastos
- Registrá egresos con concepto, proveedor, cantidad, precio, categoría y estado de pago
- **Gastos pendientes**: se pueden cerrar después seleccionando el método de pago
- Para la categoría **Ingredientes**: se usa una tabla de líneas donde se elige ingrediente del catálogo → actualiza automáticamente el costo unitario en DB
- Filtros por categoría y rango de fechas
- Exportar a CSV

### Proveedores
- CRUD de proveedores (nombre, teléfono, email, dirección)
- Vista de cuenta corriente por proveedor: cargos (gastos) y pagos
- Saldo total de deuda en la cabecera
- Registrar pagos manuales al proveedor

### Reportes *(solo admin)*
- **Resumen del período**: total ventas, total gastos, ganancia neta, margen %
- **Top productos más vendidos**: ranking por unidades vendidas con barra de progreso
- **Ventas por método de pago**: distribución en porcentajes
- **Top 5 más rentables**: margen de ganancia por producto (precio − costo de receta)
- **Tendencias**: gráfico de barras diario/semanal/mensual de ventas vs gastos con indicador de tendencia
- Exportar "Productos más vendidos" a CSV (incluye producción y cancelaciones)

### Configuración
- Agregar/eliminar categorías de productos y categorías de gastos
- Configurar horario del recordatorio de entregas (aparece al login)
- Ver usuarios del sistema
- *Solo en modo Demo*: botón para restaurar datos demo al estado inicial

---

## Alertas de entrega

Al iniciar sesión, si hay pedidos con `delivery_date = hoy` y estado abierto/pendiente, aparece un pop-up de aviso. El horario en que aparece esta alerta se configura en **Configuración → Sistema**.

---

## Modo Demo

- Ingresá con usuario **Demo** / contraseña `demo1234`
- Todos los datos son ficticios y se guardan en localStorage del navegador
- El banner naranja en la parte superior indica que estás en modo demo
- El botón **Restaurar datos de demo** restablece todos los datos al estado original
- Al cerrar sesión se limpia el flag de demo; los usuarios reales nunca ven datos demo

---

## Tecnología

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Base de datos | Supabase (PostgreSQL) |
| Estilos | CSS-in-JS (sin librería externa) |
| Autenticación | Passwords en código (sin JWT) |
| Demo | localStorage mock con interfaz idéntica a Supabase |

---

## Estructura del proyecto

```
src/
├── App.jsx              # Raíz: estado global, carga de datos, navegación
├── shared.jsx           # Utilidades, constantes, CSS global, componentes UI base
├── supabase.js          # Cliente Supabase + mappers DB↔App (snake_case↔camelCase)
├── demoData.js          # Datos de seed para el modo demo
├── demoSupabase.js      # Mock de Supabase sobre localStorage
└── pages/
    ├── DashboardPage.jsx
    ├── POSPage.jsx
    ├── OrdersPage.jsx
    ├── CustomersPage.jsx
    ├── ProductsPage.jsx
    ├── RecipesPage.jsx
    ├── IngredientsPage.jsx
    ├── ProductionPage.jsx
    ├── CashShiftPage.jsx
    ├── ExpensesPage.jsx
    ├── SuppliersPage.jsx
    ├── ReportsPage.jsx
    └── SettingsPage.jsx
```
