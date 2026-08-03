/**
 * Tests de la actualización masiva de precios.
 *
 * Lo importante que cubren:
 *  1. La planilla sale con los productos ya cargados (no con ejemplos vacíos).
 *  2. Solo se aplican cambios de precio: tocar otras columnas no pisa nada.
 *  3. Celda de precio vacía = "no cambiar", no = "poner en 0".
 *  4. Formatos de Excel en es-AR ("$ 1.234,50") se interpretan bien.
 */
import { describe, it, expect } from "vitest";
import {
  PRICE_SHEET_HEADERS,
  parsePrice,
  buildPriceSheet,
  parsePriceSheet,
  diffPriceRows,
  changeToDbPatch,
  applyChangeToProduct,
} from "./priceImport.js";

const PRODUCTS = [
  { id: "p1", name: "Brownie", category: "Panadería", priceRetail: 600, priceWholesale: 500, stock: 20, active: true },
  { id: "p2", name: "Pan de molde", category: "Panadería", priceRetail: 900, priceWholesale: 750, stock: 15, active: true },
  { id: "p3", name: "Alfajor viejo", category: "Dulces", priceRetail: 400, priceWholesale: 300, stock: 0, active: false },
];

describe("parsePrice", () => {
  it("lee números tal cual vienen de Excel", () => {
    expect(parsePrice(1234.5)).toBe(1234.5);
    expect(parsePrice(0)).toBe(0);
  });

  it("interpreta el formato es-AR con separador de miles y decimal", () => {
    expect(parsePrice("$ 1.234,50")).toBe(1234.5);
    expect(parsePrice("1.234")).toBe(1234);
    expect(parsePrice("1234,5")).toBe(1234.5);
  });

  it("interpreta el formato en-US", () => {
    expect(parsePrice("1,234.50")).toBe(1234.5);
    expect(parsePrice("1234.5")).toBe(1234.5);
  });

  it("devuelve null para celdas vacías o basura", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("   ")).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice("s/d")).toBeNull();
  });
});

describe("buildPriceSheet", () => {
  it("incluye el encabezado y una fila por producto con sus precios actuales", () => {
    const sheet = buildPriceSheet(PRODUCTS);
    expect(sheet[0]).toEqual(PRICE_SHEET_HEADERS);
    expect(sheet).toHaveLength(4);
    const brownie = sheet.find(r => r[1] === "Brownie");
    expect(brownie).toEqual(["p1", "Brownie", "Panadería", 600, 500]);
  });

  it("puede filtrar solo los productos activos", () => {
    const sheet = buildPriceSheet(PRODUCTS, { onlyActive: true });
    expect(sheet).toHaveLength(3);
    expect(sheet.some(r => r[1] === "Alfajor viejo")).toBe(false);
  });

  it("ordena por categoría y después por nombre", () => {
    const names = buildPriceSheet(PRODUCTS).slice(1).map(r => r[1]);
    expect(names).toEqual(["Alfajor viejo", "Brownie", "Pan de molde"]);
  });

  it("no explota con una lista vacía", () => {
    expect(buildPriceSheet([])).toEqual([PRICE_SHEET_HEADERS]);
    expect(buildPriceSheet(undefined)).toEqual([PRICE_SHEET_HEADERS]);
  });
});

describe("parsePriceSheet", () => {
  it("normaliza encabezados con acentos, mayúsculas y espacios", () => {
    const { rows, missing } = parsePriceSheet([
      ["ID", "Producto", "Categoría", "Precio Minorista", "Precio Mayorista"],
      ["p1", "Brownie", "Panadería", "700", "600"],
    ]);
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ id: "p1", retail: 700, wholesale: 600, line: 2 });
  });

  it("avisa si falta una columna obligatoria", () => {
    const { missing } = parsePriceSheet([
      ["producto", "precio_minorista"],
      ["Brownie", "700"],
    ]);
    expect(missing).toContain("id");
    expect(missing).toContain("precio_mayorista");
  });

  it("saltea filas vacías", () => {
    const { rows } = parsePriceSheet([
      PRICE_SHEET_HEADERS,
      ["p1", "Brownie", "Panadería", "700", "600"],
      ["", "", "", "", ""],
      [],
    ]);
    expect(rows).toHaveLength(1);
  });

  it("devuelve vacío si la planilla no tiene filas de datos", () => {
    expect(parsePriceSheet([PRICE_SHEET_HEADERS]).rows).toEqual([]);
    expect(parsePriceSheet([]).rows).toEqual([]);
  });
});

