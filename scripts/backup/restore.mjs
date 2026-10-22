#!/usr/bin/env node
/**
 * Restaura un backup JSON generado por dump.mjs.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_KEY=... node scripts/backup/restore.mjs backups/salida.json [--confirmar]
 *
 * Sin --confirmar sólo muestra qué haría (dry run). Inserta con
 * `resolution=ignore-duplicates`: no pisa filas existentes, sólo repone las
 * que falten. Para volver a un estado exacto conviene restaurar sobre una
 * base vacía o usar el snapshot SQL (ver backups/README.md).
 */
import { readFileSync } from 'node:fs';
import { makeClient, requireEnv } from './rest.js';
import { TABLES } from './tables.js';

export function leerBackup(ruta) {
  const backup = JSON.parse(readFileSync(ruta, 'utf8'));
  if (backup.formato !== 'nutrifree-backup/1') {
    throw new Error(`Formato desconocido: ${backup.formato}`);
  }
  return backup;
}

export async function restaurar(client, datos, { confirmar = false, onTable } = {}) {
  for (const table of TABLES) {
    const rows = datos[table] ?? [];
    if (rows.length && confirmar) await client.insertAll(table, rows);
    onTable?.(table, rows.length);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ruta = process.argv[2];
  if (!ruta) throw new Error('Falta la ruta del backup');
  const confirmar = process.argv.includes('--confirmar');
  const backup = leerBackup(ruta);
  const client = makeClient({ url: requireEnv('SUPABASE_URL'), key: requireEnv('SUPABASE_KEY') });

  console.log(confirmar ? 'RESTAURANDO' : 'DRY RUN (agregá --confirmar para escribir)');
  await restaurar(client, backup.datos, {
    confirmar,
    onTable: (t, n) => console.log(`${t}: ${n}`),
  });
}
