import { describe, it, expect } from "vitest";
import {
  itemsSubtotal,
  setItemPrice,
  setItemQty,
  discountAmountFor,
  discountFromFinalTotal,
  priceSummary,
  hasPriceChanges,
} from "./orderPricing.js";

const item = (over = {}) => ({
  productId: "p1", name: "Milanesa", qty: 2, price: 1000, subtotal: 2000,
  includeInTicket: true, ...over,
});

describe("itemsSubtotal", () => {
  it("suma los subtotales", () => {
    expect(itemsSubtotal([item(), item({ productId: "p2", subtotal: 500 })])).toBe(2500);
  });

  it("ignora los ítems que no van en el ticket", () => {
    expect(itemsSubtotal([item(), item({ productId: "p2", subtotal: 500, includeInTicket: false })]))
      .toBe(2000);
  });

  it("tolera lista vacía o sin subtotal", () => {
    expect(itemsSubtotal()).toBe(0);
    expect(itemsSubtotal([{ productId: "p1", qty: 1 }])).toBe(0);
  });
});

describe("setItemPrice", () => {
  it("recalcula el subtotal y marca el precio como editado", () => {
    const [i] = setItemPrice([item()], "p1", "1500");
    expect(i.price).toBe(1500);
    expect(i.subtotal).toBe(3000);
    expect(i.priceOverridden).toBe(true);
  });

  it("no toca los otros ítems", () => {
    const items = [item(), item({ productId: "p2", price: 700, subtotal: 700, qty: 1 })];
    const out = setItemPrice(items, "p1", 100);
    expect(out[1]).toEqual(items[1]);
  });

  it("un precio negativo o basura queda en 0", () => {
    expect(setItemPrice([item()], "p1", "-50")[0].price).toBe(0);
    expect(setItemPrice([item()], "p1", "abc")[0].subtotal).toBe(0);
  });

  it("acepta coma decimal", () => {
    expect(setItemPrice([item()], "p1", "1500,5")[0].price).toBe(1500.5);
  });
});

describe("setItemQty", () => {
  it("recalcula el subtotal", () => {
    const [i] = setItemQty([item()], "p1", "3");
    expect(i.qty).toBe(3);
    expect(i.subtotal).toBe(3000);
  });

  it("nunca baja de 1", () => {
    expect(setItemQty([item()], "p1", "0")[0].qty).toBe(1);
    expect(setItemQty([item()], "p1", "-4")[0].qty).toBe(1);
  });
});

describe("discountAmountFor", () => {
  it("calcula el porcentaje redondeado", () => {
    expect(discountAmountFor(10000, "pct", 15)).toBe(1500);
    expect(discountAmountFor(3333, "pct", 10)).toBe(333);
  });

  it("el descuento fijo no supera el subtotal", () => {
    expect(discountAmountFor(5000, "fixed", 8000)).toBe(5000);
    expect(discountAmountFor(5000, "fixed", 1200)).toBe(1200);
  });

  it("un porcentaje mayor a 100 no genera total negativo", () => {
    expect(discountAmountFor(5000, "pct", 150)).toBe(5000);
  });

  it("valores vacíos o negativos no descuentan", () => {
    expect(discountAmountFor(5000, "pct", "")).toBe(0);
    expect(discountAmountFor(5000, "fixed", -300)).toBe(0);
  });
});

describe("discountFromFinalTotal", () => {
  it("traduce el precio final a descuento fijo", () => {
    expect(discountFromFinalTotal(10000, 8500)).toEqual({
      discountType: "fixed", discountValue: 1500, discountAmount: 1500, total: 8500,
    });
  });

  it("un precio final mayor al subtotal se recorta al subtotal", () => {
    expect(discountFromFinalTotal(10000, 12000)).toEqual({
      discountType: "fixed", discountValue: 0, discountAmount: 0, total: 10000,
    });
  });

  it("un precio final vacío regala el pedido, no lo rompe", () => {
    expect(discountFromFinalTotal(10000, "")).toEqual({
      discountType: "fixed", discountValue: 10000, discountAmount: 10000, total: 0,
    });
  });
});

describe("priceSummary", () => {
  it("subtotal − descuento = total", () => {
    const draft = { items: [item()], discountType: "pct", discountValue: 10 };
    expect(priceSummary(draft)).toEqual({ subtotal: 2000, discountAmount: 200, total: 1800 });
  });

  it("sin descuento el total es el subtotal", () => {
    const draft = { items: [item()], discountType: "pct", discountValue: 0 };
    expect(priceSummary(draft).total).toBe(2000);
  });
});

describe("hasPriceChanges", () => {
  const sale = { total: 2000, discountAmount: 0, items: [item()] };

  it("detecta un cambio de precio unitario", () => {
    const draft = { items: setItemPrice(sale.items, "p1", 1500), discountType: "pct", discountValue: 0 };
    expect(hasPriceChanges(sale, draft)).toBe(true);
  });

  it("detecta un cambio de cantidad", () => {
    const draft = { items: setItemQty(sale.items, "p1", 5), discountType: "pct", discountValue: 0 };
    expect(hasPriceChanges(sale, draft)).toBe(true);
  });

  it("detecta un descuento nuevo", () => {
    const draft = { items: sale.items, discountType: "fixed", discountValue: 300 };
    expect(hasPriceChanges(sale, draft)).toBe(true);
  });

  it("un borrador idéntico no es un cambio", () => {
    const draft = { items: sale.items.map(i => ({ ...i })), discountType: "pct", discountValue: 0 };
    expect(hasPriceChanges(sale, draft)).toBe(false);
  });

  it("sin venta o sin borrador no hay cambios", () => {
    expect(hasPriceChanges(null, { items: [] })).toBe(false);
    expect(hasPriceChanges(sale, null)).toBe(false);
  });
});
