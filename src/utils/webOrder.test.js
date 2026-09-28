import { describe, expect, it } from "vitest";
import {
  cartRequiresPreparation, isWebOrder, minimumDeliveryDate, webOrderNotes, webOrderPhone,
} from "./webOrder.js";

describe("minimumDeliveryDate", () => {
  it("mantiene mañana para un carrito con stock", () => {
    expect(minimumDeliveryDate(false, new Date(2026, 8, 28, 15))).toBe("2026-09-29");
  });

  it("exige 48 horas para un carrito con productos sin stock", () => {
    expect(minimumDeliveryDate(true, new Date(2026, 8, 28, 15))).toBe("2026-09-30");
  });

  it("salta el domingo después de aplicar la anticipación", () => {
    expect(minimumDeliveryDate(true, new Date(2026, 9, 2, 15))).toBe("2026-10-05");
  });
});

describe("cartRequiresPreparation", () => {
  const products = [{ id: "available", stock: 3 }, { id: "to-make", stock: 0 }];
  const stockOf = product => product.stock;

  it("no cambia el plazo si todos los productos tienen stock", () => {
    expect(cartRequiresPreparation([{ productId: "available" }], products, stockOf)).toBe(false);
  });

  it("aplica el plazo a todo el pedido si el carrito es mixto", () => {
    const items = [{ productId: "available" }, { productId: "to-make" }];
    expect(cartRequiresPreparation(items, products, stockOf)).toBe(true);
  });
});

describe("datos del pedido web", () => {
  it("identifica el origen y recupera el WhatsApp", () => {
    const sale = { notes: `${webOrderNotes("2281 555555")} | Pago MP aprobado` };
    expect(isWebOrder(sale)).toBe(true);
    expect(webOrderPhone(sale)).toBe("2281 555555");
  });
});
