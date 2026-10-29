import { NO_RECIPE_TIER, costTierLabel } from "../utils/costTier.js";

const BADGE_CLASS = { bajo: "badge-green", medio: "badge-amber", alto: "badge-red", [NO_RECIPE_TIER]: "badge-gray" };

/** Etiqueta de nivel de costo; no renderiza nada si el producto no está clasificado. */
export default function CostTierBadge({ tier, style }) {
  if (!BADGE_CLASS[tier]) return null;
  const label = tier === NO_RECIPE_TIER ? "Sin receta" : `Costo ${costTierLabel(tier).toLowerCase()}`;
  return <span className={`badge ${BADGE_CLASS[tier]}`} style={{ fontSize: ".7em", ...style }}>{label}</span>;
}
