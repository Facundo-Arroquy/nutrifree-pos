import { describe, expect, it } from "vitest";
import { emptyWeekDays } from "./weeklyMenu.js";
import { WEEKLY_COST_RULE, evaluateWeeklyCostRule, tiersByMealName } from "./weeklyMenuRules.js";

const products = [
  ...["B1", "B2", "B3", "B4"].map(name => ({ name, costTier: "bajo" })),
  ...["M1", "M2", "M3", "M4"].map(name => ({ name, costTier: "medio" })),
  ...["A1", "A2", "A3", "A4"].map(name => ({ name, costTier: "alto" })),
  { name: "Sin nivel", costTier: "" },
  { name: "Nivel inválido", costTier: "carísimo" },
];

// Arma una semana a partir de 10 nombres: [lunes almuerzo, lunes cena, martes almuerzo, ...]
const week = names => {
  const days = emptyWeekDays();
  Object.keys(days).forEach((day, i) => { days[day] = { lunch: names[i * 2] || "", dinner: names[i * 2 + 1] || "" }; });
  return days;
};

const valid = week(["B1", "M1", "B2", "A1", "M2", "B3", "A2", "M3", "B4", "A3"]); // 4 bajo, 3 medio, 3 alto

describe("tiersByMealName", () => {
  it("ignora acentos, mayúsculas y espacios", () => {
    const map = tiersByMealName([{ name: "Pechuga con Puré", costTier: "medio" }]);
    expect(map.get("pechuga con pure")).toBe("medio");
  });
  it("omite productos sin nivel válido", () => expect(tiersByMealName(products).has("sin nivel")).toBe(false));
  it("con nombres repetidos conserva el primero clasificado", () => {
    const map = tiersByMealName([{ name: "Goulash", costTier: "" }, { name: "Goulash", costTier: "alto" }, { name: "Goulash", costTier: "bajo" }]);
    expect(map.get("goulash")).toBe("alto");
  });
});

describe("evaluateWeeklyCostRule", () => {
  it("la regla es alcanzable con 10 menús", () => {
    const { bajo, medio, alto } = WEEKLY_COST_RULE;
    expect(bajo.min + medio.min + alto.min).toBeLessThanOrEqual(10);
    expect(bajo.max + medio.max + alto.max).toBeGreaterThanOrEqual(10);
  });

  it("aprueba una semana completa que cumple (4 bajo / 3 medio / 3 alto)", () => {
    const result = evaluateWeeklyCostRule(valid, products);
    expect(result).toMatchObject({ ok: true, complete: true, filled: 10, unclassified: 0, counts: { bajo: 4, medio: 3, alto: 3 } });
    expect(result.issues).toEqual([]);
  });

  it("aprueba también 3 bajo / 4 medio / 3 alto", () => {
    const days = week(["B1", "M1", "B2", "A1", "M2", "B3", "A2", "M3", "M4", "A3"]);
    expect(evaluateWeeklyCostRule(days, products).ok).toBe(true);
  });

  it("rechaza 4 platos de costo alto (tope 3)", () => {
    const days = week(["B1", "M1", "A4", "B2", "M2", "A1", "B3", "A2", "M3", "A3"]);
    const result = evaluateWeeklyCostRule(days, products);
    expect(result.ok).toBe(false);
    expect(result.tiers.find(t => t.tier === "alto")).toMatchObject({ count: 4, status: "error" });
    expect(result.issues.map(i => i.code)).toContain("alto-max");
  });

  it("rechaza una semana completa a la que le falta un nivel", () => {
    const days = week(["B1", "B2", "B3", "B4", "M1", "M2", "M3", "M4", "A1", "A2"]); // solo 2 alto
    const result = evaluateWeeklyCostRule(days, products);
    expect(result.ok).toBe(false);
    expect(result.issues.map(i => i.code)).toContain("alto-min");
  });

  it("rechaza almuerzo y cena de costo alto el mismo día", () => {
    const days = week(["A1", "A2", "B1", "M1", "B2", "M2", "A3", "B3", "M3", "B4"]);
    const result = evaluateWeeklyCostRule(days, products);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "alto-per-day", message: expect.stringContaining("Lunes") }));
  });

  it("una semana a medio armar no marca error por los mínimos pendientes", () => {
    const result = evaluateWeeklyCostRule(week(["B1", "M1", "A1"]), products);
    expect(result).toMatchObject({ complete: false, ok: false, filled: 3 });
    expect(result.issues).toEqual([]);
    expect(result.tiers.map(t => t.status)).toEqual(["pending", "pending", "pending"]);
  });

  it("avisa cuando los lugares libres ya no alcanzan para los mínimos", () => {
    // 5 bajo cargados + 0 medio + 0 alto; quedan 5 lugares pero hacen falta 3 + 3
    const days = week(["B1", "B2", "B3", "B4", "B1"]);
    const result = evaluateWeeklyCostRule(days, products);
    expect(result.issues.map(i => i.code)).toEqual(expect.arrayContaining(["bajo-max", "unreachable"]));
  });

  it("un plato sin nivel genera advertencia y no cuenta para ningún nivel", () => {
    const result = evaluateWeeklyCostRule(week(["Sin nivel"]), products);
    expect(result.unclassified).toBe(1);
    expect(result.counts).toEqual({ bajo: 0, medio: 0, alto: 0 });
    expect(result.issues).toEqual([expect.objectContaining({ level: "warning", code: "unclassified" })]);
  });

  it("los platos sin nivel ocupan lugar: con 3 ya no se alcanzan los mínimos", () => {
    const result = evaluateWeeklyCostRule(week(["Sin nivel", "Nivel inválido", "Plato inexistente"]), products);
    expect(result.unclassified).toBe(3);
    expect(result.issues.map(i => i.code)).toEqual(["unreachable", "unclassified"]);
  });

  it("una semana vacía o sin datos no rompe", () => {
    expect(evaluateWeeklyCostRule(emptyWeekDays(), products)).toMatchObject({ filled: 0, ok: false, issues: [] });
    expect(evaluateWeeklyCostRule(undefined, undefined)).toMatchObject({ filled: 0, ok: false });
  });

  it("acepta una regla personalizada", () => {
    const rule = { ...WEEKLY_COST_RULE, alto: { min: 3, max: 4 } };
    const days = week(["B1", "M1", "A4", "B2", "M2", "A1", "B3", "A2", "M3", "A3"]);
    // 3 bajo, 3 medio, 4 alto → válido con alto hasta 4 (y 1 alto por día)
    expect(evaluateWeeklyCostRule(days, products, rule).ok).toBe(true);
  });
});
