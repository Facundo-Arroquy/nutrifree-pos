import { describe, it, expect, vi } from "vitest";
import {
  normalizeCouponCode,
  validateCouponInput,
  couponSaleFields,
  couponNote,
  lookupCoupon,
} from "./coupons.js";
import { buildWebOrderNotes, webOrderPhone } from "./webOrder.js";

describe("normalizeCouponCode", () => {
  it("saca espacios y pasa a mayúsculas", () => {
    expect(normalizeCouponCode("  bienvenida 10 ")).toBe("BIENVENIDA10");
  });

  it("tolera null y undefined", () => {
    expect(normalizeCouponCode(null)).toBe("");
    expect(normalizeCouponCode(undefined)).toBe("");
  });
});

describe("validateCouponInput", () => {
  it("normaliza el código y acepta un descuento válido", () => {
    expect(validateCouponInput({ code: " invierno-15 ", discountPct: "15" }))
      .toEqual({ ok: true, code: "INVIERNO-15", discountPct: 15 });
  });

  it("acepta hasta 2 decimales y coma decimal", () => {
    expect(validateCouponInput({ code: "AMIGOS", discountPct: "7,5" }))
      .toMatchObject({ ok: true, discountPct: 7.5 });
  });

  it("rechaza códigos muy cortos, largos o con símbolos", () => {
    for (const code of ["", "AB", "A".repeat(21), "CUPÓN!", "a b$"]) {
      expect(validateCouponInput({ code, discountPct: 10 }).ok).toBe(false);
    }
  });

  it("rechaza descuentos fuera de (0, 100]", () => {
    for (const discountPct of ["", "0", "-5", "100.5", "abc"]) {
      expect(validateCouponInput({ code: "PROMO", discountPct }).ok).toBe(false);
    }
    expect(validateCouponInput({ code: "PROMO", discountPct: 100 }).ok).toBe(true);
  });

  it("rechaza un código repetido sin distinguir mayúsculas", () => {
    const result = validateCouponInput({ code: "promo10", discountPct: 10 }, ["PROMO10"]);
    expect(result).toEqual({ ok: false, error: "Ya existe un cupón con ese código." });
  });
});

describe("couponSaleFields", () => {
  it("sin cupón no descuenta nada", () => {
    expect(couponSaleFields(10000, null)).toEqual({
      discountType: "pct", discountValue: 0, discountAmount: 0, total: 10000,
    });
  });

  it("aplica el porcentaje al subtotal", () => {
    expect(couponSaleFields(10000, { code: "PROMO10", discountPct: 10 })).toEqual({
      discountType: "pct", discountValue: 10, discountAmount: 1000, total: 9000,
    });
  });

  it("redondea el descuento a peso entero", () => {
    // 3333 * 15% = 499.95 → 500
    const fields = couponSaleFields(3333, { code: "X15", discountPct: 15 });
    expect(fields.discountAmount).toBe(500);
    expect(fields.total).toBe(2833);
  });

  it("100% deja el total en 0 y nunca negativo", () => {
    const fields = couponSaleFields(5000, { code: "GRATIS", discountPct: 100 });
    expect(fields.total).toBe(0);
  });

  it("un subtotal inválido se toma como 0", () => {
    expect(couponSaleFields(undefined, { code: "PROMO", discountPct: 10 }).total).toBe(0);
  });
});

describe("couponNote", () => {
  it("describe el cupón para las notas del pedido", () => {
    expect(couponNote({ code: "PROMO10", discountPct: 10 })).toBe("Cupón PROMO10 (-10%)");
  });

  it("es vacío sin cupón", () => {
    expect(couponNote(null)).toBe("");
  });
});

describe("lookupCoupon", () => {
  const clientWith = result => ({ rpc: vi.fn().mockResolvedValue(result) });

  it("devuelve el cupón con el descuento como número", async () => {
    const client = clientWith({ data: [{ code: "PROMO10", discount_pct: "10.00" }], error: null });
    const result = await lookupCoupon(client, " promo10 ");
    expect(client.rpc).toHaveBeenCalledWith("validate_coupon", { p_code: "PROMO10" });
    expect(result).toEqual({ coupon: { code: "PROMO10", discountPct: 10 } });
  });

  it("informa cuando el cupón no existe", async () => {
    const result = await lookupCoupon(clientWith({ data: [], error: null }), "NOPE");
    expect(result).toEqual({ error: "El cupón no existe." });
  });

  it("no consulta la base con un código vacío", async () => {
    const client = clientWith({ data: [], error: null });
    const result = await lookupCoupon(client, "   ");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it("distingue un error de red de un cupón inexistente", async () => {
    const result = await lookupCoupon(clientWith({ data: null, error: { message: "boom" } }), "PROMO10");
    expect(result.error).toMatch(/No pudimos validar/);
  });
});

describe("buildWebOrderNotes", () => {
  it("mantiene el formato histórico sin etiqueta ni cupón", () => {
    expect(buildWebOrderNotes({ phone: " 2281 588834 " })).toBe("[WEB] WhatsApp: 2281 588834");
  });

  it("agrega etiqueta y cupón separados por barra", () => {
    const notes = buildWebOrderNotes({
      phone: "2281 588834", orderLabel: "Pedido mayorista", couponNote: "Cupón PROMO10 (-10%)",
    });
    expect(notes).toBe("[WEB] WhatsApp: 2281 588834 | Pedido mayorista | Cupón PROMO10 (-10%)");
  });

  it("el teléfono se sigue leyendo aunque haya cupón", () => {
    const notes = buildWebOrderNotes({ phone: "2281 588834", couponNote: "Cupón PROMO10 (-10%)" });
    expect(webOrderPhone({ notes })).toBe("2281 588834");
  });
});
