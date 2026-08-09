/**
 * priceImport — Lógica pura para la actualización masiva de precios.
 *
 * Flujo:
 *  1. `buildPriceSheet(products)` genera la planilla con los productos ya cargados.
 *  2. El usuario edita SOLO las columnas de precio en Excel.
 *  3. `parsePriceSheet(matrix)` normaliza lo que vuelve del archivo.
 *  4. `auditPriceSheet(rows, products)` verifica que la planilla siga íntegra:
 *     filas borradas, ids repetidos y nombres que no coinciden con la base.
 *  5. `diffPriceRows(rows, products)` compara contra la base y devuelve únicamente
 *     los cambios de precio; cualquier otra columna que el usuario haya tocado se
 *     ignora, así una edición accidental de stock/categoría no puede pisar datos.
 *
 * Sin dependencias de React ni de Supabase: todo esto es testeable en aislamiento.
 */

/** Columnas de la planilla, en orden. Las editables son las de precio. */
export const PRICE_SHEET_HEADERS = [
  "id",
  "producto",
  "categoria",
  "precio_minorista",
  "precio_mayorista",
];

/** Columnas que el importador toma en cuenta al aplicar cambios. */
export const EDITABLE_COLUMNS = ["precio_minorista", "precio_mayorista"];

const normalizeHeader = h =>
  String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .trim();

/**
 * Convierte el texto de una celda de precio a número.
 * Tolera los formatos que produce Excel en es-AR: "$ 1.234,50", "1234.5", "1.234".
 * Devuelve null si la celda está vacía (= "no cambiar") o no es un número válido.
 */
export function parsePrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let s = String(value).trim();
  if (!s) return null;

  s = s.replace(/[^\d,.\-]/g, ""); // fuera "$", espacios, nbsp
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // El separador decimal es el que aparece último: "1.234,50" o "1,234.50"
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Una sola coma: decimal si deja 1-2 dígitos ("1234,5"), si no es de miles.
    const decimals = s.length - lastComma - 1;
    s = decimals > 0 && decimals <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    // Un solo punto: mismo criterio ("1234.5" decimal, "1.234" miles).
    const decimals = s.length - lastDot - 1;
    if (decimals === 3) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Arma la matriz (encabezado + filas) de la planilla a partir de los productos.
 * @param {Array} products productos en formato de la app (priceRetail/priceWholesale)
 * @param {{ onlyActive?: boolean }} [opts]
 */
export function buildPriceSheet(products, { onlyActive = false } = {}) {
  const list = (products || [])
    .filter(p => (onlyActive ? p.active !== false : true))
    .slice()
    .sort((a, b) =>
      String(a.category || "").localeCompare(String(b.category || ""), "es") ||
      String(a.name || "").localeCompare(String(b.name || ""), "es")
    );

  const rows = list.map(p => [
    p.id,
    p.name || "",
    p.category || "",
    Number(p.priceRetail) || 0,
    Number(p.priceWholesale) || 0,
  ]);

  return [PRICE_SHEET_HEADERS, ...rows];
}

/**
 * Normaliza la matriz que vuelve del archivo subido (primera fila = encabezado).
 * @returns {{ rows: Array<{id, name, retail: number|null, wholesale: number|null, line: number}>, missing: string[] }}
 */
export function parsePriceSheet(matrix) {
  if (!matrix || matrix.length < 2) return { rows: [], missing: [] };

  const headers = (matrix[0] || []).map(normalizeHeader);
  const missing = ["id", ...EDITABLE_COLUMNS].filter(h => !headers.includes(h));
  if (missing.length) return { rows: [], missing };

  const at = key => headers.indexOf(key);
  const idIdx = at("id");
  const nameIdx = at("producto");
  const retailIdx = at("precio_minorista");
  const wholesaleIdx = at("precio_mayorista");

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    const id = String(raw[idIdx] ?? "").trim();
    const name = nameIdx > -1 ? String(raw[nameIdx] ?? "").trim() : "";
    if (!id && !name) continue; // fila vacía

    rows.push({
      id,
      name,
      retail: parsePrice(raw[retailIdx]),
      wholesale: parsePrice(raw[wholesaleIdx]),
      line: i + 1, // número de fila tal como se ve en Excel
    });
  }

  return { rows, missing: [] };
}

