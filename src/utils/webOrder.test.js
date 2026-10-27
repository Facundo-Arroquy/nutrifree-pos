import { describe, expect, it } from "vitest";
import {
  WEB_ORDER_MARKER, cartRequiresPreparation, decreaseOrderQuantity, initialOrderQuantity, isPublishedMenuProduct,
  isWebOrder, minimumDeliveryDate, webOrderNotes, webOrderPhone,
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

  it("requiere elaboración cuando la cantidad pedida supera el stock", () => {
    expect(cartRequiresPreparation([{ productId: "available", qty: 4 }], products, stockOf)).toBe(true);
  });
});

describe("datos del pedido web", () => {
  it("identifica el origen y recupera el WhatsApp", () => {
    const sale = { notes: `${webOrderNotes("2281 555555")} | Pago MP aprobado` };
    expect(isWebOrder(sale)).toBe(true);
    expect(webOrderPhone(sale)).toBe("2281 555555");
  });
});

describe("cantidades mínimas del carrito", () => {
  it("agrega de a una unidad en minorista", () => {
    expect(initialOrderQuantity(0)).toBe(1);
    expect(initialOrderQuantity(1)).toBe(2);
  });

  it("inicia en cuatro unidades y elimina al bajar del mínimo mayorista", () => {
    expect(initialOrderQuantity(0, 4)).toBe(4);
    expect(initialOrderQuantity(4, 4)).toBe(5);
    expect(decreaseOrderQuantity(5, 4)).toBe(4);
    expect(decreaseOrderQuantity(4, 4)).toBe(0);
  });
});

describe("publicación en los menús", () => {
  it("solo publica productos activos con el tag de menú encendido", () => {
    expect(isPublishedMenuProduct({ active: true, showInMenu: true })).toBe(true);
    expect(isPublishedMenuProduct({ active: true, showInMenu: false })).toBe(false);
    expect(isPublishedMenuProduct({ active: false, showInMenu: true })).toBe(false);
  });
});

describe("marca de pedido web", () => {
  // create_web_order (supabase/migrations/20261028000000_create_web_order.sql) escribe las notas con
  // este prefijo literal. isWebOrder y el Calendario de Pedidos dependen de que coincida.
  it("la marca es la que escribe el servidor", () => {
    expect(WEB_ORDER_MARKER).toBe("[WEB]");
    expect(webOrderNotes("2281 588834")).toBe("[WEB] WhatsApp: 2281 588834");
  });
});
