# 03 — Frontend: `nutrifree-web` (fases F0–F10)

El front se **reescribe** en TypeScript + Tailwind, módulo por módulo, contra la
API nueva. No se copian las páginas tal cual: se toma el comportamiento del
legado y se rearma con componentes chicos (menos de ~300 líneas por archivo).

Reglas para todas las fases:
- Ningún cálculo de plata, stock o saldo es autoritativo en el front: se muestra
  lo que devuelve la API.
- Todo dato del servidor pasa por TanStack Query; nada de estado global por props.
- Los formularios usan React Hook Form + Zod; los mensajes de error, en español,
  salen del `code` de la API.
- Cada fase cierra con un **checklist de paridad** contra la página del legado
  (mismas acciones, mismos datos, mismos permisos).

---

## F0 — Base del repo y tooling · M

**Tareas**
- Vite + React + TypeScript (`strict: true`), versiones estables fijadas en el lockfile.
- Tailwind CSS v4 con `@tailwindcss/vite`; React Router; TanStack Query; React
  Hook Form + Zod; `openapi-typescript` + `openapi-fetch`.
- ESLint (flat config, reglas de hooks y a11y) + Prettier; Vitest + Testing
  Library + `jsdom` + MSW; Playwright.
- Proxy de Vite: `/api` → `http://localhost:8000`.
- Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:watch`,
  `e2e`, `gen:api` (genera `src/lib/api/schema.d.ts` desde
  `../nutrifree-api/openapi.json`), `check` (= lint + typecheck + test).
- `vercel.json`: rewrite SPA y `/api/(.*)` → URL de la API (se completa en P3).
- `.github/`: CI (lint, tipos, tests, build), `dependabot.yml`, `CODEOWNERS`
  (`@Facundo-Arroquy @FacundoArroquy`), plantilla de PR.
- `AGENTS.md` (copiar [plantillas/AGENTS.web.md](plantillas/AGENTS.web.md)),
  `README.md`, `.env.example`, `docs/frontend_design.md` (copiar
  [anexos/frontend_design.md](anexos/frontend_design.md)).

**Aceptación:** `npm run check` y `npm run build` en verde; CI verde.

---

## F1 — Sistema de diseño · L

**Entradas:** [anexos/frontend_design.md](anexos/frontend_design.md);
`src/shared.jsx` (CSS global, `:root`, `Ico`, `Modal`), `src/landing.css`,
`src/menu.css` del legado.

**Contexto de uso** (manda sobre cualquier decisión estética):
- **Panel y POS:** velocidad y legibilidad. Mucha tabla y mucho número
  (`tabular-nums`), operación con teclado.
- **Tablet de cocina (rol `cocina`):** se usa con los dedos, a distancia →
  objetivos táctiles de 44 px o más, texto grande, alto contraste.
- **Sitio público:** marca, apetito y celular primero. Acá la guía de diseño se
  aplica con más libertad.

**Tareas**
- Tokens en `src/styles/tailwind.css` con `@theme`, partiendo de los actuales:
  - Panel: `--bg #f5f5f7`, superficies `#ffffff/#fafafa/#f2f2f5`, verde de marca
    `#89b8ad`/`#72a99d`/`#edf4f2`, ámbar `#d97706`, rojo `#dc2626`, azul `#2563eb`,
    textos `#111113/#2c2c2e/#4a4a4e/#727277`, radios `10px/14px`.
  - Público: `forest #183b33`, `sage #83b7a8`, `cream #f7f4e9`, `lime #dce97e`,
    `soft #dcece5`.
- Dirección visual: **dos propuestas** (par tipográfico display + texto,
  tratamiento de color, densidad) en una ruta interna `/_design`. Se elige una
  (decisión DP-2) antes de F3. La guía pide evitar fuentes genéricas
  (Inter, Roboto, Arial, system-ui) y el look "plantilla".
- Componentes en `src/components/ui/` sobre primitivas accesibles (Radix UI o
  React Aria) con Tailwind: `Button` (incluye tamaño táctil), `IconButton`,
  `Input`, `MoneyInput` (formato es-AR), `NumberInput`, `Select`/`Combobox`,
  `Checkbox`, `Switch`, `Textarea`, `DatePicker` (día de negocio en hora de
  Argentina), `Dialog`, `ConfirmDialog`, `Drawer`, `Table` (orden, vacío,
  cargando), `Pagination`, `Badge` (un color por estado de pedido), `Tabs`,
  `Toast`, `Tooltip`, `Card`, `Skeleton`, `EmptyState`.
- Íconos: `lucide-react` o los SVG de `Ico` portados a componentes.
- Accesibilidad: foco visible, contraste AA, navegación por teclado,
  `prefers-reduced-motion`.

**Tests:** cada componente (render, interacción, sin violaciones de `axe`).

---

## F2 — Shell de la app y autenticación · M

**Entradas:** `src/App.jsx`, `src/routes/paths.js` (+ `paths.test.js`),
`src/routes/AppRoutes.jsx`, `src/routes/AccessDenied.jsx`.

**Tareas**
- `src/app/routes.ts`: catálogo de rutas con id, path, roles y sección del
  sidebar (port de `paths.js`, incluidas las subsecciones de Configuración).
- Separación por subdominio como hoy: `app.nutrifree.lat` → panel,
  `nutrifree.lat`/`www` → público, `localhost` → ambos.
- `AuthProvider` (Context): login, access token en memoria, refresh silencioso
  ante 401 vía `/auth/refresh` (cookie), logout. Guards `RequireAuth` y
  `RequireRole`; `AccessDenied`; página inicial por rol (`cocina` → calendario).
- Cliente API (`openapi-fetch`) con middleware de token, reintento tras refresh
  y conversión de Problem Details a `ApiError` con `code`.
