/**
 * Regla de costos del menú semanal.
 *
 * La semana tiene 10 menús (lunes a viernes, almuerzo y cena). Para cuidar el
 * margen, la mezcla de niveles de costo calculados desde las recetas debe respetar
 * `WEEKLY_COST_RULE`. Con 10 menús y un mínimo de 3 por nivel, el máximo
 * posible de un nivel es 4; por eso "alto" se topa en 3.
 */
import { COST_TIERS, normalizeCostTier } from "./costTier.js";
import { MENU_TYPES, WEEK_DAYS, mealKey } from "./weeklyMenu.js";

const MEALS = MENU_TYPES.classic.slots.map(slot => slot.key);

export const WEEKLY_COST_RULE = {
  bajo: { min: 3, max: 4 },
  medio: { min: 3, max: 4 },
  alto: { min: 3, max: 3 },
  maxAltoPerDay: 1,
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Mapa nombre normalizado → nivel de costo (solo productos clasificados). */
export const tiersByMealName = (products = []) => {
  const map = new Map();
  products.forEach(product => {
    const tier = normalizeCostTier(product.costTier);
    const key = mealKey(product.name);
    if (tier && key && !map.has(key)) map.set(key, tier);
  });
  return map;
};

const tierStatus = (count, { min, max }, complete) => {
  if (count > max) return "error";
  if (count >= min) return "ok";
  return complete ? "error" : "pending";
};

/**
 * Evalúa la semana contra la regla.
 * - `status` por nivel: ok | pending (aún se puede cumplir) | error.
 * - `ok` solo si la semana está completa y no hay errores.
 */
export const evaluateWeeklyCostRule = (days, products = [], rule = WEEKLY_COST_RULE) => {
  const tierOf = tiersByMealName(products);
  const slots = WEEK_DAYS.length * MEALS.length;
  const counts = Object.fromEntries(COST_TIERS.map(({ value }) => [value, 0]));
  const issues = [];
  let filled = 0;
  let unclassified = 0;

  WEEK_DAYS.forEach(({ key, label }) => {
    const dayTiers = MEALS.map(meal => {
      const name = days?.[key]?.[meal];
      if (!mealKey(name)) return "";
      filled += 1;
      const tier = tierOf.get(mealKey(name)) || "";
      if (tier) counts[tier] += 1; else unclassified += 1;
      return tier;
    });
    if (dayTiers.filter(tier => tier === "alto").length > rule.maxAltoPerDay) {
      issues.push({ level: "error", code: "alto-per-day", message: `${label}: máximo ${plural(rule.maxAltoPerDay, "plato", "platos")} de costo alto por día.` });
    }
  });

  const complete = filled === slots;
  const tiers = COST_TIERS.map(({ value, label }) => {
    const limits = rule[value];
    const count = counts[value];
    const status = tierStatus(count, limits, complete);
    if (count > limits.max) {
      issues.push({ level: "error", code: `${value}-max`, message: `Costo ${label.toLowerCase()}: ${count} platos, el máximo es ${limits.max}.` });
    } else if (status === "error") {
      issues.push({ level: "error", code: `${value}-min`, message: `Costo ${label.toLowerCase()}: ${count} platos, el mínimo es ${limits.min}.` });
    }
    return { tier: value, label, count, min: limits.min, max: limits.max, status };
  });

  if (!complete) {
    const needed = tiers.reduce((sum, t) => sum + Math.max(0, t.min - t.count), 0);
    if (needed > slots - filled) {
      issues.push({ level: "error", code: "unreachable", message: "Con los lugares libres ya no se alcanzan los mínimos por nivel." });
    }
  }
  if (unclassified) {
    issues.push({ level: "warning", code: "unclassified", message: `${plural(unclassified, "plato sin receta con costo", "platos sin receta con costo")}: no cuentan para la regla.` });
  }

  return {
    slots, filled, complete, counts, unclassified, tiers, issues,
    ok: complete && issues.every(issue => issue.level !== "error"),
  };
};
