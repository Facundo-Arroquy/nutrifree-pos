import { describe, it, expect } from "vitest";
import { dayKey, todayKey, daysAgoKey, monthStartKey } from "./dates.js";

describe("dayKey", () => {
  it("usa el día de Argentina aunque en UTC ya sea el día siguiente", () => {
    expect(dayKey("2026-09-17T00:44:00+00:00")).toBe("2026-09-16");
  });
  it("respeta el día cuando UTC y Argentina coinciden", () => {
    expect(dayKey("2026-09-16T15:00:00+00:00")).toBe("2026-09-16");
  });
  it("acepta objetos Date", () => {
    expect(dayKey(new Date("2026-09-16T02:59:00Z"))).toBe("2026-09-15");
  });
  it("devuelve vacío para valores nulos o inválidos", () => {
    expect(dayKey(null)).toBe("");
    expect(dayKey(undefined)).toBe("");
    expect(dayKey("")).toBe("");
    expect(dayKey("no-es-fecha")).toBe("");
  });
});

describe("presets", () => {
  const now = new Date("2026-09-17T00:44:00Z"); // miércoles 16/09 21:44 hs AR
  it("todayKey devuelve el día local", () => {
    expect(todayKey(now)).toBe("2026-09-16");
  });
  it("daysAgoKey resta días en hora local", () => {
    expect(daysAgoKey(6, now)).toBe("2026-09-10");
  });
  it("monthStartKey devuelve el 1° del mes local", () => {
    expect(monthStartKey(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09-01");
  });
});
