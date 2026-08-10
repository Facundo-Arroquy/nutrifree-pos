/**
 * money — lectura de importes escritos en un campo de formulario.
 *
 * Los campos de monto de la app son `<input type="number">`: el navegador
 * entrega SIEMPRE el valor en formato canónico ("117705.39"), con el punto como
 * separador decimal y sin separador de miles. Si el usuario tipea algo que no
 * encaja en ese formato, el value llega vacío.
 *
 * Por eso acá el punto es SIEMPRE decimal. Tratarlo como separador de miles
 * (`"117705.39".replace(/\./g, "")`) multiplicaba el monto por 100 y dejaba la
 * diferencia como saldo a favor del proveedor o del cliente.
 *
 * Para importes que vienen de afuera (planillas de Excel en es-AR, donde
 * "1.234,50" sí es formato argentino) el parser correcto es `parsePrice()` de
 * utils/priceImport.js, que resuelve la ambigüedad mirando ambos separadores.
 */

/**
 * Convierte el value de un input de monto a número.
 * Tolera la coma decimal por si el campo se pasa a `type="text"`.
 *
 * @param {string|number|null|undefined} raw
 * @returns {number} el importe, o 0 si está vacío o no es un número válido
 */
export function parseMoneyInput(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
