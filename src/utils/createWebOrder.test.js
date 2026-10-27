import { describe, it, expect, vi } from "vitest";
import { buildWebOrderRequest, submitWebOrder, webOrderError } from "./createWebOrder.js";
import { isWebOrder, webOrderPhone } from "./webOrder.js";

const cartItems = [
  { productId: "p1", name: "Chipá x 3", qty: 2, price: 8800, subtotal: 17600, category: "Panadería", isKit: false },
  { productId: "p2", name: "Alfajor", qty: 4, price: 1000, subtotal: 4000 },
];

describe("buildWebOrderRequest", () => {
  it("manda solo producto y cantidad: el precio lo calcula el servidor", () => {
    const request = buildWebOrderRequest({
      cartItems, priceList: "retail", name: "  Ana Pérez ", phone: " 2281 588834 ", date: "2026-11-03", couponCode: null,
    });
    expect(request).toEqual({
      p_customer_name: "Ana Pérez",
      p_phone: "2281 588834",
      p_delivery_date: "2026-11-03",
      p_price_list: "retail",
      p_items: [{ productId: "p1", qty: 2 }, { productId: "p2", qty: 4 }],
      p_coupon_code: null,
    });
    // Cada ítem lleva solo productId y qty: ningún precio ni subtotal que el cliente pueda alterar.
    for (const item of request.p_items) expect(Object.keys(item).sort()).toEqual(["productId", "qty"]);
  });

  it("normaliza el código del cupón", () => {
    const request = buildWebOrderRequest({
      cartItems, priceList: "wholesale", name: "A", phone: "2281588834", date: "2026-11-03", couponCode: " promo 10 ",
    });
    expect(request.p_coupon_code).toBe("PROMO10");
    expect(request.p_price_list).toBe("wholesale");
  });

  it("sin cupón manda null", () => {
    const request = buildWebOrderRequest({ cartItems, priceList: "retail", name: "A", phone: "2281588834", date: "2026-11-03" });
    expect(request.p_coupon_code).toBeNull();
  });
});

describe("webOrderError", () => {
  it("traduce los motivos que conoce", () => {
    expect(webOrderError("web_order:min_qty")).toEqual({
      reason: "min_qty", message: "El pedido mayorista requiere al menos 4 unidades por producto.",
    });
    expect(webOrderError("web_order:coupon_not_found").reason).toBe("coupon_not_found");
    expect(webOrderError(" web_order:invalid_item ").message).toMatch(/ya no está disponible/);
  });

  it("usa un mensaje genérico para errores que no son de la función", () => {
    for (const raw of ["permission denied for table sales", "TypeError: Failed to fetch", "", null, undefined]) {
      const { reason, message } = webOrderError(raw);
      expect(reason).toBeNull();
      expect(message).toMatch(/No pudimos registrar el pedido/);
    }
  });

  it("un motivo de la función que el front no conoce también da el genérico", () => {
    expect(webOrderError("web_order:otra_cosa")).toEqual({
      reason: "otra_cosa", message: "No pudimos registrar el pedido. Por favor intentá de nuevo.",
    });
  });
});

describe("submitWebOrder", () => {
  const request = buildWebOrderRequest({
    cartItems, priceList: "retail", name: "Ana", phone: "2281588834", date: "2026-11-03", couponCode: "PROMO10",
  });
  const clientWith = result => ({ rpc: vi.fn().mockResolvedValue(result) });

  it("llama a create_web_order y devuelve los importes del servidor", async () => {
    const client = clientWith({
      data: { saleId: "abc-123", subtotal: "21600", discountAmount: "2160", total: "19440", couponCode: "PROMO10", discountPct: 10 },
      error: null,
    });
    const result = await submitWebOrder(client, request);
    expect(client.rpc).toHaveBeenCalledWith("create_web_order", request);
    expect(result).toEqual({
      order: { saleId: "abc-123", subtotal: 21600, discountAmount: 2160, total: 19440, couponCode: "PROMO10" },
    });
  });

  it("sin cupón devuelve couponCode null", async () => {
    const client = clientWith({ data: { saleId: "x", subtotal: 100, discountAmount: 0, total: 100, couponCode: null }, error: null });
    const result = await submitWebOrder(client, request);
    expect(result.order.couponCode).toBeNull();
  });

  it("traduce un error de la función y conserva el motivo", async () => {
    const result = await submitWebOrder(clientWith({ data: null, error: { message: "web_order:coupon_not_found" } }), request);
    expect(result).toEqual({ error: "El cupón ya no es válido. Quitalo o probá con otro.", reason: "coupon_not_found" });
  });

  it("un error de la base que no es de la función da el mensaje genérico", async () => {
    const result = await submitWebOrder(clientWith({ data: null, error: { message: "boom" } }), request);
    expect(result.reason).toBeNull();
    expect(result.error).toMatch(/No pudimos registrar el pedido/);
  });

  it("una respuesta sin saleId se trata como error", async () => {
    const result = await submitWebOrder(clientWith({ data: null, error: null }), request);
    expect(result.error).toMatch(/No pudimos registrar el pedido/);
  });

  it("si la red falla (excepción) no revienta el checkout", async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error("network")) };
    const result = await submitWebOrder(client, request);
    expect(result).toEqual({ error: "No pudimos registrar el pedido. Por favor intentá de nuevo.", reason: null });
  });
});

describe("notas que genera create_web_order", () => {
  // Formato exacto que arma la función SQL (supabase/migrations/20261028000000_create_web_order.sql).
  // El Calendario de Pedidos lo lee con isWebOrder / webOrderPhone: si el SQL cambia, esto avisa.
  const sqlNotes = {
    retail: "[WEB] WhatsApp: 2281 000000",
    wholesale: "[WEB] WhatsApp: +54 9 2281 000000 | Pedido mayorista",
    coupon: "[WEB] WhatsApp: 2281 000000 | Cupón CHKCUPON (-15%)",
    both: "[WEB] WhatsApp: 2281000000 | Pedido mayorista | Cupón CHKMEDIO (-7.5%)",
  };

  it("se reconocen como pedidos web", () => {
    for (const notes of Object.values(sqlNotes)) expect(isWebOrder({ notes })).toBe(true);
  });

  it("el teléfono se lee sin arrastrar la etiqueta ni el cupón", () => {
    expect(webOrderPhone({ notes: sqlNotes.retail })).toBe("2281 000000");
    expect(webOrderPhone({ notes: sqlNotes.wholesale })).toBe("+54 9 2281 000000");
    expect(webOrderPhone({ notes: sqlNotes.coupon })).toBe("2281 000000");
    expect(webOrderPhone({ notes: sqlNotes.both })).toBe("2281000000");
  });
});
