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

// ─── Demo RPC implementations (simula las funciones SQL en localStorage) ──────

function demoApplyProduction({ p_product_id, p_qty, p_movement_id, p_movement_name, p_ing_deltas }) {
  // Incrementar stock del producto
  const products = getRows("products");
  let product_stock = null;
  setRows("products", products.map(p => {
    if (p.id !== p_product_id) return p;
    product_stock = (p.stock || 0) + p_qty;
    return { ...p, stock: product_stock };
  }));

  // Registrar movimiento
  const movements = getRows("stock_movements");
  movements.unshift({ id: p_movement_id, product_id: p_product_id, product_name: p_movement_name, qty: p_qty, type: "production", notes: "", created_at: new Date().toISOString() });
  setRows("stock_movements", movements);

  // Decrementar stock de ingredientes
  const ingredients = getRows("ingredients");
  const ingredient_stocks = [];
  setRows("ingredients", ingredients.map(ing => {
    const delta = (p_ing_deltas || []).find(d => d.id === ing.id);
    if (!delta) return ing;
    const newStock = (ing.stock || 0) - delta.delta;
    ingredient_stocks.push({ id: ing.id, stock: newStock });
    return { ...ing, stock: newStock };
  }));

  return { data: { product_stock, ingredient_stocks }, error: null };
}

function demoCompleteSaleStocks({ p_stock_deltas }) {
  const products = getRows("products");
  const results = [];
  setRows("products", products.map(p => {
    const delta = (p_stock_deltas || []).find(d => d.id === p.id);
    if (!delta) return p;
    const newStock = Math.max(0, (p.stock || 0) - delta.delta);
    results.push({ id: p.id, stock: newStock });
    return { ...p, stock: newStock };
  }));
  return { data: results, error: null };
}

function demoCancelOrderStocks({ p_restore_deltas, p_sale_id }) {
  const products = getRows("products");
  const results = [];
  setRows("products", products.map(p => {
    const delta = (p_restore_deltas || []).find(d => d.id === p.id);
    if (!delta) return p;
    const newStock = (p.stock || 0) + delta.delta;
    results.push({ id: p.id, stock: newStock });
    return { ...p, stock: newStock };
  }));

  const movements = getRows("stock_movements");
  for (const d of (p_restore_deltas || [])) {
    movements.unshift({ id: crypto.randomUUID(), product_id: d.id, product_name: d.name, qty: d.delta, type: "cancelación", notes: "Pedido " + p_sale_id, created_at: new Date().toISOString() });
  }
  setRows("stock_movements", movements);

  return { data: results, error: null };
}

function demoAdjustIngredientStock({ p_id, p_delta, p_unit_cost }) {
  const ingredients = getRows("ingredients");
  let newStock = null;
  setRows("ingredients", ingredients.map(ing => {
    if (ing.id !== p_id) return ing;
    newStock = (ing.stock || 0) + p_delta;
    return { ...ing, stock: newStock, ...(p_unit_cost != null ? { unit_cost: p_unit_cost } : {}) };
  }));
  return { data: newStock, error: null };
}

function demoAdjustCustomerBalance({ p_id, p_delta }) {
  const customers = getRows("customers");
  let newBalance = null;
  setRows("customers", customers.map(c => {
    if (c.id !== p_id) return c;
    newBalance = (c.balance || 0) + p_delta;
    return { ...c, balance: newBalance };
  }));
  return { data: newBalance, error: null };
}

const DEMO_RPCS = {
  apply_production:       demoApplyProduction,
  complete_sale_stocks:   demoCompleteSaleStocks,
  cancel_order_stocks:    demoCancelOrderStocks,
  adjust_ingredient_stock: demoAdjustIngredientStock,
  adjust_customer_balance: demoAdjustCustomerBalance,
};

export const demoClient = {
  from: (table) => new DemoQueryBuilder(table),
  rpc: (fn, args) => {
    const handler = DEMO_RPCS[fn];
    if (handler) return Promise.resolve(handler(args));
    return Promise.resolve({ data: null, error: { message: `RPC demo no implementado: ${fn}` } });
  },
};
