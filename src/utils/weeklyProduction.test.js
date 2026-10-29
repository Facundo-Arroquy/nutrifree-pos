import { describe, expect, it } from "vitest";
import { emptyWeekDays } from "./weeklyMenu.js";
import { NO_CATEGORY, computeWeeklyProduction, formatQuantity, pickRecipe } from "./weeklyProduction.js";

const ingredients = [
  { id: "pechuga", name: "Pechuga", unit: "kg", category: "Carnes" },
  { id: "calabaza", name: "Calabaza", unit: "kg", category: "Verduras" },
  { id: "aceite", name: "Aceite", unit: "l", category: "Almacén" },
  { id: "tapa", name: "Tapa 103", unit: "unidades", category: "" },
  { id: "horas", name: "Horas de trabajo", unit: "unidades", category: "Mano de obra" },
];
const line = (ingredientId, qty) => ({ ingredientId, qty });

const products = [
  { id: "p-pechuga", name: "Pechuga con puré" },
  { id: "p-tarta", name: "Tarta de verduras" },
  { id: "p-locro", name: "Locro" },
  { id: "p-sin", name: "Plato sin receta" },
  { id: "p-roto", name: "Receta con ceros" },
  { id: "p-parcial", name: "Receta parcial" },
];
const recipes = [
  // por porción (rinde 1)
  { id: "r1", productId: "p-pechuga", yield: 1, ingredients: [line("pechuga", 0.18), line("calabaza", 0.3), line("tapa", 1)] },
  // por tanda (rinde 28): 14 kg de calabaza para 28 porciones
  { id: "r2", productId: "p-tarta", yield: 28, ingredients: [line("calabaza", 14), line("aceite", 0.56), line("horas", 1)] },
  { id: "r3", productId: "p-locro", yield: 50, ingredients: [line("pechuga", 5)] },
  { id: "r4", productId: "p-roto", yield: 1, ingredients: [line("pechuga", 0), line("calabaza", 0)] },
  { id: "r5", productId: "p-parcial", yield: 2, ingredients: [line("pechuga", 1), line("calabaza", 0)] },
];

// Arma una semana: cada argumento es [día, comida, plato, unidades]
const week = (...items) => {
  const days = emptyWeekDays();
  items.forEach(([day, meal, name, qty]) => { days[day][meal] = name; days[day].qty[meal] = qty; });
  return days;
};
const compute = days => computeWeeklyProduction({ days, products, recipes, ingredients });
const row = (result, id) => result.rows.find(r => r.ingredientId === id);

