/**
 * Nivel de costo de una vianda (bajo / medio / alto).
 *
 * Se guarda en `products.cost_tier` y lo usa la regla de costos del menú
 * semanal (`weeklyMenuRules.js`). Vacío = sin clasificar.
 */
export const COST_TIERS = [
  { value: "bajo", label: "Bajo" },
  { value: "medio", label: "Medio" },
  { value: "alto", label: "Alto" },
];

export const costTierLabel = tier => COST_TIERS.find(t => t.value === tier)?.label || "";

/** Devuelve el nivel si es válido; si no, "" (sin clasificar). */
export const normalizeCostTier = value => COST_TIERS.some(t => t.value === value) ? value : "";
