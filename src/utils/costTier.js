/**
 * Nivel de costo automático de una vianda según su receta actual.
 */
export const COST_TIERS = [
  { value: "bajo", label: "Bajo" },
  { value: "medio", label: "Medio" },
  { value: "alto", label: "Alto" },
];

export const NO_RECIPE_TIER = "sin-receta";
export const COST_TIER_LIMITS = { lowMax: 3300, mediumMax: 4400 };

export const costTierLabel = tier => COST_TIERS.find(t => t.value === tier)?.label || "";

/** Devuelve el nivel si es válido; si no, "" (sin clasificar). */
export const normalizeCostTier = value => COST_TIERS.some(t => t.value === value) ? value : "";

const recipeLineCost = (line, ingredients = []) => {
  const ingredient = line?.ingredientId
    ? ingredients.find(item => item.id === line.ingredientId)
    : ingredients.find(item => item.name?.localeCompare(line?.name || "", "es", { sensitivity:"base" }) === 0);
  return ingredient
    ? (Number(line?.qty) || 0) * (Number(ingredient.unitCost) || 0)
    : Number(line?.cost) || 0;
};

/** Costo por porción. Devuelve 0 cuando no hay una receta utilizable. */
export const productRecipeCost = (product, recipes = [], ingredients = []) => {
  const recipe = recipes.find(item => item.productId === product?.id);
  const recipeYield = Number(recipe?.yield) || 0;
  if (!recipe || recipeYield <= 0 || !recipe.ingredients?.length) return 0;
  const total = recipe.ingredients.reduce((sum, line) => sum + recipeLineCost(line, ingredients), 0);
  return total > 0 ? total / recipeYield : 0;
};

/** Nivel derivado del costo actual; nunca depende de products.cost_tier. */
export const automaticCostTier = (product, recipes = [], ingredients = []) => {
  const cost = productRecipeCost(product, recipes, ingredients);
  if (cost <= 0) return NO_RECIPE_TIER;
  if (cost < COST_TIER_LIMITS.lowMax) return "bajo";
  if (cost <= COST_TIER_LIMITS.mediumMax) return "medio";
  return "alto";
};

export const withAutomaticCostTiers = (products = [], recipes = [], ingredients = []) =>
  products.map(product => ({ ...product, costTier: automaticCostTier(product, recipes, ingredients) }));
