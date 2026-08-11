/**
 * Tests de computePendingItems — Módulo de Producción Kanban
 *
 * La función consolida pedidos activos y calcula cuánto producir de cada
 * producto considerando el stock actual.
 */
import { describe, it, expect } from "vitest";
import { computePendingItems } from "./ProductionKanbanSection.jsx";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const p = (id, stock, opts = {}) => ({
  id,
  name: `Producto ${id}`,
  stock,
  kitItems: opts.kitItems || [],
  active: true,
});

const sale = (status, items) => ({ id: `sale-${Math.random()}`, status, items });

const item = (productId, qty, opts = {}) => ({
  productId, qty, name: `Producto ${productId}`,
  isKit: opts.isKit || false,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computePendingItems", () => {
  it("devuelve vacío si no hay pedidos activos", () => {
    const sales = [
      sale("closed",    [item("p1", 5)]),
      sale("cancelled", [item("p1", 2)]),
      sale("ready",     [item("p1", 3)]),
    ];
    const products = [p("p1", 0)];
    expect(computePendingItems(sales, products)).toHaveLength(0);
  });

  it("consolida múltiples pedidos del mismo producto", () => {
    // 4 + 4 + 2 = 10 solicitados, 3 en stock → 7 a producir
    const sales = [
      sale("open",      [item("brownie", 4)]),
      sale("open",      [item("brownie", 4)]),
      sale("preparing", [item("brownie", 2)]),
    ];
    const products = [p("brownie", 3)];
    const result = computePendingItems(sales, products);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      productId:    "brownie",
      qtyRequested: 10,
      stock:        3,
      qtyToProduce: 7,
    });
  });

  it("no incluye productos con stock suficiente", () => {
    const sales = [sale("open", [item("p1", 3)])];
    const products = [p("p1", 10)]; // stock 10 >= 3 solicitados
    const result = computePendingItems(sales, products);
    expect(result).toHaveLength(0);
  });

  it("incluye el producto cuando el stock cubre parcialmente", () => {
    const sales = [sale("open", [item("p1", 10)])];
    const products = [p("p1", 4)]; // stock 4 < 10
    const result = computePendingItems(sales, products);
    expect(result[0].qtyToProduce).toBe(6);
  });

  it("no incluye kits (isKit = true)", () => {
    const sales = [sale("open", [item("kit1", 5, { isKit: true })])];
    const products = [p("kit1", 0)];
    expect(computePendingItems(sales, products)).toHaveLength(0);
  });

  it("no incluye productos con kitItems (productos kit en la tabla)", () => {
    const sales = [sale("open", [item("kit2", 3)])];
    const products = [p("kit2", 0, { kitItems: [{ id: "comp1", qty: 2 }] })];
    expect(computePendingItems(sales, products)).toHaveLength(0);
  });

  it("solo considera pedidos open y preparing", () => {
    const sales = [
      sale("open",      [item("p1", 5)]),
      sale("preparing", [item("p1", 3)]),
      sale("ready",     [item("p1", 10)]),  // no cuenta
      sale("closed",    [item("p1", 10)]),  // no cuenta
    ];
    const products = [p("p1", 0)];
    const result = computePendingItems(sales, products);
    expect(result[0].qtyRequested).toBe(8); // solo open + preparing
    expect(result[0].qtyToProduce).toBe(8);
  });

  it("maneja múltiples productos a la vez", () => {
    const sales = [
      sale("open", [item("p1", 4), item("p2", 6)]),
      sale("open", [item("p1", 2)]),
    ];
    const products = [p("p1", 3), p("p2", 0)];
    const result = computePendingItems(sales, products);
    const r1 = result.find(r => r.productId === "p1");
    const r2 = result.find(r => r.productId === "p2");
    expect(r1).toMatchObject({ qtyRequested: 6, stock: 3, qtyToProduce: 3 });
    expect(r2).toMatchObject({ qtyRequested: 6, stock: 0, qtyToProduce: 6 });
  });

  it("ignora productos que no existen en el catálogo", () => {
    const sales = [sale("open", [item("inexistente", 5)])];
    const products = [p("p1", 0)]; // "inexistente" no está
    expect(computePendingItems(sales, products)).toHaveLength(0);
  });

  it("maneja pedidos sin items", () => {
    const sales = [sale("open", [])];
    const products = [p("p1", 0)];
    expect(computePendingItems(sales, products)).toHaveLength(0);
  });

  it("stock exactamente igual a lo solicitado → no produce nada", () => {
    const sales = [sale("open", [item("p1", 5)])];
    const products = [p("p1", 5)];
    expect(computePendingItems(sales, products)).toHaveLength(0);
  });
});
