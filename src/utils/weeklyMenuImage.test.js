import { describe, expect, it, vi } from "vitest";
import { emptyWeekDays } from "./weeklyMenu.js";
import { IMAGE_SIZE, drawWeeklyMenu, layoutDishText, loadWeeklyMenuAssets, mulberry32 } from "./weeklyMenuImage.js";

// Ancho simulado: 0.5 × tamaño por carácter
const measure = (text, size) => text.length * size * 0.5;

describe("layoutDishText", () => {
  it("un plato corto entra en una línea a 27 px", () => {
    expect(layoutDishText("Pechuga con puré", measure, 346)).toEqual({ size: 27, lines: ["Pechuga con puré"] });
  });

  it("parte el texto en 2 líneas sin achicar la letra", () => {
    const { size, lines } = layoutDishText("Tortilla de verduras con ensalada", measure, 346);
    expect(size).toBe(27);
    expect(lines).toEqual(["Tortilla de verduras con", "ensalada"]);
  });

  it("si no entra en 2 líneas, achica a 24 px y usa 3", () => {
    const text = "Colita de cuadril con cebolla y morron salteado y papa hervida";
    const { size, lines } = layoutDishText(text, measure, 346);
    expect(size).toBe(24);
    expect(lines.length).toBe(3);
    expect(lines.join(" ")).toBe(text);
  });

  it("si ni así entra, corta con puntos suspensivos sin pasarse del ancho", () => {
    const text = "Plato con un nombre larguísimo que incluye muchísimos ingredientes distintos servidos con guarniciones varias y salsa especial de la casa";
    const { size, lines } = layoutDishText(text, measure, 346);
    expect(lines.length).toBe(3);
    expect(lines[2].endsWith("…")).toBe(true);
    lines.forEach(line => expect(measure(line, size)).toBeLessThanOrEqual(346));
  });

  it("acepta estilos propios (plato único: letra más grande y más ancho)", () => {
    const styles = [{ size: 34, maxLines: 2 }, { size: 28, maxLines: 3 }];
    expect(layoutDishText("Omelette de hongos con ensalada", measure, 720, styles)).toEqual({ size: 34, lines: ["Omelette de hongos con ensalada"] });
    const long = "Hamburguesa de ternera sin pan con verduras asadas huevo frito y salsa especial de la casa";
    const { size, lines } = layoutDishText(long, measure, 720, styles);
    expect(size).toBe(28);
    expect(lines.join(" ")).toBe(long);
  });

  it("texto vacío o nulo no genera líneas", () => {
    expect(layoutDishText("", measure, 346).lines).toEqual([]);
    expect(layoutDishText(null, measure, 346).lines).toEqual([]);
    expect(layoutDishText("   ", measure, 346).lines).toEqual([]);
  });
});

describe("mulberry32", () => {
  it("es determinístico y queda entre 0 y 1", () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    const seq = Array.from({ length: 5 }, () => a());
    expect(seq).toEqual(Array.from({ length: 5 }, () => b()));
    seq.forEach(n => { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); });
  });
});

