#!/usr/bin/env node
/**
 * Dump completo de la base a un JSON.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_KEY=... node scripts/backup/dump.mjs backups/salida.json
 *
 * SUPABASE_KEY tiene que ser una clave con permiso de lectura sobre todas las
 * tablas (service role). Ver backups/README.md.
 */
import { writeFileSync } from 'node:fs';
import { makeClient, requireEnv } from './rest.js';
import { TABLES } from './tables.js';

const PAGE = 500;

export async function dumpAll(client, { onTable } = {}) {
  const data = {};
  for (const table of TABLES) {
    data[table] = await client.fetchAll(table);
    onTable?.(table, data[table].length);
  }
  return data;
}

export function buildBackup(data, { generatedAt = new Date().toISOString() } = {}) {
  return {
    formato: 'nutrifree-backup/1',
    generado_en: generatedAt,
    tablas: TABLES,
    filas: Object.fromEntries(TABLES.map((t) => [t, (data[t] ?? []).length])),
    datos: data,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) throw new Error('Falta la ruta de salida');
  const client = makeClient({ url: requireEnv('SUPABASE_URL'), key: requireEnv('SUPABASE_KEY') });
  const data = await dumpAll(client, { onTable: (t, n) => console.log(`${t}: ${n}`) });
  writeFileSync(out, JSON.stringify(buildBackup(data), null, 0));
  console.log(`\nEscrito ${out}`);
}
