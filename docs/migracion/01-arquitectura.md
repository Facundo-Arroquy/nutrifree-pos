# 01 — Arquitectura objetivo

## Situación actual

- SPA Vite 4 + React 18 en JavaScript, CSS propio (sin Tailwind), deploy en Vercel.
- El navegador habla **directo** con Supabase: 138 consultas `supabase.from()`,
  14 llamadas RPC, 10 canales realtime y 4 subidas a Storage, repartidas en
  `src/App.jsx` (875 líneas, estado global por props) y 24 páginas (~15 000 líneas).
- Reglas de negocio en `src/utils/*.js` (stock, precios, cuenta corriente,
  menú semanal…) con tests en Vitest, y en funciones PL/pgSQL.
- Pagos con dos Edge Functions de Supabase (`create-preference`, `mp-webhook`).
- Postgres 17.6 en Supabase, región `us-east-1`. Detalle completo en
  [anexos/inventario-legacy.md](anexos/inventario-legacy.md).

## Arquitectura objetivo

```
                 ┌──────────────────────────────────────────┐
  Navegador ───► │ nutrifree-web (SPA estática en Vercel)   │
  (panel, POS,   │ app.nutrifree.lat · nutrifree.lat        │
   tablet cocina,└───────────────┬──────────────────────────┘
   público)                      │ /api/*  (rewrite al mismo origen)
                                 ▼
                 ┌──────────────────────────────────────────┐
                 │ nutrifree-api (FastAPI en contenedor)    │
                 │ routers → services → repositories        │
                 └───┬───────────────┬───────────────┬──────┘
                     │               │               │
                     ▼               ▼               ▼
              PostgreSQL 17    Supabase Auth    Storage · MercadoPago
              local: Docker    (GoTrue)         local: disco
              prod: Supabase   local: Docker    prod: Supabase Storage
```

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D-01 | Dos repos privados (`nutrifree-api`, `nutrifree-web`). `nutrifree-pos` queda congelado (solo fixes críticos) hasta el cutover y después se archiva. | Separar despliegue, permisos y ciclo de vida de front y back. |
| D-02 | La API es la **única** que accede a la base. El front no usa `supabase-js`. | Hoy la clave `anon` viaja en el JS y los roles solo se respetan en la UI. Un único punto de acceso permite validar y auditar todo. |
| D-03 | **Supabase Auth sigue** como proveedor de identidad. La API expone `/auth/login`, `/auth/refresh`, `/auth/logout` y `/auth/me`, hace de proxy a GoTrue y valida los JWT. Local: contenedor GoTrue. | Los usuarios y contraseñas actuales siguen funcionando sin migrarlos. El front no depende de Supabase, así que el proveedor se puede cambiar más adelante sin tocarlo. |
| D-04 | El rol sale **solo** de `business_users` (`admin`, `vendor`, `cocina`) y se valida en cada endpoint. Se elimina la asignación por prefijo de email. | Hoy `sessionToUser` asigna `admin` a cualquier email que empiece con `admin`, y si la consulta falla deja entrar igual. |
| D-05 | **Alembic** es dueño del esquema. La revisión `0001_baseline` es el esquema actual de producción; en producción se marca con `alembic stamp` sin ejecutar nada. | Versionar el esquema sin tocar los datos existentes. |
| D-06 | Migraciones **expand/contract**: mientras el sistema viejo siga vivo solo se agregan tablas y columnas nullable; borrar o renombrar va después del cutover (P6). | El front viejo y la API nueva van a escribir la misma base durante la transición y el rollback. |
| D-07 | Las funciones SQL existentes (`complete_sale_stocks`, `cancel_order_stocks`, `apply_production`, `adjust_*`, `create_web_order`, `validate_coupon`, `weekly_report`) se reutilizan desde la API en v1. Se portan a Python solo si hay un motivo y tests de caracterización. | Ya resuelven concurrencia con ajustes relativos y están probadas en producción. |
| D-08 | Precios, descuentos, stock, saldos y totales se calculan **en la API**. El front solo muestra y valida formato. | Una sola fuente de verdad para la plata. |
| D-09 | Realtime v1: TanStack Query con invalidación tras cada mutación y `refetchInterval` en vistas compartidas (calendario de pedidos y kanban de producción). v2 opcional: SSE con `LISTEN/NOTIFY`. | Los 10 canales actuales solo refrescan listas; el polling alcanza y es más simple de operar. |
| D-10 | Archivos detrás de una interfaz `StorageBackend`: `LocalStorage` (volumen Docker) en dev, `SupabaseStorage` (service role, solo en el servidor) en prod. | Mismo código en los dos entornos. |
| D-11 | MercadoPago pasa a la API (reemplaza las Edge Functions). La preferencia se arma con el total guardado en `sales`; el webhook verifica firma, monto y moneda, y es idempotente. | Hoy `create-preference` usa los precios que manda el navegador y `mp-webhook` no compara el monto pagado. |
| D-12 | Contrato único: FastAPI publica OpenAPI → `openapi-typescript` genera los tipos del front. | Front y back no se desincronizan sin que falle la compilación. |
| D-13 | Front en TypeScript estricto, Tailwind v4 con los tokens de la marca, carpetas por feature. | Mantenible y tipado de punta a punta. |

