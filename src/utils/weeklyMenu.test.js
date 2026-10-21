import { describe, expect, it } from "vitest";
import { mondayOf, shiftWeek, normalizeWeekDays, WEEK_DAYS } from "./weeklyMenu.js";

describe("weeklyMenu", () => {
  it("calcula el lunes de una semana", () => expect(mondayOf("2026-10-21")).toBe("2026-10-19"));
  it("navega entre semanas", () => expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26"));
  it("solo crea lunes a viernes", () => expect(Object.keys(normalizeWeekDays({}))).toEqual(WEEK_DAYS.map(d => d.key)));
});
