/**
 * createWebOrder — alta de un pedido web con la función create_web_order de la base.
 *
 * El servidor calcula precios (desde products), descuento (desde coupons) y total, y
 * arma las notas del pedido. El front solo manda lo que decide el cliente: nombre,
 * teléfono, fecha, lista de precios, productos con cantidad y código de cupón. Lo que
 * se ve en pantalla antes de confirmar es una vista previa; manda la respuesta del servidor.
 *
 * Todo es puro salvo `submitWebOrder`, que recibe el cliente de Supabase por parámetro
 * para poder testearlo con un doble.
 */
import { normalizeCouponCode } from "./coupons.js";

/**
 * Argumentos de create_web_order. El precio de cada ítem NO viaja: lo toma el servidor.
 *
 * @param {{cartItems:Array<{productId:string, qty:number}>, priceList:"retail"|"wholesale",
 *          name:string, phone:string, date:string, couponCode?:string|null}} order
 */
export function buildWebOrderRequest({ cartItems, priceList, name, phone, date, couponCode }) {
  return {
    p_customer_name: name.trim(),
    p_phone: phone.trim(),
    p_delivery_date: date,
    p_price_list: priceList,
    p_items: cartItems.map(({ productId, qty }) => ({ productId, qty })),
    p_coupon_code: couponCode ? normalizeCouponCode(couponCode) : null,
  };
}

const GENERIC_ERROR = "No pudimos registrar el pedido. Por favor intentá de nuevo.";

/** Motivos que devuelve create_web_order (mensaje "web_order:<motivo>") y su texto para el cliente. */
const ERROR_MESSAGES = {
  invalid_name: "Ingresá tu nombre.",
  invalid_phone: "Ingresá un teléfono válido.",
  invalid_price_list: GENERIC_ERROR,
  invalid_date: "La fecha de entrega no es válida. Elegí un día de lunes a sábado, desde mañana.",
  empty_cart: "Tu pedido está vacío.",
  invalid_item: "Alguno de los productos ya no está disponible en el menú. Revisá tu pedido.",
  invalid_qty: "Alguna de las cantidades no es válida. Revisá tu pedido.",
  min_qty: "El pedido mayorista requiere al menos 4 unidades por producto.",
  coupon_not_found: "El cupón ya no es válido. Quitalo o probá con otro.",
};

/**
 * Traduce el error de la base a un texto para el cliente.
 *
 * @param {string} rawMessage mensaje de error de Postgres/PostgREST
 * @returns {{reason:string|null, message:string}} `reason` es el motivo conocido o null
 */
export function webOrderError(rawMessage) {
  const reason = String(rawMessage ?? "").trim().match(/^web_order:([a-z_]+)$/)?.[1] ?? null;
  return { reason, message: (reason && ERROR_MESSAGES[reason]) || GENERIC_ERROR };
}

/**
 * Crea el pedido en el servidor.
 *
 * @param {{rpc:Function}} client cliente de Supabase
 * @param {ReturnType<typeof buildWebOrderRequest>} request
 * @returns {Promise<{order:{saleId:string, subtotal:number, discountAmount:number, total:number, couponCode:string|null}}
 *                   | {error:string, reason:string|null}>}
 */
export async function submitWebOrder(client, request) {
  try {
    const { data, error } = await client.rpc("create_web_order", request);
    if (error) {
      const { message, reason } = webOrderError(error.message);
      return { error: message, reason };
    }
    if (!data?.saleId) return { error: GENERIC_ERROR, reason: null };
    return {
      order: {
        saleId: data.saleId,
        subtotal: Number(data.subtotal) || 0,
        discountAmount: Number(data.discountAmount) || 0,
        total: Number(data.total) || 0,
        couponCode: data.couponCode ?? null,
      },
    };
  } catch {
    return { error: GENERIC_ERROR, reason: null };
  }
}
