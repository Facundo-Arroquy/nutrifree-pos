/**
 * Utilidades puras para las líneas de ingredientes de una receta.
 *
 * Las cantidades admiten decimales (ej. 0.25 h de trabajo, 0.05 l de aceite),
 * por eso `qty` se guarda como número y nunca se redondea a enteros.
 */

/** Costo unitario efectivo de una línea (usa el catálogo; si no está, lo deriva). */
export const lineUnitCost = (line, ingredients = []) => {
  const ing = ingredients.find(x => x.id === line.ingredientId);
  if (ing) return Number(ing.unitCost) || 0;
  const qty = Number(line.qty);
  return qty ? (Number(line.cost) || 0) / qty : 0;
};

/**
 * Devuelve una nueva lista con la cantidad de la línea `idx` actualizada
 * y su costo recalculado. Acepta "" mientras el usuario tipea.
 */
export const updateIngredientQty = (lines, idx, raw, ingredients = []) =>
  lines.map((line, i) => {
    if (i !== idx) return line;
    const qty = raw === "" ? "" : Number(raw);
    return { ...line, qty, cost: (Number(qty) || 0) * lineUnitCost(line, ingredients) };
  });

/** Normaliza cantidades a número y descarta líneas vacías o no positivas. */
export const sanitizeIngredients = (lines = []) =>
  lines
    .map(line => ({ ...line, qty: Number(line.qty) || 0 }))
    .filter(line => line.qty > 0);
