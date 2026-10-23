import { describe, expect, it } from "vitest";
import { mondayOf, shiftWeek, normalizeWeekDays, weeklyMenuProducts, dayOfMonth, emptyWeekDays, hasMenuDishes, normalizeMenuType, MEAL_COLUMNS, MENU_TYPES, WEEK_DAYS } from "./weeklyMenu.js";

describe("weeklyMenu", () => {
  it("calcula el lunes de una semana", () => expect(mondayOf("2026-10-21")).toBe("2026-10-19"));
  it("navega entre semanas", () => expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26"));
  it("calcula el día del mes de cada día de la semana, incluso al cruzar de mes", () => {
    expect([0, 1, 2, 3, 4].map(i => dayOfMonth("2026-10-26", i))).toEqual([26, 27, 28, 29, 30]);
    expect([0, 1, 2, 3, 4].map(i => dayOfMonth("2026-10-29", i))).toEqual([29, 30, 31, 1, 2]);
  });
  it("solo crea lunes a viernes", () => expect(Object.keys(normalizeWeekDays({}))).toEqual(WEEK_DAYS.map(d => d.key)));
  it("cada día tiene almuerzo, cena y plato keto", () => {
    expect(emptyWeekDays().monday).toEqual({ lunch: "", dinner: "", keto: "" });
    expect(MEAL_COLUMNS.map(c => [c.key, c.label])).toEqual([["lunch", "Almuerzo"], ["dinner", "Cena"], ["keto", "Keto"]]);
  });
  it("normaliza menús viejos (sin keto) y descarta claves desconocidas", () => {
    const days = normalizeWeekDays({ monday: { lunch: "Pechuga", dinner: "Tarta", otra: "x" }, sabado: { lunch: "y" } });
    expect(days.monday).toEqual({ lunch: "Pechuga", dinner: "Tarta", keto: "" });
    expect(days.sabado).toBeUndefined();
    expect(days.friday).toEqual({ lunch: "", dinner: "", keto: "" });
  });
  it("conserva los platos keto guardados", () => {
    expect(normalizeWeekDays({ tuesday: { keto: "Salmón" } }).tuesday.keto).toBe("Salmón");
  });
  it("detecta si una plantilla tiene platos cargados", () => {
    const days = normalizeWeekDays({ monday: { lunch: "Pechuga" } });
    expect(hasMenuDishes(days, "classic")).toBe(true);
    expect(hasMenuDishes(days, "keto")).toBe(false);
    expect(hasMenuDishes(normalizeWeekDays({ friday: { keto: "  " } }), "keto")).toBe(false);
    expect(hasMenuDishes(normalizeWeekDays({ friday: { keto: "Salmón" } }), "keto")).toBe(true);
    expect(hasMenuDishes(undefined, "keto")).toBe(false);
  });
  it("un tipo de menú desconocido cae en el clásico", () => {
    expect(normalizeMenuType("keto")).toBe("keto");
    expect(normalizeMenuType("vegano")).toBe("classic");
    expect(MENU_TYPES.keto.slots).toHaveLength(1);
  });
  it("ofrece solamente viandas activas ordenadas por nombre", () => {
    const products = [
      { name: "Tarta", category: "Viandas", active: true },
      { name: "Brownie", category: "Postres", active: true },
      { name: "Milanesa", category: "vianda", active: true },
      { name: "Lasaña", category: "Viandas", active: false },
    ];
    expect(weeklyMenuProducts(products).map(product => product.name)).toEqual(["Milanesa", "Tarta"]);
  });
});
