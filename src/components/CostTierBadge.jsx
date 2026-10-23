import { costTierLabel } from "../utils/costTier.js";

const BADGE_CLASS = { bajo: "badge-green", medio: "badge-amber", alto: "badge-red" };

/** Etiqueta de nivel de costo; no renderiza nada si el producto no está clasificado. */
export default function CostTierBadge({ tier, style }) {
  if (!BADGE_CLASS[tier]) return null;
  return <span className={`badge ${BADGE_CLASS[tier]}`} style={{ fontSize: ".7em", ...style }}>Costo {costTierLabel(tier).toLowerCase()}</span>;
}
