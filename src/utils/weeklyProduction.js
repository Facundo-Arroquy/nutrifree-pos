/**
 * Producción semanal: de las unidades a producir de cada comida del menú
 * semanal (`days[día].qty`) a la cantidad necesaria de cada ingrediente.
 *
 * Cantidad de un ingrediente = cantidad de la receta × unidades ÷ rendimiento.
 * Sirve igual para recetas por porción (rinde 1) y por tanda (rinde 28).
 * Los platos sin receta utilizable no suman y se informan en `issues`.
 */
import { round3 } from "./money.js";
import { MEAL_COLUMNS, WEEK_DAYS, mealKey, normalizeQty } from "./weeklyMenu.js";

export const NO_CATEGORY = "Sin categoría";

const usableLines = recipe => (recipe?.ingredients || []).filter(line => Number(line.qty) > 0);

/** Si un producto tiene varias recetas, usa la más completa (más ingredientes con cantidad). */
export const pickRecipe = (recipes = [], productId) => recipes
  .filter(recipe => recipe.productId === productId)
  .reduce((best, recipe) => (!best || usableLines(recipe).length > usableLines(best).length ? recipe : best), null);

const findProducts = (products, name) => products.filter(product => mealKey(product.name) === mealKey(name));

/** Receta del plato `name`: la primera de los productos con ese nombre que tenga ingredientes utilizables. */
const recipeForDish = (products, recipes, name) => {
  const matches = findProducts(products, name);
  if (!matches.length) return { status: "no-product", recipe: null };
  const withRecipes = matches.map(product => pickRecipe(recipes, product.id)).filter(Boolean);
  const recipe = withRecipes.find(r => usableLines(r).length && Number(r.yield) > 0);
  return recipe ? { status: "ok", recipe } : { status: "no-recipe", recipe: withRecipes[0] || null };
};

const dishStatus = (status, recipe) => {
  if (status !== "ok") return status;
  const lines = recipe.ingredients || [];
  return usableLines(recipe).length < lines.length ? "incomplete" : "ok";
};

/**
 * Calcula la producción de la semana.
 * - `entries`: una por comida con plato cargado (día, comida, plato, unidades, estado).
 * - `rows`: un renglón por ingrediente con cantidad por día y total semanal.
 * - `groups`: los renglones agrupados por categoría del ingrediente.
 * - `issues`: platos que no suman por falta de receta, receta incompleta o unidades.
 * - `units`: unidades a producir por día y por comida.
 */
export const computeWeeklyProduction = ({ days, products = [], recipes = [], ingredients = [] }) => {
  const catalog = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
  const totals = new Map();
  const entries = [];
  const units = { perDay: {}, perMeal: Object.fromEntries(MEAL_COLUMNS.map(col => [col.key, 0])), total: 0 };

  WEEK_DAYS.forEach(({ key: day, label: dayLabel }) => {
    units.perDay[day] = 0;
    MEAL_COLUMNS.forEach(({ key: meal, label: mealLabel }) => {
      const name = String(days?.[day]?.[meal] || "").trim();
      if (!name) return;
      const qty = normalizeQty(days?.[day]?.qty?.[meal]);
      const { status: found, recipe } = recipeForDish(products, recipes, name);
      const status = qty === "" ? "no-qty" : dishStatus(found, recipe);
      entries.push({ day, dayLabel, meal, mealLabel, name, qty, status });
      if (qty === "") return;

      units.perDay[day] += qty;
      units.perMeal[meal] += qty;
      units.total += qty;
      if (found !== "ok") return;

      const scale = qty / Number(recipe.yield);
      usableLines(recipe).forEach(line => {
        const ingredient = catalog.get(line.ingredientId);
        const row = totals.get(line.ingredientId) || {
          ingredientId: line.ingredientId,
          name: ingredient?.name || line.name || "Ingrediente eliminado",
          unit: ingredient?.unit || line.unit || "",
          category: ingredient?.category || NO_CATEGORY,
          perDay: Object.fromEntries(WEEK_DAYS.map(d => [d.key, 0])),
          total: 0,
        };
        row.perDay[day] += Number(line.qty) * scale;
        row.total += Number(line.qty) * scale;
        totals.set(line.ingredientId, row);
      });
    });
  });

  const rows = [...totals.values()]
    .map(row => ({ ...row, total: round3(row.total), perDay: Object.fromEntries(Object.entries(row.perDay).map(([d, v]) => [d, round3(v)])) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const byCategory = new Map();
  rows.forEach(row => byCategory.set(row.category, [...(byCategory.get(row.category) || []), row]));
  const groups = [...byCategory]
    .map(([category, groupRows]) => ({ category, rows: groupRows }))
    .sort((a, b) => (a.category === NO_CATEGORY) - (b.category === NO_CATEGORY) || a.category.localeCompare(b.category, "es"));

  return { entries, rows, groups, issues: entries.filter(entry => entry.status !== "ok"), units };
};

/** Cantidad legible en es-AR: hasta 3 decimales sin ceros sobrantes ("12,5"). */
export const formatQuantity = value => Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
