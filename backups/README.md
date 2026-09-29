# Copias de seguridad — NutriFree POS

## Qué hay hoy

| Copia | Dónde | Contenido |
|---|---|---|
| `backup_20260918` | Schema dentro del mismo proyecto Supabase | Las 29 tablas de `public`, 18.987 filas. Verificado fila por fila contra el original. |
| `backup-20260918.manifest.json` | Este repo | Sólo conteos y totales de control. **Sin datos personales.** |

> ⚠️ Este repositorio es **público**. Nunca commitees un dump con datos
> reales sin cifrar: `customers`, `sales`, `suppliers` y `business_users`
> contienen nombres, teléfonos, direcciones, CUIT, emails y saldos de
> personas reales.

## Restaurar desde el snapshot de Supabase

Es la vía rápida si alguien rompió datos mientras la administradora no estaba.
Desde el SQL Editor del dashboard, una tabla a la vez:

```sql
-- Ejemplo: volver los saldos de clientes al 18/09/2026
begin;
  delete from public.customers;
  insert into public.customers select * from backup_20260918.customers;
commit;
```

Si la tabla tiene hijos con foreign key, restaurá primero el padre y después
el hijo, en el orden de `scripts/backup/tables.js`.

Para reponer sólo lo que falta, sin pisar lo nuevo:

```sql
insert into public.customers
select * from backup_20260918.customers b
where not exists (select 1 from public.customers p where p.id = b.id);
```

## Verificar que la base sigue cuadrando

Compará los totales de control contra el manifiesto:

```sql
select json_build_object(
  'clientes_con_saldo',    (select count(*) from customers where coalesce(balance,0) <> 0),
  'saldo_clientes_total',  (select round(coalesce(sum(balance),0)::numeric,2) from customers),
  'stock_productos_suma',  (select round(coalesce(sum(stock),0)::numeric,3) from products),
  'stock_ingredientes_suma', (select round(coalesce(sum(stock),0)::numeric,3) from ingredients)
);
```

Si alguno no coincide con `backups/backup-20260918.manifest.json`, alguien tocó
esos datos. `compararManifiestos()` en `scripts/backup/manifest.js` hace la
comparación completa y devuelve sólo las diferencias.

## Generar un backup a archivo (fuera de Supabase)

Hace falta una **service role key** (Dashboard → Project Settings → API →
`service_role`). Esa clave saltea RLS: no la subas al repo ni la pegues en un
chat.

```bash
export SUPABASE_URL=https://lasiauvrppslxumksggz.supabase.co
export SUPABASE_KEY=<service_role_key>

# 1. Dump completo a JSON
node scripts/backup/dump.mjs /tmp/nutrifree-$(date +%Y%m%d).json

# 2. Cifrar antes de guardarlo en cualquier lado
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in  /tmp/nutrifree-$(date +%Y%m%d).json \
  -out /tmp/nutrifree-$(date +%Y%m%d).json.enc
shred -u /tmp/nutrifree-$(date +%Y%m%d).json

# 3. Descifrar cuando lo necesites
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in nutrifree-20260918.json.enc -out nutrifree-20260918.json
```

Guardá el `.enc` fuera de GitHub (Drive, disco externo) y la contraseña en un
gestor de contraseñas, por separado.

## Restaurar desde el archivo

```bash
export SUPABASE_URL=... SUPABASE_KEY=<service_role_key>

node scripts/backup/restore.mjs nutrifree-20260918.json            # dry run
node scripts/backup/restore.mjs nutrifree-20260918.json --confirmar
```

`restore.mjs` inserta con `resolution=ignore-duplicates`: repone las filas que
falten y no pisa las existentes. Para volver a un estado exacto, restaurá sobre
una base vacía o usá el snapshot SQL.

## Archivos

| Archivo | Qué hace |
|---|---|
| `scripts/backup/tables.js` | Inventario de tablas, en orden de restauración, y cuáles tienen datos personales. |
| `scripts/backup/rest.js` | Cliente PostgREST mínimo, con paginado e inserción por lotes. |
| `scripts/backup/dump.mjs` | Dump completo a JSON. |
| `scripts/backup/restore.mjs` | Restauración desde JSON, con dry run. |
| `scripts/backup/manifest.js` | Conteos, totales de control y comparación entre manifiestos. |
| `supabase/migrations/20260918_snapshot_backup.sql` | El SQL que creó el snapshot en la base. |
