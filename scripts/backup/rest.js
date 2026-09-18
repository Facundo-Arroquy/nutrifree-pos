// Cliente mínimo de PostgREST para dump/restore. Sin dependencias.

const PAGE_SIZE = 1000;

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function makeClient({ url, key }) {
  const base = url.replace(/\/$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  async function request(path, init = {}) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    if (!res.ok) {
      throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
    }
    return res;
  }

  /** Descarga una tabla completa paginando de a PAGE_SIZE filas. */
  async function fetchAll(table) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const res = await request(`${table}?select=*`, {
        headers: { Range: `${from}-${from + PAGE_SIZE - 1}` },
      });
      const page = await res.json();
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }

  /** Inserta filas en lotes, sin pisar las que ya existen. */
  async function insertAll(table, rows, { chunkSize = 500 } = {}) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      await request(table, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=ignore-duplicates',
        },
        body: JSON.stringify(rows.slice(i, i + chunkSize)),
      });
    }
  }

  return { fetchAll, insertAll };
}
