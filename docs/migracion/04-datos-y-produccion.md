# 04 — Datos, Docker local y salida a producción (P0–P6)

La regla de fondo: **la base de producción no se migra, se adopta**. El esquema,
los datos, los usuarios de Auth y los archivos de Storage quedan donde están. Lo
único que cambia es quién habla con la base: antes el navegador, ahora la API.

## Desarrollo local con Docker

| Servicio | Imagen | Puerto local | Qué es |
|---|---|---|---|
| `db` | `supabase/postgres:17.6.1.063` | `5433` | Postgres con la misma versión, roles y extensiones que producción |
| `auth` | `supabase/gotrue:v2.189.0` | `9999` | Supabase Auth (misma versión que producción) |
| `api` | build local | `8000` | FastAPI con recarga en caliente |
| web | `npm run dev` (fuera de Docker) | `5173` | Vite con proxy `/api` → `8000` |

- `make up` levanta todo; `make reset-db` borra el volumen, migra y carga el seed.
- Datos **siempre ficticios** en el repo. Nunca se commitea un dump de
  producción (`.gitignore`: `*.dump`, `data_*.sql`, `backups/`).
- Archivos: volumen `./.storage` (backend `LocalStorage`).
- La API se niega a arrancar con `ENV=local` si `DATABASE_URL` apunta a Supabase.

## Reglas de migraciones

Mientras el sistema viejo pueda volver a usarse (hasta P6), todo cambio de
esquema tiene que ser compatible con el front legado:

| Permitido (expand) | Prohibido hasta P6 (contract) |
|---|---|
| Crear tablas nuevas | Borrar tablas o columnas |
| Agregar columnas nullable o con default | Renombrar tablas o columnas |
| Crear índices (`CONCURRENTLY`) | Cambiar tipos de columnas existentes |
| Crear o reemplazar funciones sin cambiar su firma | Cambiar firmas de funciones que usa el legado |
| Agregar constraints `NOT VALID` y validarlos después | Quitar políticas RLS que usa el legado |

Además:
- Toda tabla nueva en `public` lleva `ENABLE ROW LEVEL SECURITY` y **ninguna**
  política: Supabase expone `public` por PostgREST y así `anon` no la ve. La API
  no se ve afectada porque su rol tiene `BYPASSRLS`.
- La tabla de versiones de Alembic va en un esquema no expuesto:
  `version_table_schema = "nutrifree_meta"`.
- Cada migración tiene `upgrade` y `downgrade` y se prueba en CI sobre base
  vacía y sobre base con seed.
- En producción solo se migra con backup previo y siguiendo `docs/RUNBOOK.md`.

---

## P0 — Preparación (la hacés vos, no Codex)

1. **Backup completo**, guardado fuera de cualquier repo y cifrado:

   ```bash
   supabase db dump --linked -f backups/schema_prod.sql
   ```

   ```bash
   supabase db dump --linked --data-only -f backups/data_prod.sql
   ```

   ```bash
   supabase db dump --linked --role-only -f backups/roles_prod.sql
   ```

   Más una copia del bucket `invoices` (desde el Dashboard o con `supabase storage`).
2. Pasar `schema_prod.sql` (solo esquema, sin datos) a Codex para B1.
3. Confirmar cómo firma los JWT el proyecto (Dashboard → Project Settings → JWT
   Keys): secreto legacy HS256 o claves asimétricas (JWKS). Define
   `AUTH_JWT_SECRET` o `AUTH_JWKS_URL`.
4. Verificar que todo usuario de Auth tenga fila en `business_users` (la API
   nueva no los crea solos):

   ```sql
   select u.email
   from auth.users u
   left join public.business_users b on lower(b.email) = lower(u.email)
   where b.id is null;
   ```

5. Confirmar que el registro público (signup) está deshabilitado en Supabase Auth.
6. MercadoPago: credenciales de prueba y la clave secreta del webhook
   (Tus integraciones → Webhooks).
7. Resolver DP-1 (hosting de la API).

## P1 — UAT con datos reales en local

- Perfil `uat` de docker compose con volumen propio: restaurar
  `data_prod.sql` en la base local. Opcional: `scripts/anonymize.sql` (nombres,
  teléfonos, emails, CUIT).
