/**
 * coupons — cupones de descuento porcentual para los pedidos web.
 *
 * Todo es puro (sin React) salvo `lookupCoupon`, que recibe el cliente de
 * Supabase por parámetro para poder testearlo con un doble.
 *
 * El descuento reutiliza `discountAmountFor` de orderPricing: el porcentaje se
 * redondea a peso entero, igual que en el POS y en el Calendario de Pedidos.
 */
import { discountAmountFor } from "./orderPricing.js";
import { parseMoneyInput } from "./money.js";

/** Mismo formato que valida la base (constraint `coupons_code_format`). */
const CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

/** "  bienvenida 10 " → "BIENVENIDA10": sin espacios y en mayúsculas. */
export const normalizeCouponCode = raw =>
  String(raw ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Valida el alta de un cupón desde Configuración.
 *
 * @param {{code:string, discountPct:string|number}} input
 * @param {string[]} existingCodes códigos ya cargados, para evitar duplicados
 * @returns {{ok:true, code:string, discountPct:number} | {ok:false, error:string}}
 */
export function validateCouponInput({ code, discountPct }, existingCodes = []) {
  const normalized = normalizeCouponCode(code);
  if (!CODE_PATTERN.test(normalized)) {
    return { ok: false, error: "El código debe tener de 3 a 20 letras, números, guion o guion bajo." };
  }
  const pct = parseMoneyInput(discountPct);
  if (!(pct > 0 && pct <= 100)) {
    return { ok: false, error: "El descuento debe ser mayor a 0% y hasta 100%." };
  }
  if (existingCodes.includes(normalized)) {
    return { ok: false, error: "Ya existe un cupón con ese código." };
  }
  return { ok: true, code: normalized, discountPct: Math.round(pct * 100) / 100 };
}

/**
 * Campos de `sales` que deja un cupón aplicado sobre un subtotal.
 * Sin cupón no hay descuento y el total es el subtotal.
 *
 * @param {number} subtotal
 * @param {{discountPct:number}|null} coupon
 */
export function couponSaleFields(subtotal, coupon) {
  const base = Math.max(0, Number(subtotal) || 0);
  if (!coupon) return { discountType: "pct", discountValue: 0, discountAmount: 0, total: base };
  const discountAmount = discountAmountFor(base, "pct", coupon.discountPct);
  return { discountType: "pct", discountValue: coupon.discountPct, discountAmount, total: base - discountAmount };
}

/** Texto para las notas del pedido, así se ve en el Calendario qué cupón usó. */
export const couponNote = coupon =>
  coupon ? `Cupón ${coupon.code} (-${coupon.discountPct}%)` : "";

/**
 * Consulta un código en la base (función `validate_coupon`).
 *
 * @param {{rpc:Function}} client cliente de Supabase
 * @param {string} rawCode lo que tipeó el cliente
 * @returns {Promise<{coupon:{code:string, discountPct:number}} | {error:string}>}
 */
export async function lookupCoupon(client, rawCode) {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { error: "Ingresá un código de cupón." };
  const { data, error } = await client.rpc("validate_coupon", { p_code: code });
  if (error) return { error: "No pudimos validar el cupón. Probá de nuevo." };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "El cupón no existe." };
  return { coupon: { code: row.code, discountPct: Number(row.discount_pct) } };
}
