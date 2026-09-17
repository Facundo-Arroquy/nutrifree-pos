import { describe, it, expect } from "vitest";
import { lineUnitCost, updateIngredientQty, sanitizeIngredients } from "./recipeIngredients.js";

const ingredients = [
  { id: "h", name: "Horas de trabajo", unit: "unidades", unitCost: 10000 },
  { id: "p", name: "Premezcla", unit: "kg", unitCost: 4625 },
];

const lines = [
  { ingredientId: "p", name: "Premezcla", qty: 0.2, unit: "kg", cost: 925 },
  { ingredientId: "h", name: "Horas de trabajo", qty: 0.5, unit: "unidades", cost: 5000 },
];

describe("lineUnitCost", () => {
  it("toma el costo unitario del catálogo", () => {
    expect(lineUnitCost(lines[1], ingredients)).toBe(10000);
  });
  it("lo deriva de la línea si el ingrediente no está en el catálogo", () => {
    expect(lineUnitCost({ ingredientId: "x", qty: 2, cost: 800 }, ingredients)).toBe(400);
  });
  it("devuelve 0 si no hay catálogo ni cantidad", () => {
    expect(lineUnitCost({ ingredientId: "x", qty: 0, cost: 800 }, ingredients)).toBe(0);
  });
});

describe("updateIngredientQty", () => {
  it("acepta un cuarto de hora (0.25) sin redondear", () => {
    const out = updateIngredientQty(lines, 1, "0.25", ingredients);
    expect(out[1].qty).toBe(0.25);
    expect(out[1].cost).toBe(2500);
  });

  it("acepta decimales chicos", () => {
    const out = updateIngredientQty(lines, 0, "0.05", ingredients);
    expect(out[0].qty).toBe(0.05);
    expect(out[0].cost).toBeCloseTo(231.25, 5);
  });

  it("permite el input vacío mientras se tipea", () => {
    const out = updateIngredientQty(lines, 1, "", ingredients);
    expect(out[1].qty).toBe("");
    expect(out[1].cost).toBe(0);
  });

  it("no muta ni toca las demás líneas", () => {
    const out = updateIngredientQty(lines, 1, "0.25", ingredients);
    expect(out).not.toBe(lines);
    expect(out[0]).toBe(lines[0]);
    expect(lines[1].qty).toBe(0.5);
  });
});

describe("sanitizeIngredients", () => {
  it("conserva decimales y descarta líneas vacías o en cero", () => {
    const out = sanitizeIngredients([
      { ingredientId: "h", qty: "0.25", cost: 2500 },
      { ingredientId: "p", qty: "", cost: 0 },
      { ingredientId: "p", qty: 0, cost: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(0.25);
  });

  it("tolera una lista vacía", () => {
    expect(sanitizeIngredients()).toEqual([]);
  });
});
