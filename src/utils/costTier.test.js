import { describe, expect, it } from "vitest";
import { COST_TIERS, costTierLabel, normalizeCostTier } from "./costTier.js";

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
});
