import emailjs from "@emailjs/browser";

const SERVICE_ID           = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID          = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const INVOICE_TEMPLATE_ID  = import.meta.env.VITE_EMAILJS_INVOICE_TEMPLATE_ID;
const WEEKLY_MENU_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_WEEKLY_MENU_TEMPLATE_ID || INVOICE_TEMPLATE_ID;
const PUBLIC_KEY           = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

/**
 * Envía alerta de pedido con factura pendiente.
 * @param {{ customerName: string, total: number, items: Array, paymentMethod: string, notes?: string }} sale
 */
export async function sendBillingAlert(sale) {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn("[emailAlerts] Variables de EmailJS no configuradas — no se envió el mail.");
    return;
  }

  const itemsList = sale.items
    .map(i => `• ${i.name} × ${i.qty}  $${i.subtotal}`)
    .join("\n");

  const params = {
    to_email:       "facundoarroquy.w@gmail.com,garroquy@hotmail.com",
    customer_name:  sale.customerName || "Anónimo",
    total:          `$${sale.total}`,
    payment_method: sale.paymentMethod || "-",
    items:          itemsList,
    notes:          sale.notes || "-",
    date:           new Date().toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"}),
  };

  await emailjs.send(SERVICE_ID, TEMPLATE_ID, params, PUBLIC_KEY);
}

/**
 * Envía factura(s) al cliente con links de descarga.
 * @param {{ name: string, email: string }} customer
 * @param {{ name: string, url: string }[]} files
 */
export async function sendInvoiceEmail(customer, files) {
  if (!SERVICE_ID || !INVOICE_TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn("[emailAlerts] VITE_EMAILJS_INVOICE_TEMPLATE_ID no configurado.");
    return;
  }

  const fileLinks = files
    .map(f => `• ${f.name}\n  ${f.url}`)
    .join("\n\n");

  const params = {
    to_email:      customer.email,
    customer_name: customer.name,
    file_links:    fileLinks,
    file_count:    String(files.length),
    date:          new Date().toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"}),
  };

  await emailjs.send(SERVICE_ID, INVOICE_TEMPLATE_ID, params, PUBLIC_KEY);
}

/**
 * Parámetros del mail del menú semanal. `images` es una lista de
 * `{ label, url }` (menú semanal y, si corresponde, menú keto); por
 * compatibilidad también acepta una sola URL.
 */
export const weeklyMenuEmailParams = (email, week, images) => {
  const list = Array.isArray(images) ? images : [{ label: "Menú semanal", url: images }];
  return {
    to_email: email,
    customer_name: "Nutrifree",
    subject: `Menú semanal ${week}`,
    file_links: list.map(({ label, url }) => `• ${label} ${week}\n  ${url}`).join("\n"),
    file_count: String(list.length),
    date: new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }),
  };
};

export async function sendWeeklyMenuEmail(email, week, images) {
  if (!SERVICE_ID || !WEEKLY_MENU_TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("EmailJS no está configurado para enviar el menú");
  }
  await emailjs.send(SERVICE_ID, WEEKLY_MENU_TEMPLATE_ID, weeklyMenuEmailParams(email, week, images), PUBLIC_KEY);
}
