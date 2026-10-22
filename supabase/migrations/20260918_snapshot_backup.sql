-- =============================================================
-- Snapshot completo de `public` → schema `backup_20260918`
--
-- Motivo: copia de seguridad previa a las vacaciones de la
-- administradora, con stock y saldos verificados como correctos.
--
-- El schema queda fuera del search_path de PostgREST, así que la app
-- no lo ve y ninguna pantalla lo puede tocar. Además se revocan los
-- permisos de `anon` y `authenticated`.
--
-- Para tomar un snapshot nuevo, cambiá la fecha del nombre del schema.
-- =============================================================

create schema if not exists backup_20260918;

revoke all on schema backup_20260918 from anon, authenticated;

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename not like 'backup\_%'
    order by tablename
  loop
    execute format('drop table if exists backup_20260918.%I', t);
    execute format('create table backup_20260918.%I as select * from public.%I', t, t);
    execute format('revoke all on backup_20260918.%I from anon, authenticated', t);
  end loop;
end $$;

comment on schema backup_20260918 is
  'Snapshot completo de public tomado el 2026-09-18 antes de las vacaciones de la administradora. Solo lectura, no lo toca la app.';

-- ─── Verificación: no debe devolver ninguna fila ──────────────
-- do $$
-- declare t text; a bigint; b bigint;
-- begin
--   for t in select tablename from pg_tables where schemaname='public' and tablename not like 'backup\_%' loop
--     execute format('select count(*) from public.%I', t) into a;
--     execute format('select count(*) from backup_20260918.%I', t) into b;
--     if a <> b then raise notice 'DESCUADRE % public=% backup=%', t, a, b; end if;
--   end loop;
-- end $$;