- Crear en GoTrue local usuarios de prueba con los emails de `business_users`
  (script) para entrar con cada rol.
- Recorrer el checklist de paridad con el volumen real de datos y medir tiempos.
- Probar el circuito de MercadoPago completo con credenciales de prueba y un
  túnel (cloudflared o ngrok) para recibir el webhook.
- Correr las consultas de `docs/AUDITORIA.md` antes y después de operar: los
  resultados tienen que dar lo esperado.

## P2 — Preparar la base de producción (sin tocar datos)

1. Backup fresco (P0.1).
2. Crear el rol `nutrifree_api` con `db/roles/nutrifree_api.sql` (contraseña
   fuerte, guardada solo en el gestor de secretos del hosting).
3. `alembic stamp 0001_baseline` contra producción: registra la versión sin
   ejecutar nada.
4. `alembic upgrade head`: aplica solo las migraciones expand (por ejemplo
   `payment_events` e índices). El sistema viejo sigue funcionando igual.
5. `scripts/schema_diff.sh` contra producción: solo las diferencias esperadas.

Conexión desde la API: pooler de Supabase en **modo sesión**
(`aws-1-us-east-1.pooler.supabase.com:5432`) con un pool chico (5–10). Si se usa
modo transacción (puerto 6543), desactivar la cache de prepared statements de
asyncpg.

## P3 — Deploy sin tráfico

- API en el hosting elegido, región `us-east-1`, dominio `api.nutrifree.lat`,
  secretos en el gestor del proveedor.
- Web como **proyecto nuevo** en Vercel (`nutrifree-web`), con el rewrite
  `/api/*` → API. Por ahora solo con su dominio de preview.
- Smoke tests contra producción, solo lectura: login con cada rol; dashboard del
  día, saldos de clientes y de proveedores iguales a los del sistema viejo
  (script que compara respuestas de la API con consultas SQL).

## P4 — Cutover

En una ventana de baja actividad (por ejemplo domingo a la noche):

1. Avisar al equipo y congelar cambios en el legado.
2. Backup fresco.
3. `alembic upgrade head` si hay migraciones nuevas.
4. En Vercel, pasar `app.nutrifree.lat`, `nutrifree.lat` y `www.nutrifree.lat`
   del proyecto viejo al proyecto `nutrifree-web`.
5. Las preferencias de MercadoPago nuevas ya notifican a la API. Las Edge
   Functions viejas **siguen desplegadas** 7 días para los pagos en curso.
6. Smoke test: login por rol, una venta de prueba y su cancelación (queda en
   `audit_log`), un pedido web de bajo monto pagado y cancelado.
7. Mirar logs y errores durante 2 horas.

**Rollback** (posible hasta P6): devolver los dominios al proyecto viejo en
Vercel. Tarda minutos y no pierde datos porque los dos sistemas usan el mismo
esquema.

## P5 — Estabilización (2 semanas)

- Todos los días: consultas de `docs/AUDITORIA.md`, errores de la API y control
  de los cierres de caja.
- Se corrige hacia adelante. Criterio de rollback: errores en cobros, stock o
  saldos que no se puedan corregir en el día.

## P6 — Cierre (contract)

Después de P6 **ya no hay rollback** al sistema viejo.

1. Migración que cierra PostgREST: borrar las políticas `anon_*` y `solo_autenticados`
   y revocar los permisos de `anon` y `authenticated` sobre `public`. Desde acá
   solo la API accede a la base.
2. Borrar las Edge Functions `create-preference` y `mp-webhook` (después de 7
   días sin llamadas).
3. Bucket `invoices` privado; la API entrega URLs firmadas. Las URLs públicas
   guardadas en la base se reemplazan por la ruta del objeto (script con backup previo).
4. Limpiezas opcionales, cada una con backup: `backup_customers_20260630`,
   `customers.balance` (desincronizado, no se usa).
5. Pasar `nutrifree-pos` a privado y archivarlo; pausar el proyecto viejo de Vercel.
6. Rotar la service role key y las credenciales que hayan pasado por el legado.
7. Emails de alerta desde la API (DP-4).
