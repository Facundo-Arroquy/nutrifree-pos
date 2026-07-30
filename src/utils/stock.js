/**
 * stock.js — Única fuente de verdad para el movimiento de stock de ventas y pedidos.
 *
 * MODELO: el stock se descuenta cuando el pedido pasa a "Listo para Retirar"
 * ("ready"), no al crearlo. Una venta directa del POS nace en "closed", que
 * equivale a entregada, así que descuenta en el acto. Un pedido nace en "open"
 * y todavía no compromete stock: se descuenta al avanzar a "ready" o, si se
 * cobra sin haber pasado por ahí, al cerrarlo.
 *
 * Antes esta lógica estaba duplicada en POSPage, OrdersPage y OrdersKanbanPage
 * con reglas distintas, lo que provocaba pedidos cerrados sin descontar stock,
 * dobles descuentos y restauraciones de stock que nunca se había descontado.
 */

import { supabase } from "../supabase.js";

/** Estados en los que el stock de la venta/pedido ya fue descontado. */
export const DEDUCTED_STATUSES = ["ready", "delivered", "closed"];

/**
 * ¿El stock de esta venta ya fue descontado?
 * Se deriva del estado: evita descontar dos veces y evita restaurar al cancelar
 * un pedido que nunca comprometió stock.
 */
export const stockAlreadyDeducted = (sale) =>
  DEDUCTED_STATUSES.includes(sale?.status);

/**
 * Expande los items de una venta a deltas por producto, resolviendo los kits
 * a sus componentes y acumulando cantidades repetidas.
 *
 * Un item cuenta como kit solo si trae componentes: un item marcado `isKit`
 * pero sin `kitItems` se trata como producto normal, para no perder el
 * descuento en silencio.
 *
 * @returns {Array<{id: string, delta: number, name: string}>} deltas positivos
 */
export const buildStockDeltas = (items = []) => {
  const deltas = [];
  const add = (id, qty, name) => {
    if (!id || !qty) return;
    const existing = deltas.find(d => d.id === id);
    if (existing) existing.delta += qty;
    else deltas.push({ id, delta: qty, name: name || "" });
  };
  for (const item of items) {
    if (item.kitItems?.length) {
      for (const comp of item.kitItems) {
        add(comp.productId, comp.qty * item.qty, comp.name);
      }
    } else {
      add(item.productId, item.qty, item.name);
    }
  }
  return deltas;
};

/**
 * Aplica al estado local de productos los stocks devueltos por las RPC.
 * @param {Array} products lista actual
 * @param {Array<{id: string, stock: number}>} results filas de la RPC
 */
export const applyStockResults = (products, results) => {
  if (!results?.length) return products;
  return products.map(p => {
    const upd = results.find(r => r.id === p.id);
    return upd ? { ...p, stock: upd.stock } : p;
  });
};

/**
 * Construye el aviso a mostrar cuando el descuento dejó faltantes o encontró
 * productos inexistentes. Devuelve null si todo salió limpio.
 *
 * `complete_sale_stocks` no falla ante stock insuficiente (marcar un pedido
 * como listo no debe bloquearse), pero informa el faltante para que quede
 * visible en lugar de clamparse a 0 en silencio.
 */
export const stockWarning = (results = []) => {
  const missing = results.filter(r => r.missing);
  const short = results.filter(r => !r.missing && r.shortfall > 0);
  const parts = [];
  if (short.length) {
    parts.push(
      "Stock insuficiente: " +
      short.map(r => `${r.name || r.id} (faltaron ${r.shortfall})`).join(", ")
    );
  }
  if (missing.length) {
    parts.push(
      "Productos inexistentes: " + missing.map(r => r.name || r.id).join(", ")
    );
  }
  return parts.length ? parts.join(" · ") : null;
};

/**
 * Descuenta el stock de una venta/pedido de forma atómica en el servidor.
 * No lanza si falta stock (marcar un pedido como listo no debe bloquearse):
 * el faltante viene informado en cada fila para avisar por UI.
 *
 * @returns {Promise<Array>} filas {id, stock, shortfall, missing, name}
 * @throws si la RPC falla
 */
export async function deductSaleStock(items) {
  const deltas = buildStockDeltas(items);
  if (deltas.length === 0) return [];
  const { data, error } = await supabase.rpc("complete_sale_stocks", {
    p_stock_deltas: deltas,
  });
  if (error) throw error;
  // La RPC no devuelve el nombre; lo reponemos para los mensajes de aviso.
  return (data || []).map(r => ({
    ...r,
    name: r.name || deltas.find(d => d.id === r.id)?.name || "",
  }));
}

/**
 * Sincroniza el stock ante un cambio de estado, manteniendo el invariante
 * "el stock está descontado si y solo si el estado es uno de DEDUCTED_STATUSES".
 *
 * Descuenta al entrar a un estado descontado y restaura al salir de él: sin la
 * simetría, arrastrar un pedido de "Listo para Retirar" hacia atrás dejaba el
 * stock descontado y volver a avanzarlo lo descontaba por segunda vez.
 *
 * @returns {Promise<{action: "deduct"|"restore"|"none", results: Array, deltas: Array}>}
 * @throws si la RPC falla
 */
export async function syncStockForStatusChange(sale, newStatus) {
  const was = stockAlreadyDeducted(sale);
  const willBe = stockAlreadyDeducted({ status: newStatus });

  if (!was && willBe) {
    const results = await deductSaleStock(sale.items);
    return { action: "deduct", results, deltas: buildStockDeltas(sale.items) };
  }
  if (was && !willBe) {
    // Cancelar tiene su propio camino (restoreSaleStock) porque además registra
    // los movimientos de stock con el motivo.
    const { results, deltas } = await restoreSaleStock(sale);
    return { action: "restore", results, deltas };
  }
  return { action: "none", results: [], deltas: [] };
}

/**
 * Restaura el stock de una venta/pedido cancelado y registra los movimientos.
 * No hace nada si el pedido nunca llegó a descontar stock.
 *
 * @returns {Promise<{results: Array, deltas: Array}>} results vacío si no aplicaba
 * @throws si la RPC falla
 */
export async function restoreSaleStock(sale) {
  if (!stockAlreadyDeducted(sale)) return { results: [], deltas: [] };
  const deltas = buildStockDeltas(sale.items);
  if (deltas.length === 0) return { results: [], deltas: [] };
  const { data, error } = await supabase.rpc("cancel_order_stocks", {
    p_restore_deltas: deltas,
    p_sale_id: sale.id,
  });
  if (error) throw error;
  return { results: data || [], deltas };
}