- Defaults de TanStack Query (staleTime, reintentos, refetch al volver a la pestaña).
- Layout: sidebar con secciones, header, navegación para tablet y celular, modo
  `cocina` con objetivos grandes. Error boundary, 404, toasts globales.

**Tests:** portar `paths.test.js`; guards por rol; flujo de refresh con MSW;
login con credenciales inválidas muestra el error.

---

## F3 — Catálogo, ingredientes y recetas · L

**Legado:** `ProductsPage`, `IngredientsPage`, `RecipesPage`, `PriceUpdatePanel`,
`CostTierBadge`, `ProductImage`. **API:** B3.

- Productos: lista con filtros, alta/edición (kits con componentes, stock
  calculado y deshabilitado en kits), favoritos, foto, ajuste de stock.
- Ingredientes: lista con stock mínimo y alertas, información nutricional, ajuste de stock.
- Recetas: editor de ingredientes (cantidades decimales) y pasos, costo y nivel de costo.
- Actualización masiva de precios.

---

## F4 — Clientes y cuenta corriente · L

**Legado:** `CustomersPage`. **API:** B4.

- Lista y ficha de cliente; cuenta corriente con movimientos, saldo e
  imputaciones; registrar pago y aplicar crédito; clientes inactivos y descarte de alerta.

---

## F5 — Ventas, pedidos, POS y facturación · XL

**Legado:** `POSPage`, `OrdersPage`, `OrdersKanbanPage`, `BillingPage`,
`CouponField`. **API:** B5.

- **POS:** búsqueda rápida, carrito, lista de precios, descuentos, método de
  pago, cliente con facturación por defecto, aviso de faltante de stock. Usable
  solo con teclado. `Idempotency-Key` por venta para evitar cargas dobles.
- **Calendario de pedidos:** columnas por estado, cambio de estado, edición de
  ítems mientras el pedido esté vivo, refresco cada 10 s (D-09), vista tablet para cocina.
- **Pedidos:** listado con filtros, aviso de posibles duplicados.
- **Facturación:** pendientes, marcar facturado, subir comprobante.

---

## F6 — Sitio público · L

**Legado:** `LandingPage`, `MenuPage`, `WholesaleMenuPage`, `PagoResultadoPage`,
`landing.css`, `menu.css`. **API:** B6.

- Landing, menú minorista, menú mayorista, carrito, cupón, checkout con
  MercadoPago y páginas de resultado de pago.
- Celular primero; LCP < 2.5 s en 4G; imágenes lazy con tamaños fijos; meta
  tags y Open Graph.
- Es la parte más expresiva: aplicar [anexos/frontend_design.md](anexos/frontend_design.md)
  con la paleta pública.

---

## F7 — Proveedores, gastos y caja · L

**Legado:** `SuppliersPage`, `SupplierPayModal`, `ExpensesPage`,
`CashShiftPage`. **API:** B7.

- Proveedores con cuenta corriente y pagos (parciales, a cuenta, saldo a favor).
- Gastos con categorías, subcategorías y líneas de ingredientes.
- Apertura y cierre de caja con conteo de efectivo y diferencia.

---

## F8 — Producción y menú semanal · L

**Legado:** `ProductionPage`, `ProductionLogPage`, `ProductionKanbanSection`,
`HoursBankPage`, `WeeklyMenuPage`, `WeeklyIngredientsPanel`,
`WeeklyCostRulePanel`, `utils/weeklyMenuImage.js`. **API:** B8.

- Registro de producción con empleados y horas; banco de horas.
- Kanban de producción (generar, mover, vaciar) con refresco cada 10 s.
- Menú semanal (almuerzo, cena y keto, lunes a viernes), ingredientes de la
  semana, regla de costos y la imagen para Instagram (se sigue generando en el
  navegador con canvas, portada a TS, y se sube por la API).

**Tests:** portar `WeeklyCostRulePanel.test.jsx`, `WeeklyIngredientsPanel.test.jsx`,
`weeklyMenuImage.test.js` y `emailAlerts.weeklyMenu.test.js`.

---

## F9 — Dashboard, reportes, configuración, importación y ayuda · L

**Legado:** `DashboardPage`, `ReportsPage`, `WeeklyReportPage`,
`SettingsPage`, `ImportPage`, `HelpAdminPage`, `ChatWidget`,
`CouponsSettings`, `utils/emailAlerts.js`, `utils/emailRecipients.js`,
`utils/auditCheck.js`. **API:** B9.

- Dashboard y reportes con gráficos (los números vienen hechos de la API).
- Configuración con sus subsecciones y permisos por rol (general, sistema,
  listas de precios, cupones, empleados, notas internas, backup, mi cuenta).
- Importación: se sube el Excel, la API devuelve la vista previa, se confirma.
- FAQ y asistente de ayuda.
- Alertas por email: se mantiene EmailJS hasta resolver DP-4.

**Tests:** portar `emailRecipients.test.js`.

---

## F10 — QA final · M

- E2E con Playwright contra el stack de Docker, uno por flujo crítico:
  1. Login con cada rol y lo que ve cada uno.
  2. Venta de mostrador → stock descontado.
  3. Pedido → listo → entregado → cobrado en cuenta corriente (stock y saldo).
  4. Pedido web con cupón → pago aprobado (MP simulado) → aparece en el calendario.
  5. Gasto con proveedor → pago parcial → estado `partial`.
  6. Apertura y cierre de caja.
  7. Kanban de producción → `ready` suma stock → volver atrás lo revierte.
- `axe` en todas las rutas; viewport de tablet (1024×768) y celular (390×844).
- Code splitting por ruta y presupuesto de bundle en CI.
- Checklist de paridad completo de [anexos/inventario-legacy.md](anexos/inventario-legacy.md#páginas).
