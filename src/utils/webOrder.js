export const WEB_ORDER_MARKER = "[WEB]";

const pad = value => String(value).padStart(2, "0");

export const localDateString = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function minimumDeliveryDate(requiresPreparation, now = new Date()) {
  const minimum = new Date(now);
  if (requiresPreparation) minimum.setTime(minimum.getTime() + 48 * 60 * 60 * 1000);
  else minimum.setDate(minimum.getDate() + 1);

  while (minimum.getDay() === 0) minimum.setDate(minimum.getDate() + 1);
  return localDateString(minimum);
}

export const cartRequiresPreparation = (items, products, stockOf) =>
  items.some(item => {
    const product = products.find(candidate => candidate.id === item.productId);
    return product ? stockOf(product) < (item.qty || 1) : false;
  });

/** Cantidad que se agrega al seleccionar por primera vez un producto. */
export const initialOrderQuantity = (currentQuantity, minimumQuantity = 1) =>
  currentQuantity > 0 ? currentQuantity + 1 : minimumQuantity;

/** Al bajar del mínimo, elimina el producto del carrito. */
export const decreaseOrderQuantity = (currentQuantity, minimumQuantity = 1) =>
  currentQuantity <= minimumQuantity ? 0 : currentQuantity - 1;

/** Un producto público debe estar activo y marcado explícitamente para el menú. */
export const isPublishedMenuProduct = product =>
  product?.active === true && product?.showInMenu === true;

export const isWebOrder = sale =>
  typeof sale?.notes === "string" && sale.notes.includes(WEB_ORDER_MARKER);

export const webOrderPhone = sale => {
  if (!isWebOrder(sale)) return "";
  return sale.notes.match(/WhatsApp:\s*([^|]+)/i)?.[1]?.trim() || "";
};

export const webOrderNotes = phone => `${WEB_ORDER_MARKER} WhatsApp: ${phone.trim()}`;

/**
 * Notas completas de un pedido web: marca + teléfono, y después, separados por
 * " | ", la etiqueta del pedido (ej. mayorista) y el cupón usado. `webOrderPhone`
 * corta en el primer "|", así que agregar partes no rompe la lectura del teléfono.
 */
export const buildWebOrderNotes = ({ phone, orderLabel = "", couponNote = "" }) =>
  [webOrderNotes(phone), orderLabel, couponNote].filter(Boolean).join(" | ");