## Convenciones de la API

- Base: `/api/v1`. Rutas públicas (sin sesión) bajo `/api/v1/public/*`.
- JSON en **camelCase** (Pydantic con `alias_generator=to_camel`); la base sigue
  en snake_case. Reemplaza a los mappers `dbTo*` / `*ToDb` de `src/supabase.js`.
- Errores en formato Problem Details (RFC 9457):
  `{ "type", "title", "status", "detail", "code", "errors": [...] }`. `code` es
  estable y el front lo usa para mostrar mensajes en español.
- Listados paginados: `?limit=&offset=` → `{ "items": [...], "total": n }`.
  Reemplaza a `fetchAllPages` (límite de 1000 filas de PostgREST).
- Montos: `Decimal` en Python (`NUMERIC` en la base), redondeo `ROUND_HALF_UP` a
  2 decimales; en JSON viajan como número.
- Fechas y horas: ISO 8601 con zona. Días de negocio (`deliveryDate`,
  `weekStart`) como `YYYY-MM-DD` en `America/Argentina/Buenos_Aires` (ver
  `src/utils/dates.js` del legado).
- IDs: se respetan los de la base (`products.id` es `text`, el resto `uuid`).
- `POST` de ventas, pagos y pedidos web aceptan el header `Idempotency-Key`
  para evitar cargas dobles (hoy lo intenta `duplicateSale.js` en el cliente).
- Cada acción relevante deja registro en `audit_log`, igual que hoy.
- Autorización con dependencias: `Depends(require_roles("admin", "vendor"))`. La
  matriz de roles por sección es `ROUTES` de `src/routes/paths.js`.

## Estructura de los repos

### `nutrifree-api`

```
nutrifree-api/
├── app/
│   ├── main.py               # crea la app, routers, middlewares
│   ├── core/                 # config, db, security, errors, logging, tz, money
│   ├── modules/
│   │   └── <modulo>/         # router.py · schemas.py · service.py · repository.py · models.py
│   └── integrations/         # mercadopago/, storage/, auth_provider/
├── migrations/               # Alembic (env.py, versions/)
├── db/                       # bootstrap local y seed ficticio
├── tests/                    # unit/ · integration/ · contract/
├── docs/                     # TABLAS.md, FUNCIONES.md, ADRs
├── Dockerfile · docker-compose.yml · Makefile · pyproject.toml · uv.lock
├── .env.example · AGENTS.md · README.md
└── .github/                  # workflows, PR template, CODEOWNERS, dependabot
```

Capas: el **router** valida entrada/salida y permisos; el **service** tiene las
reglas y abre la transacción; el **repository** es el único que arma SQL.

### `nutrifree-web`

```
nutrifree-web/
├── src/
│   ├── app/                  # router, providers, layout, guards
│   ├── features/<modulo>/    # api.ts (hooks) · components/ · pages/ · schemas.ts · *.test.tsx
│   ├── components/ui/        # Button, Input, Select, Modal, Drawer, Table, Badge, Tabs, Toast…
│   ├── lib/                  # api (cliente + tipos generados), format, dates, money
│   ├── styles/               # tailwind.css con @theme (tokens)
│   └── test/                 # setup, MSW handlers
├── e2e/                      # Playwright
├── docs/                     # FUNCIONES.md (front), frontend_design.md
├── vite.config.ts · tsconfig.json · eslint.config.js · package.json
└── .env.example · AGENTS.md · README.md · .github/
```

