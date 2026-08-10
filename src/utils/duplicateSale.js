/**
 * duplicateSale — detección de ventas cargadas dos veces.
 *
 * El POS ("Ventas en Mostrador") y el Calendario de Pedidos son dos caminos
 * distintos que terminan en la misma tabla `sales`. Cuando la misma entrega se
 * carga por los dos, el negocio queda con:
 *   - el ingreso contado dos veces,
 *   - el stock descontado dos veces,
 *   - y, si una de las dos fue a cuenta corriente, una deuda que el cliente ya
 *     pagó (cobrada por el otro camino).
 *
 * Este módulo es lógica pura: recibe las ventas ya cargadas en memoria y avisa
 * si la que se está por registrar se parece a una anterior. No bloquea nada —
 * la decisión final siempre es de quien está en el mostrador.
 */

/** Estados que siguen representando mercadería viva (pendiente de entregar o ya cobrada). */
export const LIVE_SALE_STATUSES = ["open", "pending", "preparing", "ready", "closed"];

/** Días hacia atrás que se miran para considerar dos ventas "la misma". */
export const DUPLICATE_WINDOW_DAYS = 7;

const STATUS_LABELS = {
  open: "pedido pendiente",
  pending: "pedido pendiente",
  preparing: "pedido en preparación",
  ready: "pedido listo para retirar",
  closed: "venta cerrada",
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Milisegundos de un ISO/Date; NaN si no se puede leer. */
const ms = (value) => {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
};

const DAY_MS = 86400000;

/** Fecha corta DD/MM para los mensajes. */
export function shortDate(value) {
  const t = ms(value);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Monto con separador de miles, como se muestra en la app. */
export const formatAmount = (n) => `$${round2(n).toLocaleString("es-AR")}`;

/**
 * Ventas anteriores que parecen ser la misma que `candidate`.
 *
 * Criterio: mismo cliente identificado, mismo total, estado vivo (no cancelado)
 * y creada dentro de la ventana de días. Las ventas anónimas nunca se comparan:
 * sin cliente, dos tickets del mismo monto son indistinguibles y el aviso sería
 * ruido constante.
 *
 * @param {Array}  sales      Ventas conocidas (las que ya están en memoria).
 * @param {Object} candidate  { id?, customerId, total, createdAt? }
 * @param {Object} [options]  { windowDays }
 * @returns {Array} coincidencias, de la más reciente a la más vieja.
 */
export function findDuplicateSales(sales, candidate, { windowDays = DUPLICATE_WINDOW_DAYS } = {}) {
  const customerId = candidate?.customerId;
  if (!customerId || !Array.isArray(sales)) return [];

  const total = round2(candidate.total);
  if (!total) return [];

  const refTime = ms(candidate.createdAt) || Date.now();
  const windowMs = windowDays * DAY_MS;

  return sales
    .filter((s) => {
      if (!s || s.id === candidate.id) return false;
      if (s.customerId !== customerId) return false;
      if (!LIVE_SALE_STATUSES.includes(s.status)) return false;
      if (round2(s.total) !== total) return false;
      const t = ms(s.createdAt);
      if (Number.isNaN(t)) return false;
      return Math.abs(refTime - t) <= windowMs;
    })
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

/** Etiqueta legible del estado de una venta. */
export const saleStatusLabel = (status) => STATUS_LABELS[status] || status || "venta";

/**
 * Mensaje de confirmación para mostrar antes de registrar una venta repetida.
 * Devuelve null si no hay nada que advertir.
 *
 * @param {Array}  duplicates  Salida de findDuplicateSales().
 * @param {string} customerName
 */
export function duplicateWarning(duplicates, customerName = "El cliente") {
  if (!duplicates?.length) return null;
  const first = duplicates[0];
  const extra = duplicates.length > 1 ? ` (y ${duplicates.length - 1} más)` : "";
  return (
    `${customerName} ya tiene ${saleStatusLabel(first.status)} por ${formatAmount(first.total)} ` +
    `del ${shortDate(first.createdAt)}${extra}.\n\n` +
    `Si es la misma entrega, cargarla de nuevo duplica el ingreso y el stock.\n\n` +
    `¿Registrar igual?`
  );
}
