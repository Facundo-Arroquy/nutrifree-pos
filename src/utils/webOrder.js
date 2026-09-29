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
    return product ? stockOf(product) <= 0 : false;
  });

export const isWebOrder = sale =>
  typeof sale?.notes === "string" && sale.notes.includes(WEB_ORDER_MARKER);

export const webOrderPhone = sale => {
  if (!isWebOrder(sale)) return "";
  return sale.notes.match(/WhatsApp:\s*([^|]+)/i)?.[1]?.trim() || "";
};

export const webOrderNotes = phone => `${WEB_ORDER_MARKER} WhatsApp: ${phone.trim()}`;