// Contexto 2D falso: registra el texto dibujado y responde a cualquier método.
const fakeCanvas = () => {
  const texts = [];
  const images = [];
  const state = { font: "10px sans-serif" };
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(state, {
    get: (target, prop) => {
      if (prop === "fillText") return text => texts.push(text);
      if (prop === "drawImage") return image => images.push(image);
      if (prop === "measureText") return text => ({ width: text.length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(target.font)?.[1]) || 10) * 0.5 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      return prop in target ? target[prop] : () => {};
    },
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  return { canvas: { getContext: () => ctx, width: 0, height: 0 }, texts, images };
};

describe("drawWeeklyMenu", () => {
  const days = {
    ...emptyWeekDays(),
    monday: { lunch: "Pechuga con puré", dinner: "Tallarines al pesto" },
    friday: { lunch: "Pescado a la portuguesa", dinner: "" },
  };

  it("fija el tamaño 1080×1350 (4:5 para Instagram)", () => {
    const { canvas } = fakeCanvas();
    drawWeeklyMenu(canvas, "2026-10-26", days);
    expect([canvas.width, canvas.height]).toEqual([IMAGE_SIZE.width, IMAGE_SIZE.height]);
  });

  it("escribe título, rango de fechas, días con su número, platos y contacto", () => {
    const { canvas, texts } = fakeCanvas();
    drawWeeklyMenu(canvas, "2026-10-26", days);
    expect(texts).toEqual(expect.arrayContaining([
      "Menú semanal", "Lunes a viernes · 26/10 al 30/10",
      "LUN", "MAR", "MIÉ", "JUE", "VIE", "26", "27", "28", "29", "30",
      "ALMUERZO", "CENA", "Pechuga con puré", "Tallarines al pesto", "Pescado a la portuguesa",
      "Consultas y pedidos", "WhatsApp +54 9 2281 588834",
    ]));
  });

  it("muestra un guion en las comidas sin cargar", () => {
    const { canvas, texts } = fakeCanvas();
    drawWeeklyMenu(canvas, "2026-10-26", emptyWeekDays());
    expect(texts.filter(t => t === "—")).toHaveLength(10);
  });

  it("sin logos dibuja la marca con texto; con logos usa las imágenes", () => {
    const sinLogos = fakeCanvas();
    drawWeeklyMenu(sinLogos.canvas, "2026-10-26", days, null);
    expect(sinLogos.texts).toContain("Nutrifree");
    expect(sinLogos.images).toHaveLength(0);

    const wordmark = { width: 888, height: 272 };
    const mark = { width: 1417, height: 1417 };
    const conLogos = fakeCanvas();
    drawWeeklyMenu(conLogos.canvas, "2026-10-26", days, { wordmark, mark });
    expect(conLogos.texts).not.toContain("Nutrifree");
    expect(conLogos.images).toEqual([wordmark, mark]);
  });

  describe("plantilla keto (un plato por día)", () => {
    const keto = { ...emptyWeekDays(), monday: { keto: "Salmón al horno con espárragos" }, wednesday: { keto: "Bife de chorizo con ensalada" } };

    it("usa el título keto, la misma cabecera y el mismo pie", () => {
      const { canvas, texts } = fakeCanvas();
      drawWeeklyMenu(canvas, "2026-10-26", keto, null, "keto");
      expect([canvas.width, canvas.height]).toEqual([IMAGE_SIZE.width, IMAGE_SIZE.height]);
      expect(texts).toEqual(expect.arrayContaining(["Menú keto", "Lunes a viernes · 26/10 al 30/10", "LUN", "VIE", "26", "30", "WhatsApp +54 9 2281 588834"]));
      expect(texts).not.toContain("Menú semanal");
    });

    it("dibuja un solo plato por día, sin almuerzo ni cena", () => {
      const { canvas, texts } = fakeCanvas();
      drawWeeklyMenu(canvas, "2026-10-26", keto, null, "keto");
      expect(texts).not.toContain("ALMUERZO");
      expect(texts).not.toContain("CENA");
      expect(texts.filter(t => t === "PLATO DEL DÍA")).toHaveLength(5);
      expect(texts).toEqual(expect.arrayContaining(["Salmón al horno con espárragos", "Bife de chorizo con ensalada"]));
      expect(texts.filter(t => t === "—")).toHaveLength(3); // martes, jueves y viernes sin cargar
    });

    it("no mezcla los platos clásicos en la imagen keto", () => {
      const mixed = { ...keto, monday: { lunch: "Pechuga con puré", dinner: "Tarta", keto: "Salmón" } };
      const { canvas, texts } = fakeCanvas();
      drawWeeklyMenu(canvas, "2026-10-26", mixed, null, "keto");
      expect(texts).toContain("Salmón");
      expect(texts).not.toContain("Pechuga con puré");
    });

    it("un tipo desconocido se dibuja como menú clásico", () => {
      const { canvas, texts } = fakeCanvas();
      drawWeeklyMenu(canvas, "2026-10-26", keto, null, "otro");
      expect(texts).toContain("Menú semanal");
    });
  });

  it("tolera días faltantes", () => {
    const { canvas } = fakeCanvas();
    expect(() => drawWeeklyMenu(canvas, "2026-10-26", {})).not.toThrow();
  });
});

describe("loadWeeklyMenuAssets", () => {
  it("si las imágenes fallan devuelve null y permite reintentar", async () => {
    const created = [];
    vi.stubGlobal("Image", class {
      constructor() { created.push(this); }
      set src(_) { queueMicrotask(() => this.onerror?.()); }
    });
    await expect(loadWeeklyMenuAssets()).resolves.toEqual({ wordmark: null, mark: null });
    expect(created).toHaveLength(2);
    await loadWeeklyMenuAssets();
    expect(created).toHaveLength(4); // no se cacheó el fallo
    vi.unstubAllGlobals();
  });

  it("cuando cargan, se piden una sola vez", async () => {
    const created = [];
    vi.stubGlobal("Image", class {
      constructor() { created.push(this); }
      set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); }
    });
    const first = await loadWeeklyMenuAssets();
    const second = await loadWeeklyMenuAssets();
    expect(second).toBe(first);
    expect(created.map(i => i.url)).toEqual(["/imagenes/logo.png", "/logo.jpg"]);
    vi.unstubAllGlobals();
  });
});