describe("diffPriceRows", () => {
  const diffOf = matrix => diffPriceRows(parsePriceSheet(matrix).rows, PRODUCTS);

  it("detecta solo los productos cuyo precio cambió", () => {
    const { changes, unchanged, errors } = diffOf([
      PRICE_SHEET_HEADERS,
      ["p1", "Brownie", "Panadería", "700", "500"],       // sube minorista
      ["p2", "Pan de molde", "Panadería", "900", "750"],  // igual
    ]);
    expect(errors).toEqual([]);
    expect(unchanged).toBe(1);
    expect(changes).toEqual([
      { id: "p1", name: "Brownie", retail: { from: 600, to: 700 } },
    ]);
  });

  it("una celda de precio vacía significa 'no cambiar', no 'poner en cero'", () => {
    const { changes } = diffOf([
      PRICE_SHEET_HEADERS,
      ["p1", "Brownie", "Panadería", "700", ""],
    ]);
    expect(changes[0].retail).toEqual({ from: 600, to: 700 });
    expect(changes[0].wholesale).toBeUndefined();
  });

  it("ignora ediciones en columnas que no son de precio", () => {
    const { changes, unchanged } = diffOf([
      PRICE_SHEET_HEADERS,
      ["p1", "OTRO NOMBRE", "OTRA CATEGORIA", "600", "500"],
    ]);
    expect(changes).toEqual([]);
    expect(unchanged).toBe(1);
  });

  it("reporta filas cuyo id no existe en vez de crear productos nuevos", () => {
    const { changes, errors } = diffOf([
      PRICE_SHEET_HEADERS,
      ["", "Producto inventado", "", "1000", "900"],
      ["p9", "Otro inventado", "", "1000", "900"],
    ]);
    expect(changes).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it("descarta la fila entera si algún precio es negativo", () => {
    const { changes, errors } = diffOf([
      PRICE_SHEET_HEADERS,
      ["p1", "Brownie", "Panadería", "700", "-1"],
    ]);
    expect(changes).toEqual([]);
    expect(errors[0]).toMatch(/negativo/);
  });

  it("acepta bajar un precio a cero de forma explícita", () => {
    const { changes } = diffOf([
      PRICE_SHEET_HEADERS,
      ["p1", "Brownie", "Panadería", "0", "500"],
    ]);
    expect(changes[0].retail).toEqual({ from: 600, to: 0 });
  });

  it("no considera cambio una diferencia por debajo del centavo", () => {
    const { changes, unchanged } = diffPriceRows(
      [{ id: "p1", name: "Brownie", retail: 600.001, wholesale: null, line: 2 }],
      PRODUCTS
    );
    expect(changes).toEqual([]);
    expect(unchanged).toBe(1);
  });
});

describe("aplicación de cambios", () => {
  it("el patch a Supabase solo contiene las columnas de precio que cambiaron", () => {
    expect(changeToDbPatch({ id: "p1", retail: { from: 600, to: 700 } }))
      .toEqual({ price_retail: 700 });
    expect(changeToDbPatch({ id: "p1", retail: { from: 600, to: 700 }, wholesale: { from: 500, to: 550 } }))
      .toEqual({ price_retail: 700, price_wholesale: 550 });
  });

  it("actualizar el producto en memoria no toca stock ni el resto de los campos", () => {
    const updated = applyChangeToProduct(PRODUCTS[0], { id: "p1", retail: { from: 600, to: 700 } });
    expect(updated.priceRetail).toBe(700);
    expect(updated.priceWholesale).toBe(500);
    expect(updated.stock).toBe(20);
    expect(updated.active).toBe(true);
    expect(updated.category).toBe("Panadería");
  });
});