/**
 * Revisa que la planilla siga siendo la que se descargó, antes de mirar precios.
 *
 * Excel no permite bloquear el borrado de filas dejando las celdas de precio
 * editables (haría falta escribir estilos por celda, que la librería no soporta),
 * así que el control se hace acá: si faltan productos o hay ids repetidos, se
 * avisa y la actualización queda frenada hasta que se confirme.
 *
 * El alcance se infiere de la propia planilla: si no trae ningún producto
 * inactivo, se asume que se descargó con "solo activos" y los inactivos que
 * falten no cuentan como filas borradas.
 *
 * @returns {{ missing: Array<{id,name}>, duplicates: Array<{id,name,lines:number[]}>,
 *             renamed: Array<{id,sheetName,dbName,line}>, expected: number }}
 */
export function auditPriceSheet(rows, products) {
  const all = products || [];
  const inSheet = new Set(rows.map(r => r.id).filter(Boolean));

  const includesInactive = all.some(p => p.active === false && inSheet.has(p.id));
  const expected = all.filter(p => p.active !== false || includesInactive);
  const missing = expected
    .filter(p => !inSheet.has(p.id))
    .map(p => ({ id: p.id, name: p.name || "" }));

  const seen = new Map();
  for (const row of rows) {
    if (!row.id) continue;
    if (!seen.has(row.id)) seen.set(row.id, []);
    seen.get(row.id).push(row.line);
  }
  const byId = new Map(all.map(p => [p.id, p]));
  const duplicates = [...seen.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([id, lines]) => ({ id, name: byId.get(id)?.name || "", lines }));

  // Nombre distinto al de la base: suele ser una columna de precios pegada
  // corrida, que asignaría precios al producto equivocado sin avisar.
  const renamed = [];
  for (const row of rows) {
    if (!row.name) continue;
    const product = byId.get(row.id);
    if (product && product.name && product.name !== row.name) {
      renamed.push({ id: row.id, sheetName: row.name, dbName: product.name, line: row.line });
    }
  }

  return { missing, duplicates, renamed, expected: expected.length };
}

const round2 = n => Math.round(n * 100) / 100;

/**
 * Compara las filas de la planilla contra los productos en memoria.
 * Solo produce cambios de precio: nunca toca stock, categoría, activo, etc.
 *
 * @returns {{ changes: Array, unchanged: number, errors: string[] }}
 *   changes: [{ id, name, retail?: {from,to}, wholesale?: {from,to} }]
 */
export function diffPriceRows(rows, products) {
  const byId = new Map((products || []).map(p => [p.id, p]));
  const changes = [];
  const errors = [];
  let unchanged = 0;

  for (const row of rows) {
    const product = byId.get(row.id);
    if (!product) {
      errors.push(
        `Fila ${row.line}: no existe el producto${row.name ? ` "${row.name}"` : ""} (id "${row.id}"). ` +
        `No modifiques la columna id ni agregues filas nuevas.`
      );
      continue;
    }

    const change = { id: product.id, name: product.name };
    let touched = false;
    let invalid = false;

    for (const [field, dbField, value] of [
      ["retail", "priceRetail", row.retail],
      ["wholesale", "priceWholesale", row.wholesale],
    ]) {
      if (value === null) continue; // celda vacía = no cambiar
      if (value < 0) {
        errors.push(`Fila ${row.line} ("${product.name}"): el precio no puede ser negativo.`);
        invalid = true;
        break;
      }
      const current = round2(Number(product[dbField]) || 0);
      const next = round2(value);
      if (current !== next) {
        change[field] = { from: current, to: next };
        touched = true;
      }
    }

    if (invalid) continue; // la fila entera se descarta, no se aplica nada
    if (touched) changes.push(change);
    else unchanged++;
  }

  return { changes, unchanged, errors };
}

/** Campos de Supabase a actualizar para un cambio dado. */
export function changeToDbPatch(change) {
  const patch = {};
  if (change.retail) patch.price_retail = change.retail.to;
  if (change.wholesale) patch.price_wholesale = change.wholesale.to;
  return patch;
}

/** Aplica un cambio sobre el producto en memoria (para el estado de React). */
export function applyChangeToProduct(product, change) {
  return {
    ...product,
    priceRetail: change.retail ? change.retail.to : product.priceRetail,
    priceWholesale: change.wholesale ? change.wholesale.to : product.priceWholesale,
  };
}
