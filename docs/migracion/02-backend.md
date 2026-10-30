# 02 — Backend: `nutrifree-api` (fases B0–B10)

Cada fase se ejecuta como una o más tareas de Codex (una tarea = un PR). Las
rutas de "Entradas" son del legado `../nutrifree-pos`. Antes de cada fase Codex
lee [01-arquitectura.md](01-arquitectura.md) y el `AGENTS.md` del repo.

Regla para todas las fases de negocio (B3–B9): **primero los tests de
caracterización** (los casos de los `*.test.js` del legado, traducidos a pytest),
después la implementación. Si el comportamiento del legado parece un bug, no se
"arregla" en silencio: se replica, se marca con `# LEGACY:` y se anota en el PR.

---

## B0 — Base del repo y tooling · M

**Objetivo:** repo listo para trabajar, con Docker, calidad y CI.

**Tareas**
- `pyproject.toml` con `uv`, Python 3.13. Dependencias: `fastapi`, `uvicorn[standard]`,
  `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `pyjwt[crypto]`,
  `httpx`, `python-multipart`. Dev: `pytest`, `pytest-asyncio`, `pytest-cov`,
  `respx`, `ruff`, `mypy`, `pre-commit`, `pip-audit`.
- `app/main.py` con `GET /health` (vive) y `GET /ready` (hace `SELECT 1`).
- `app/core/config.py` (`Settings` con pydantic-settings) incluyendo la guarda
  `ENV=local` ⇒ prohibido `*.supabase.co` / `*.supabase.com` en `DATABASE_URL`.
- `app/core/errors.py`: handler Problem Details (RFC 9457) para errores de
  dominio, validación (422) y no controlados (500 sin filtrar detalles).
- `Dockerfile` multi-stage con `uv`, usuario no root, `HEALTHCHECK`.
- `docker-compose.yml` con `db` (`supabase/postgres:17.6.1.063`), `auth`
  (`supabase/gotrue:v2.189.0`) y `api` (recarga en caliente). Tomar como
  referencia el `docker-compose.yml` oficial de Supabase self-hosting
  (servicios `db` y `auth`), con `GOTRUE_MAILER_AUTOCONFIRM=true` y
  `GOTRUE_DISABLE_SIGNUP=true`.
- `Makefile`: `up`, `down`, `dev`, `reset-db`, `migrate`, `seed`, `test`, `lint`,
  `format`, `typecheck`, `check` (= lint + typecheck + test), `openapi`.
- `.github/`: workflow de CI (lint, tipos, tests con Postgres de servicio, build
  de imagen), `dependabot.yml`, `CODEOWNERS` (`@Facundo-Arroquy @FacundoArroquy`),
  plantilla de PR.
- `AGENTS.md` (copiar [plantillas/AGENTS.api.md](plantillas/AGENTS.api.md)),
  `README.md`, `.env.example`, `docs/adr/0001-arquitectura.md` (resumen de las
  decisiones D-01…D-13).

**Aceptación**
- `make up && curl -f localhost:8000/health` → 200.
- `make check` en verde y CI en verde en el PR.
- Con `ENV=local` y `DATABASE_URL` de Supabase la API no arranca (test).

---

## B1 — Base local, Alembic baseline y seed · L

**Objetivo:** la base local es idéntica en esquema a producción y Alembic queda
como dueño del esquema.

**Entradas:** `supabase/migrations/*.sql`, `supabase/seed.sql`,
`supabase/checks/*.check.sql`, `TABLAS.md`, `FUNCIONES.md` y el dump de esquema
de producción que entrega P0 (`schema_prod.sql`, sin datos).

**Tareas**
- Confirmar el orden de arranque: `db` → `auth` (GoTrue crea el esquema `auth`
  con sus migraciones) → `migrate` → `api`. Usar `depends_on` con
  `condition: service_healthy`.
- `migrations/versions/0001_baseline.py` ejecuta `migrations/sql/0001_baseline.sql`
  = esquema `public` de producción (de `schema_prod.sql`; si todavía no está, la
  concatenación ordenada de `supabase/migrations/`) + el trigger
  `on_auth_user_created`. El `downgrade` de la baseline no está soportado (se
  documenta).
- Modelos SQLAlchemy 2 (`Mapped[...]`) para todas las tablas de `public`.
  `include_object` en `env.py` ignora `backup_*` y los esquemas de Supabase
  (`auth`, `storage`, `extensions`, …).
- `alembic check` en CI: los modelos tienen que coincidir con la base.
- `db/seed/seed.sql` con datos **100 % ficticios** (portar `supabase/seed.sql`):
  un usuario por rol (`admin`, `vendor`, `cocina`) más uno inactivo, productos
  con y sin kit, clientes con saldo, proveedores, gastos y un pedido en cada
  estado.
- `scripts/schema_diff.sh`: compara `pg_dump --schema-only` local con
  `schema_prod.sql` y falla si hay diferencias en `public`.
- `docs/TABLAS.md` (desde el `TABLAS.md` del legado, sumando las tablas que
  faltan: `business_users`, `employee_hours`, `production_employees`,
  `productions`, `internal_notes`, `vianda_plans`, `vianda_plan_items`,
  `weekly_goals`) y `docs/FUNCIONES.md` (sección de funciones SQL).

**Tests**
- `alembic upgrade head` sobre base vacía.
- Existen todas las funciones SQL del inventario con su firma.
- Las consultas de `supabase/checks/*.check.sql` corren y devuelven lo esperado.

**Aceptación:** `make reset-db` deja la base migrada y con seed; `alembic check`
sin diferencias; `scripts/schema_diff.sh` sin diferencias.

---

## B2 — Auth, usuarios y roles · M

**Entradas:** `src/App.jsx` (`sessionToUser`, `syncBusinessUser`, logout),
`src/routes/paths.js` (`ROUTES`, `SETTINGS_SECTIONS`), sección Empleados de
`src/pages/SettingsPage.jsx`, tabla `business_users`, función `handle_new_auth_user`.

**Tareas**
- `integrations/auth_provider/`: interfaz `AuthProvider` + `GoTrueAuthProvider`
  (login con password, refresh, logout, alta de usuario con la API admin).
- Endpoints:
  - `POST /api/v1/auth/login` `{email, password}` → `{accessToken, expiresIn, user}`;
    el refresh token va en cookie `nf_refresh` (`HttpOnly`, `Secure`,
    `SameSite=Lax`, `Path=/api/v1/auth`).
  - `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Verificación del JWT: HS256 con secreto **o** JWKS (cache 10 min), según
  configuración. Valida firma, `exp`, `aud=authenticated` e `iss`.
- Dependencia `current_user`: busca el email en `business_users`. Inactivo →
  403 `user_inactive`; inexistente → 403 `user_not_registered`. **No** crea
  usuarios ni deriva el rol del email.
- `require_roles(*roles)` y una matriz de permisos por módulo que replica
  `ROUTES` y `SETTINGS_SECTIONS`.
- Empleados (solo `admin`): `GET/POST/PATCH /api/v1/users` — alta en GoTrue +
  fila en `business_users`, cambio de rol, activar/desactivar.
- Comando `python -m app.cli create-user --email --role` para el primer admin.
- Auditoría de login correcto y fallido en `audit_log`.

**Tests**
- Token válido, vencido, con otra audiencia, con firma inválida.
- Matriz de roles parametrizada: cada endpoint × cada rol → 2xx o 403 según `ROUTES`.
- Integración contra GoTrue local: login de cada usuario del seed; usuario inactivo → 403.

---

## B3 — Catálogo, ingredientes y recetas · L

**Entradas:** `ProductsPage.jsx`, `IngredientsPage.jsx`, `RecipesPage.jsx`,
`PriceUpdatePanel.jsx`, `CostTierBadge.jsx`; `utils/stock.js` (`availableStock`,
`isKitProduct`), `utils/costTier.js`, `utils/recipeIngredients.js`,
`utils/productImages.js`; mappers de `src/supabase.js`; RPC
`adjust_product_stock`, `adjust_ingredient_stock`.

**Endpoints**
- `/api/v1/categories` — CRUD.
- `/api/v1/products` — CRUD con filtros (`active`, `showInMenu`, `favorite`,
  `category`, `q`). Cada producto devuelve `availableStock` calculado (kits:
  mínimo de `stock_componente / qty`).
- `PATCH /api/v1/products/{id}/favorite`.
- `POST /api/v1/products/{id}/stock-adjustments` → `adjust_product_stock` +
  `stock_movements` en la misma transacción.
- `PATCH /api/v1/products/prices` — actualización masiva (PriceUpdatePanel),
  todo o nada.
- `/api/v1/ingredients` — CRUD + `POST /{id}/stock-adjustments`
  (`adjust_ingredient_stock`, con costo unitario opcional).
- `/api/v1/recipes` — CRUD con líneas de ingredientes y pasos; devuelve costo
  total, costo por unidad y `costTier` calculado (portar `costTier.js`).

**Tests:** portar `costTier.test.js`, `supabase.costTier.test.js`,
`recipeIngredients.test.js` y los casos de kits de `stock.test.js`.

---

## B4 — Clientes y cuenta corriente · L

**Entradas:** `CustomersPage.jsx` (`custBal`, `computeAllocations`,
`registerPayment`), tabla `account_payments`, trigger `sync_customer_balance`,
`customer_inactive_dismissed`, `docs/AUDITORIA.md`, sección "Cuentas Corrientes"
de `docs/notas-proyecto.md`.

**Endpoints**
- `/api/v1/customers` — CRUD (lista de precios, descuento, facturación por defecto).
- `GET /api/v1/customers/{id}/account` → movimientos, saldo e imputaciones.
- `POST /api/v1/customers/{id}/payments` → pago; si se aplica crédito a un
  pedido crea los dos movimientos que crea hoy (pago con `saleId` + cargo
  "Crédito consumido" sin `saleId`). Acepta `Idempotency-Key`.
- `GET /api/v1/customers/inactive` y `POST /api/v1/customers/{id}/inactive-dismissals`.

**Reglas:** el saldo se calcula desde `account_payments` (`custBal`), **no** desde
`customers.balance` (está desincronizado). Positivo = crédito, negativo = deuda.

**Tests:** casos de `computeAllocations` y `custBal` extraídos del legado; las
consultas 1–3 de `docs/AUDITORIA.md` como tests de integración que devuelven 0
filas después de cada operación.

---

## B5 — Ventas, pedidos, stock y facturación · XL

**Entradas:** `POSPage.jsx`, `OrdersPage.jsx`, `OrdersKanbanPage.jsx`,
`BillingPage.jsx`; `utils/stock.js`, `utils/orderPricing.js`,
`utils/duplicateSale.js`, `utils/money.js`; sección "Estados de `sales` y stock"
de `TABLAS.md`; RPC `complete_sale_stocks`, `cancel_order_stocks`.

**Endpoints**
- `POST /api/v1/sales` — venta de mostrador (nace `closed`, descuenta stock) o
  pedido (nace `open`). Si el método es cuenta corriente crea el cargo en
  `account_payments`. Devuelve `stockWarning` (faltantes / inexistentes).
  `Idempotency-Key` obligatorio.
- `GET /api/v1/sales` — filtros `status`, `from`, `to`, `deliveryDate`,
  `customerId`, `needsBilling`; paginado.
- `PATCH /api/v1/sales/{id}/status` — cambio de estado y movimiento de stock
  (`syncStockForStatusChange`) **en una sola transacción**, con
  `SELECT … FOR UPDATE` sobre la venta. Hoy son dos llamadas separadas desde el
  navegador.
- `PATCH /api/v1/sales/{id}/items` — edición de ítems y descuento mientras esté
  `open`/`preparing`/`ready`; `closed` → 409 `sale_closed` (ver `orderPricing.js`).
- `POST /api/v1/sales/{id}/close` (cobrar) y `POST /api/v1/sales/{id}/cancel`
  (devuelve stock si estaba descontado).
- `GET /api/v1/sales/possible-duplicates` (lógica de `duplicateSale.js`).
- Facturación: `PATCH /api/v1/sales/{id}/billing` y
  `POST /api/v1/sales/{id}/invoice` (multipart → `StorageBackend`).

**Tests**
- Portar `stock.test.js`, `orderPricing.test.js`, `duplicateSale.test.js`, `money.test.js`.
- Matriz de transiciones: para cada par de estados, el invariante "stock
  descontado ⇔ estado en `ready`/`delivered`/`closed`" se cumple.
- Concurrencia: dos cambios de estado simultáneos sobre la misma venta no
  descuentan dos veces.

---

## B6 — Sitio público, cupones y MercadoPago · L

**Entradas:** `MenuPage.jsx`, `WholesaleMenuPage.jsx`, `PagoResultadoPage.jsx`,
`CouponField.jsx`, `CouponsSettings.jsx`; `utils/coupons.js`,
`utils/createWebOrder.js`, `utils/webOrder.js`; RPC `create_web_order` y
`validate_coupon`; `supabase/functions/*`; sección "Acceso anónimo" de
`TABLAS.md`; `docs/reportes/BACKEND_PASARELA_PAGO.md` y `BUGS_PASARELA_PAGO.md`.

**Endpoints públicos** (con rate limit por IP)
- `GET /api/v1/public/menu?priceList=retail|wholesale` → categorías y productos
  publicados con `availableStock`. El acceso mayorista replica el mecanismo
  actual de `WholesaleMenuPage`.
- `POST /api/v1/public/coupons/validate` → `validate_coupon`.
- `POST /api/v1/public/orders` → `create_web_order` (precios, descuento y total
  en el servidor). Devuelve `saleId` y `total`.
- `POST /api/v1/public/orders/{id}/payment-preference` → preferencia de MP
  armada con los ítems y el total **guardados en `sales`**; `back_urls` con
  `PUBLIC_BASE_URL`; `notification_url` apuntando a la API.
- `POST /api/v1/public/payments/mercadopago/webhook`:
  - Verifica el header `x-signature` (HMAC-SHA256 con `MP_WEBHOOK_SECRET`) → 401 si falla.
  - Consulta el pago a MP y compara `transaction_amount` y moneda con la venta.
  - Idempotencia con la tabla nueva `payment_events` (migración expand:
    `mp_payment_id` único, `sale_id`, `status`, `amount`, `payload jsonb`, `received_at`).
  - `approved` y monto correcto → `status=open`, `paid_at`, `payment_method=mercadopago`
    y la nota que agrega hoy. `rejected`/`cancelled` → `cancelled` si no estaba pagada.
    Monto distinto → no marca pagado, registra en `audit_log` y alerta.
- `GET /api/v1/public/orders/{id}/status` → solo estado y total (para la página
  de resultado de pago).

**Admin:** `/api/v1/coupons` — CRUD (solo `admin`).

**Tests:** portar `coupons.test.js`, `createWebOrder.test.js`, `webOrder.test.js`;
webhook con payloads de ejemplo (aprobado, duplicado, monto distinto, firma
inválida) y MP simulado con `respx`.

---

## B7 — Proveedores, gastos y caja · L

**Entradas:** `SuppliersPage.jsx`, `SupplierPayModal.jsx`, `ExpensesPage.jsx`,
`CashShiftPage.jsx`; `utils/supplierAccount.js`, `utils/money.js`; tablas
`suppliers`, `supplier_payments`, `expenses`, `expense_categories`,
`expense_subcategories`, `cash_shifts`; sección de `supplierAccount.js` en
`FUNCIONES.md`.

**Endpoints**
- `/api/v1/suppliers` — CRUD + `GET /{id}/account` (libro, saldo y saldo a favor).
- `POST /api/v1/suppliers/{id}/payments` — pago imputado a gastos (admite
  parciales), a cuenta, o con método `balance` (saldo a favor).
- `/api/v1/expenses` — CRUD. Con proveedor genera el `charge` (índice único
  `uniq_sp_expense_charge`) y `payment_status` se deriva de `supplier_payments`.
  Las líneas de ingredientes ajustan stock y costo (`adjust_ingredient_stock`).
- `/api/v1/expense-categories`, `/api/v1/expense-subcategories` (alta solo `admin`).
- `/api/v1/cash-shifts` — `GET current`, `POST open`, `POST {id}/close` (ventas
  por método, gastos en efectivo, esperado, contado y diferencia).

**Tests:** portar `supplierAccount.test.js`; gasto con proveedor + pago parcial
→ `partial`; cierre de caja con ventas de cada método de pago.

---

## B8 — Producción y menú semanal · L

**Entradas:** `ProductionPage.jsx`, `ProductionLogPage.jsx`,
`ProductionKanbanSection.jsx` (+ test), `HoursBankPage.jsx`,
`WeeklyMenuPage.jsx`, `WeeklyIngredientsPanel.jsx`, `WeeklyCostRulePanel.jsx`;
`utils/weeklyMenu.js`, `weeklyMenuRules.js`, `weeklyProduction.js`, `dates.js`;
RPC `apply_production`, `accumulate_employee_hours`, `adjust_product_stock`.

**Endpoints**
- `POST /api/v1/productions` — `apply_production` + empleados + horas
  (`accumulate_employee_hours`) en una transacción. `GET` con filtros.
- `GET /api/v1/employee-hours` (banco de horas, solo `admin`).
- `/api/v1/production-kanban` — `GET`; `POST /generate` (desde pedidos activos:
  `qtyRequested`, `qtyStock`, `qtyToProduce`); `PATCH /{id}/status` (`ready` suma
  stock, volver atrás lo revierte, `stockUpdated`); `DELETE` (vaciar, solo `admin`,
  sin revertir).
- `/api/v1/weekly-goals`, `/api/v1/vianda-plans`.
- `/api/v1/weekly-menus/{weekStart}` — `GET`/`PUT` (`weekStart` siempre lunes);
  `GET …/ingredients` (`weeklyProduction.js`); `GET …/cost-rule`
  (`weeklyMenuRules.js`); `POST …/image` (sube la imagen que genera el front).

**Tests:** portar `weeklyMenu.test.js`, `weeklyMenuRules.test.js`,
`weeklyProduction.test.js`, `dates.test.js` y la lógica de
`ProductionKanbanSection.test.js`; `ready` → atrás deja el stock igual que al principio.

---

## B9 — Reportes, configuración, importación y ayuda · L

**Entradas:** `DashboardPage.jsx`, `ReportsPage.jsx`, `WeeklyReportPage.jsx`,
`SettingsPage.jsx`, `ImportPage.jsx`, `HelpAdminPage.jsx`, `ChatWidget.jsx`;
`utils/priceImport.js`, `auditCheck.js`, `emailAlerts.js`,
`emailRecipients.js`; RPC `weekly_report`; `docs/AUDITORIA.md`.

**Endpoints**
- `GET /api/v1/dashboard` — KPIs que hoy se calculan en el navegador, ahora en SQL.
- `GET /api/v1/reports/{tipo}?from=&to=` — un tipo por sección de `ReportsPage`.
- `GET /api/v1/reports/weekly?weekStart=` → `weekly_report`.
- `GET /api/v1/audit/integrity` — consultas de `docs/AUDITORIA.md` (solo `admin`).
- `GET/PATCH /api/v1/settings` (`app_settings`).
- `/api/v1/faq`, `POST /api/v1/faq/missed`, `/api/v1/internal-notes`.
- `GET /api/v1/audit-log` — paginado, solo `admin`.
- `POST /api/v1/imports/prices` (Excel → `openpyxl` → vista previa de cambios) y
  `POST /api/v1/imports/prices/{id}/confirm`. Igual para el resto de las
  importaciones de `ImportPage`.
- `GET /api/v1/backup` — exportación completa en streaming (solo `admin`).

**Tests:** portar `priceImport.test.js`; `weekly_report` y cada reporte contra el
seed con números esperados fijos.

---

## B10 — Endurecimiento y preparación de producción · M

**Tareas**
- Rate limit en login y rutas públicas; headers de seguridad; CORS solo con los
  orígenes configurados.
- Logs JSON con `request_id`; integración opcional con Sentry.
- `openapi.json` exportado y versionado; CI falla si quedó desactualizado.
- Índices para las consultas frecuentes (ventas por `delivery_date`/`status`,
  `account_payments` por `customer_id`…) como migraciones expand, medidos con `EXPLAIN`.
- `db/roles/nutrifree_api.sql`: rol de mínimo privilegio para producción
  (`LOGIN`, `BYPASSRLS`, permisos solo sobre `public` y `EXECUTE` en las
  funciones usadas). Se aplica en P2.
- Imagen de producción (uvicorn con workers, sin recarga), `pip-audit` en CI.
- `docs/RUNBOOK.md`: deploy, rollback, rotación de secretos, restaurar backup.

**Aceptación:** `make check` verde, `pip-audit` sin vulnerabilidades altas, la
imagen arranca con variables de producción simuladas y `/ready` responde 200.
