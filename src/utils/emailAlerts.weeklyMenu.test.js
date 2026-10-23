import { describe, expect, it } from "vitest";
import { weeklyMenuEmailParams } from "./emailAlerts.js";

describe("weeklyMenuEmailParams", () => {
  const week = "26/10 al 30/10";

  it("con dos imágenes lista ambos enlaces y cuenta 2 archivos", () => {
    const params = weeklyMenuEmailParams("a@x.com", week, [
      { label: "Menú semanal", url: "https://x/semanal.png" },
      { label: "Menú keto", url: "https://x/keto.png" },
    ]);
    expect(params).toMatchObject({ to_email: "a@x.com", subject: "Menú semanal 26/10 al 30/10", file_count: "2" });
    expect(params.file_links).toBe("• Menú semanal 26/10 al 30/10\n  https://x/semanal.png\n• Menú keto 26/10 al 30/10\n  https://x/keto.png");
  });

  it("con una sola imagen mantiene el formato de siempre", () => {
    const params = weeklyMenuEmailParams("a@x.com", week, [{ label: "Menú semanal", url: "https://x/semanal.png" }]);
    expect(params.file_count).toBe("1");
    expect(params.file_links).toBe("• Menú semanal 26/10 al 30/10\n  https://x/semanal.png");
  });

  it("acepta una URL suelta por compatibilidad", () => {
    const params = weeklyMenuEmailParams("a@x.com", week, "https://x/semanal.png");
    expect(params.file_count).toBe("1");
    expect(params.file_links).toContain("https://x/semanal.png");
  });
});