describe("computeWeeklyProduction", () => {
  it("receta por porción: cantidad × unidades", () => {
    const result = compute(week(["monday", "lunch", "Pechuga con puré", 30]));
    expect(row(result, "pechuga")).toMatchObject({ total: 5.4, perDay: { monday: 5.4, tuesday: 0 } });
    expect(row(result, "calabaza").total).toBe(9);
    expect(row(result, "tapa").total).toBe(30);
  });

  it("receta por tanda: divide por el rendimiento", () => {
    const result = compute(week(["tuesday", "dinner", "Tarta de verduras", 56]));
    expect(row(result, "calabaza").total).toBe(28); // 14 kg × 56 / 28
    expect(row(result, "aceite").total).toBe(1.12);
    expect(row(result, "horas").total).toBe(2); // las horas de trabajo también escalan
  });

  it("suma el mismo ingrediente entre platos, comidas y días, y lo desglosa por día", () => {
    const result = compute(week(
      ["monday", "lunch", "Pechuga con puré", 10],
      ["monday", "dinner", "Locro", 50],
      ["wednesday", "keto", "Pechuga con puré", 20],
    ));
    expect(row(result, "pechuga").perDay).toMatchObject({ monday: 1.8 + 5, tuesday: 0, wednesday: 3.6 });
    expect(row(result, "pechuga").total).toBe(10.4);
    expect(row(result, "calabaza").perDay.wednesday).toBe(6);
  });

  it("cuenta las unidades por día, por comida y total", () => {
    const { units } = compute(week(
      ["monday", "lunch", "Pechuga con puré", 10],
      ["monday", "dinner", "Locro", 5],
      ["friday", "keto", "Tarta de verduras", 7],
    ));
    expect(units.perDay).toMatchObject({ monday: 15, tuesday: 0, friday: 7 });
    expect(units.perMeal).toEqual({ lunch: 10, dinner: 5, keto: 7 });
    expect(units.total).toBe(22);
  });

  it("agrupa por categoría ordenada, con 'Sin categoría' al final, e ingredientes por nombre", () => {
    const { groups } = compute(week(["monday", "lunch", "Pechuga con puré", 10], ["monday", "dinner", "Tarta de verduras", 28]));
    expect(groups.map(g => g.category)).toEqual(["Almacén", "Carnes", "Mano de obra", "Verduras", NO_CATEGORY]);
    expect(groups.at(-1).rows.map(r => r.name)).toEqual(["Tapa 103"]);
  });

  it("redondea a 3 decimales", () => {
    const result = compute(week(["monday", "lunch", "Pechuga con puré", 7]));
    expect(row(result, "pechuga").total).toBe(1.26);
    const odd = computeWeeklyProduction({
      days: week(["monday", "lunch", "Locro", 3]),
      products, ingredients, recipes: [{ id: "r", productId: "p-locro", yield: 7, ingredients: [line("pechuga", 1)] }],
    });
    expect(row(odd, "pechuga").total).toBe(0.429);
  });

  describe("platos que no suman (issues)", () => {
    const statusOf = (result, name) => result.entries.find(e => e.name === name).status;

    it("sin receta, receta con cantidades en cero y plato que ya no existe", () => {
      const result = compute(week(
        ["monday", "lunch", "Plato sin receta", 10],
        ["monday", "dinner", "Receta con ceros", 10],
        ["tuesday", "lunch", "Plato borrado", 10],
      ));
      expect(statusOf(result, "Plato sin receta")).toBe("no-recipe");
      expect(statusOf(result, "Receta con ceros")).toBe("no-recipe");
      expect(statusOf(result, "Plato borrado")).toBe("no-product");
      expect(result.rows).toEqual([]);
      expect(result.units.total).toBe(30); // igual cuentan como unidades a producir
      expect(result.issues).toHaveLength(3);
    });

    it("receta incompleta: suma las líneas válidas y lo avisa", () => {
      const result = compute(week(["monday", "lunch", "Receta parcial", 4]));
      expect(statusOf(result, "Receta parcial")).toBe("incomplete");
      expect(row(result, "pechuga").total).toBe(2); // 1 × 4 / 2
      expect(row(result, "calabaza")).toBeUndefined();
      expect(result.issues.map(i => i.status)).toEqual(["incomplete"]);
    });

    it("plato sin unidades: no suma y se avisa", () => {
      const result = compute(week(["monday", "lunch", "Pechuga con puré", ""]));
      expect(statusOf(result, "Pechuga con puré")).toBe("no-qty");
      expect(result.rows).toEqual([]);
    });

    it("las unidades inválidas (0, negativas, texto) se tratan como vacías", () => {
      ["0", -5, "abc", null].forEach(qty => {
        expect(compute(week(["monday", "lunch", "Pechuga con puré", qty])).units.total).toBe(0);
      });
    });

    it("un plato OK no genera avisos", () => {
      expect(compute(week(["monday", "lunch", "Pechuga con puré", 5])).issues).toEqual([]);
    });
  });

  it("reconoce el plato aunque cambien mayúsculas, acentos o espacios", () => {
    const result = compute(week(["monday", "lunch", "  PECHUGA con pure ", 10]));
    expect(row(result, "pechuga").total).toBe(1.8);
  });

  it("un ingrediente borrado del catálogo se muestra con el nombre de la receta", () => {
    const result = computeWeeklyProduction({
      days: week(["monday", "lunch", "Locro", 50]), products, ingredients: [],
      recipes: [{ id: "r", productId: "p-locro", yield: 50, ingredients: [{ ingredientId: "x", name: "Maíz", unit: "kg", qty: 2.5 }] }],
    });
    expect(result.rows[0]).toMatchObject({ name: "Maíz", unit: "kg", category: NO_CATEGORY, total: 2.5 });
  });

  it("semana vacía o sin datos no rompe", () => {
    expect(compute(emptyWeekDays())).toMatchObject({ rows: [], groups: [], issues: [], units: { total: 0 } });
    expect(computeWeeklyProduction({ days: undefined })).toMatchObject({ rows: [], issues: [] });
  });
});

describe("pickRecipe", () => {
  it("con varias recetas elige la que tiene más ingredientes con cantidad", () => {
    const a = { id: "a", productId: "p", ingredients: [line("x", 0), line("y", 0)] };
    const b = { id: "b", productId: "p", ingredients: [line("x", 1), line("y", 2)] };
    expect(pickRecipe([a, b], "p").id).toBe("b");
    expect(pickRecipe([a], "otro")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("usa coma decimal, hasta 3 decimales y separador de miles", () => {
    expect(formatQuantity(12.5)).toBe("12,5");
    expect(formatQuantity(0.429)).toBe("0,429");
    expect(formatQuantity(1234.5)).toBe("1.234,5");
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(undefined)).toBe("0");
  });
});
