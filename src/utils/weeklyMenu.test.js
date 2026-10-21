import { describe, expect, it } from "vitest";
import { mondayOf, shiftWeek, normalizeWeekDays, weeklyMenuProducts, WEEK_DAYS } from "./weeklyMenu.js";

describe("weeklyMenu", () => {
  it("calcula el lunes de una semana", () => expect(mondayOf("2026-10-21")).toBe("2026-10-19"));
  it("navega entre semanas", () => expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26"));
  it("solo crea lunes a viernes", () => expect(Object.keys(normalizeWeekDays({}))).toEqual(WEEK_DAYS.map(d => d.key)));
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
