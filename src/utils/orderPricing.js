/**
 * orderPricing — recálculo de precios de un pedido ya cargado.
 *
 * Replica en el Calendario de Pedidos la misma aritmética que el POS:
 * precio unitario por ítem + descuento (% o $ fijo) = total del pedido.
 *
 * Todo es puro (sin React ni Supabase) para poder testearlo aparte y para que
 * el POS y el Calendario no se separen con el tiempo.
 *
 * Convenciones heredadas del POS (src/pages/POSPage.jsx):
 * - `includeInTicket === false` saca el ítem del subtotal (envíos sin ticket).
 * - El descuento porcentual se redondea a peso entero.
 * - El descuento fijo nunca supera al subtotal: no existe el total negativo.
 */
import { parseMoneyInput } from "./money.js";

/** Suma de subtotales de los ítems que entran al ticket. */
export function itemsSubtotal(items = []) {
  return items.reduce(
    (sum, i) => sum + (i.includeInTicket === false ? 0 : Number(i.subtotal) || 0),
    0
  );
}

/**
 * Cambia el precio unitario de un ítem y recalcula su subtotal.
 * Marca `priceOverridden` para que se vea que el precio no es el de la lista.
 * Un valor inválido o negativo se toma como 0.
 */
export function setItemPrice(items = [], productId, rawPrice) {
  const price = Math.max(0, parseMoneyInput(rawPrice));
  return items.map(i =>
    i.productId === productId
      ? { ...i, price, subtotal: (Number(i.qty) || 0) * price, priceOverridden: true }
      : i
  );
}

/**
 * Cambia la cantidad de un ítem y recalcula su subtotal. Mínimo 1.
 */
export function setItemQty(items = [], productId, rawQty) {
  const qty = Math.max(1, Math.floor(Number(rawQty) || 0));
  return items.map(i =>
    i.productId === productId
      ? { ...i, qty, subtotal: qty * (Number(i.price) || 0) }
      : i
  );
}

/**
 * Importe del descuento a partir del subtotal y el descuento configurado.
 *
 * @param {number} subtotal
 * @param {"pct"|"fixed"} type
 * @param {number|string} value
 * @returns {number} importe a restar, siempre entre 0 y el subtotal
 */
export function discountAmountFor(subtotal, type, value) {
  const base = Math.max(0, Number(subtotal) || 0);
  const v = Math.max(0, parseMoneyInput(value));
  if (type === "fixed") return Math.min(v, base);
  return Math.min(Math.round(base * v / 100), base);
}

/**
 * Traduce un "precio final" tipeado a mano en un descuento fijo equivalente.
 * Pedir más que el subtotal no es un descuento: se recorta al subtotal.
 *
 * @returns {{ discountType:"fixed", discountValue:number, discountAmount:number, total:number }}
 */
export function discountFromFinalTotal(subtotal, rawFinalTotal) {
  const base = Math.max(0, Number(subtotal) || 0);
  const wanted = Math.min(Math.max(0, parseMoneyInput(rawFinalTotal)), base);
  const amount = Math.round((base - wanted) * 100) / 100;
  return { discountType: "fixed", discountValue: amount, discountAmount: amount, total: base - amount };
}

/**
 * Resumen de precios de un borrador de pedido: lo que se muestra y lo que se guarda.
 *
 * @param {{items:Array, discountType:string, discountValue:number|string}} draft
 * @returns {{ subtotal:number, discountAmount:number, total:number }}
 */
export function priceSummary(draft) {
  const subtotal = itemsSubtotal(draft?.items);
  const discountAmount = discountAmountFor(subtotal, draft?.discountType, draft?.discountValue);
  return { subtotal, discountAmount, total: subtotal - discountAmount };
}

/** ¿El borrador difiere de la venta guardada? Evita updates que no cambian nada. */
export function hasPriceChanges(sale, draft) {
  if (!sale || !draft) return false;
  const { total, discountAmount } = priceSummary(draft);
  if (total !== (Number(sale.total) || 0)) return true;
  if (discountAmount !== (Number(sale.discountAmount) || 0)) return true;
  const before = sale.items || [];
  if (before.length !== (draft.items?.length || 0)) return true;
  return draft.items.some((i, idx) =>
    (Number(i.price) || 0) !== (Number(before[idx]?.price) || 0) ||
    (Number(i.qty) || 0) !== (Number(before[idx]?.qty) || 0)
  );
}
