import { describe, expect, it } from "vitest";
import { COST_TIERS, NO_RECIPE_TIER, automaticCostTier, costTierLabel, normalizeCostTier, productRecipeCost, withAutomaticCostTiers } from "./costTier.js";

describe("costTier", () => {
  it("define los tres niveles en orden", () => expect(COST_TIERS.map(t => t.value)).toEqual(["bajo", "medio", "alto"]));
  it("acepta solo niveles válidos", () => {
    expect(normalizeCostTier("alto")).toBe("alto");
    expect(normalizeCostTier("ALTO")).toBe("");
    expect(normalizeCostTier("")).toBe("");
    expect(normalizeCostTier(null)).toBe("");
    expect(normalizeCostTier(undefined)).toBe("");
  });
  it("devuelve la etiqueta o vacío", () => {
    expect(costTierLabel("medio")).toBe("Medio");
    expect(costTierLabel("x")).toBe("");
  });

  it("calcula el costo por porción con los costos actuales de ingredientes", () => {
    const product = { id:"p1" };
    const recipes = [{ productId:"p1", yield:2, ingredients:[{ ingredientId:"i1", qty:3 }] }];
    expect(productRecipeCost(product, recipes, [{ id:"i1", unitCost:1000 }])).toBe(1500);
    expect(productRecipeCost(product, recipes, [{ id:"i1", unitCost:2000 }])).toBe(3000);
  });

  it("cambia el tag automáticamente cuando cambia el costo", () => {
    const product = { id:"p1", costTier:"alto" };
    const recipes = [{ productId:"p1", yield:1, ingredients:[{ ingredientId:"i1", qty:1 }] }];
    expect(automaticCostTier(product, recipes, [{ id:"i1", unitCost:3299 }])).toBe("bajo");
    expect(automaticCostTier(product, recipes, [{ id:"i1", unitCost:3300 }])).toBe("medio");
    expect(automaticCostTier(product, recipes, [{ id:"i1", unitCost:4400 }])).toBe("medio");
    expect(automaticCostTier(product, recipes, [{ id:"i1", unitCost:4401 }])).toBe("alto");
  });

  it("marca sin receta cuando falta o el costo es cero", () => {
    expect(automaticCostTier({ id:"p1" }, [], [])).toBe(NO_RECIPE_TIER);
    expect(automaticCostTier({ id:"p1" }, [{ productId:"p1", yield:1, ingredients:[{ qty:2, cost:0 }] }], [])).toBe(NO_RECIPE_TIER);
  });

  it("decora productos sin mutarlos ni respetar el nivel manual anterior", () => {
    const original = [{ id:"p1", costTier:"alto" }, { id:"p2", costTier:"bajo" }];
    const result = withAutomaticCostTiers(original, [{ productId:"p1", yield:1, ingredients:[{ cost:3500 }] }], []);
    expect(result.map(item => item.costTier)).toEqual(["medio", NO_RECIPE_TIER]);
    expect(original.map(item => item.costTier)).toEqual(["alto", "bajo"]);
  });
});
