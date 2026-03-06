/**
 * demoSupabase.js — Mock de Supabase para el modo demo
 *
 * Implementa la misma interfaz que el cliente real de Supabase usando
 * localStorage como almacenamiento. Soporta: select, insert, update,
 * delete, upsert, eq (filtros) y order. Es thenable (await-able).
 *
 * Las claves en localStorage siguen el patrón: "nutrifree_demo_<tabla>"
 */
// ─── Demo Supabase mock — localStorage-backed, same interface as real client ──
const KEY = "nutrifree_demo_";

const getRows = (table) => {
  try { return JSON.parse(localStorage.getItem(KEY + table) || "[]"); }
  catch { return []; }
};
const setRows = (table, rows) => localStorage.setItem(KEY + table, JSON.stringify(rows));

/**
 * Constructor de queries encadenables sobre localStorage.
 * Soporta el patrón fluido: demoClient.from("table").select().eq("col",val).order("col")
 */
class DemoQueryBuilder {
  constructor(table) {
    this._table  = table;
    this._op     = "select";
    this._data   = null;
    this._filters = [];        // [{ col, val }]
    this._orderCol = null;
    this._orderAsc = true;
  }

  select()        { this._op = "select"; return this; }
  insert(data)    { this._op = "insert"; this._data = Array.isArray(data) ? data : [data]; return this; }
  update(data)    { this._op = "update"; this._data = data; return this; }
  delete()        { this._op = "delete"; return this; }
  upsert(data)    { this._op = "upsert"; this._data = Array.isArray(data) ? data : [data]; return this; }

  /** Agrega un filtro de igualdad (se pueden encadenar múltiples). */
  eq(col, val)             { this._filters.push({ col, val }); return this; }
  /** Ordena el resultado por columna. Por defecto ascendente. */
  order(col, opts = {})    { this._orderCol = col; this._orderAsc = opts.ascending !== false; return this; }

  _applyFilters(rows) {
    return this._filters.reduce((acc, f) => acc.filter(r => r[f.col] === f.val), rows);
  }

  _run() {
    let rows = getRows(this._table);

    if (this._op === "select") {
      let out = this._applyFilters(rows);
      if (this._orderCol) {
        const c = this._orderCol, asc = this._orderAsc;
        out = [...out].sort((a, b) => {
          if (a[c] < b[c]) return asc ? -1 : 1;
          if (a[c] > b[c]) return asc ?  1 : -1;
          return 0;
        });
      }
      return { data: out, error: null };
    }

    if (this._op === "insert") {
      setRows(this._table, [...rows, ...this._data]);
      return { data: this._data, error: null };
    }

    if (this._op === "upsert") {
      let cur = [...rows];
      for (const item of this._data) {
        const idx = cur.findIndex(r => r.id === item.id);
        if (idx >= 0) cur[idx] = { ...cur[idx], ...item };
        else cur.push(item);
      }
      setRows(this._table, cur);
      return { data: this._data, error: null };
    }

    if (this._op === "update") {
      const updated = rows.map(r =>
        this._filters.every(f => r[f.col] === f.val) ? { ...r, ...this._data } : r
      );
      setRows(this._table, updated);
      return { data: null, error: null };
    }

    if (this._op === "delete") {
      const remaining = rows.filter(r =>
        !this._filters.every(f => r[f.col] === f.val)
      );
      setRows(this._table, remaining);
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }

  // Makes the builder awaitable (thenable)
  then(onFulfilled, onRejected) {
    return Promise.resolve(this._run()).then(onFulfilled, onRejected);
  }
}

export const demoClient = {
  from: (table) => new DemoQueryBuilder(table),
};