## Entornos y variables

| Variable | Repo | Local (Docker) | Producción |
|---|---|---|---|
| `ENV` | api | `local` | `production` |
| `DATABASE_URL` | api | `postgresql+asyncpg://…@db:5432/postgres` | Pooler de Supabase en modo sesión (`aws-1-us-east-1.pooler.supabase.com:5432`) con el rol `nutrifree_api` |
| `AUTH_URL` | api | `http://auth:9999` (GoTrue local) | `https://lasiauvrppslxumksggz.supabase.co/auth/v1` |
| `AUTH_JWT_SECRET` / `AUTH_JWKS_URL` | api | secreto HS256 local | JWKS o secreto del proyecto (se confirma en P0) |
| `SUPABASE_SERVICE_ROLE_KEY` | api | — | solo para Storage, nunca sale del servidor |
| `STORAGE_BACKEND` | api | `local` | `supabase` |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | api | credenciales de prueba de MP | productivas |
| `CORS_ORIGINS` | api | `http://localhost:5173` | dominios de Vercel |
| `PUBLIC_BASE_URL` | api | `http://localhost:5173` | `https://nutrifree.lat` |
| `VITE_API_BASE_URL` | web | `/api` (proxy de Vite a `localhost:8000`) | `/api` (rewrite de Vercel a la API) |

Guarda de seguridad (igual que `assertSafeSupabaseEnvironment` del legado): con
`ENV=local` la API **se niega a arrancar** si `DATABASE_URL` apunta a un host
`*.supabase.co` o `*.supabase.com`.

## Seguridad: hallazgos del sistema actual

Se corrigen en las fases indicadas; no hace falta tocarlos en el legado salvo que
se decida lo contrario.

| Hallazgo | Riesgo | Se corrige en |
|---|---|---|
| `create-preference` arma la preferencia con los `price` que manda el navegador y `mp-webhook` no compara el monto pagado con `sales.total` ni verifica la firma de MercadoPago. | Un pedido web se puede pagar por menos de su total y quedar marcado como pagado. | B6 |
| Los roles se aplican solo en la UI. RLS (`solo_autenticados`) deja que **cualquier** usuario autenticado lea y escriba todas las tablas, incluso con rol `cocina` o inactivo. | Un empleado puede modificar ventas o saldos con la clave pública y su sesión. | B2 + P6 |
| Rol inicial derivado del prefijo del email y acceso concedido si falla la sincronización con `business_users`. | Escalada de privilegios / usuario bloqueado que entra igual. | B2 |
| Bucket `invoices` público. | Facturas con datos de clientes accesibles por URL. | P6 (bucket privado + URLs firmadas) |
| Edge Functions con CORS `*`. | Cualquier sitio puede llamarlas. | B6 (CORS restringido) |
| `xlsx@0.18.5` de npm tiene vulnerabilidades conocidas y no recibe actualizaciones ahí. | Archivos maliciosos al importar. | B9 (el Excel se procesa en la API con `openpyxl`) |
| El repo `nutrifree-pos` es público e incluye reportes internos de dinero y bugs. | Exposición de información del negocio. | P6 (pasarlo a privado y archivarlo) |

## Calidad

| | API | Web |
|---|---|---|
| Dependencias | `uv` (`pyproject.toml` + `uv.lock`), Python 3.13 | `npm` + lockfile, Node 22 LTS |
| Lint / formato | `ruff check`, `ruff format` | ESLint (flat config) + Prettier |
| Tipos | `mypy --strict` en `app/` | `tsc --noEmit`, `strict: true` |
| Unit | `pytest` | Vitest + Testing Library |
| Integración | `pytest` contra Postgres en Docker (transacción con rollback por test) | MSW contra handlers del contrato |
| E2E | — | Playwright contra el stack de Docker |
| Cobertura mínima | 85 % en `services/` | 80 % en `features/` y `lib/` |
| CI (GitHub Actions) | lint · tipos · tests · `alembic upgrade head` + `alembic check` en base vacía · build de la imagen | lint · tipos · tests · build · e2e |
| Otros | Dependabot, `CODEOWNERS`, plantilla de PR, Conventional Commits | ídem |
