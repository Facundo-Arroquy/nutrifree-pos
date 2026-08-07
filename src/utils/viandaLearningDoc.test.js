/**
 * Tests del documento de aprendizaje.
 *
 * Lo que importa acá no es el formato sino que las conclusiones sean correctas:
 * el documento existe para que alguien decida cuánto producir mirándolo.
 */
import { describe, it, expect } from "vitest";
import { buildForecastContext, addDays } from "./viandaForecast.js";
import {
  buildLearningDoc, wape, weeklyBreakdown, menuBreakdown, dowBreakdown,
  dataReadiness, buildInsights,
} from "./viandaLearningDoc.js";

const HOY = "2026-08-07";

/** Ítem cerrado de una planificación pasada. */
const item = (date, productId, forecastQty, actualQty, extra = {}) => ({
  id: `${date}-${productId}`, planId: "p", date, productId,
  productName: productId.toUpperCase(), forecastQty, recommendedQty: Math.ceil(forecastQty * 1.18),
  actualQty, producedQty: null, confidence: "media", forecastDetail: null, ...extra,
});

const sale = (date, items) => ({
  id: `s-${date}`, status: "closed", createdAt: `${date}T15:00:00.000Z`, deliveryDate: date, items,
});
const line = (productId, qty) => ({ productId, qty, name: productId, category: "Viandas" });
const PRODUCTS = ["m1", "m2", "m3"].map(id => ({ id, name: id.toUpperCase(), category: "Viandas", kitItems: [] }));

const ctxCon = (dias = 40) => buildForecastContext(
  Array.from({ length: dias }, (_, d) => sale(addDays("2026-08-06", -d), [line("m1", 12), line("m2", 6)])),
  PRODUCTS, [], HOY);

describe("wape", () => {
  it("pondera por volumen en vez de por caso", () => {
    // Errar 1 sobre 1 unidad y 1 sobre 20 no es lo mismo: WAPE = 2/21
    expect(wape([{ forecastQty: 2, actualQty: 1 }, { forecastQty: 19, actualQty: 20 }])).toBeCloseTo(9.5, 1);
  });

  it("devuelve null cuando no se vendió nada", () => {
    expect(wape([{ forecastQty: 5, actualQty: 0 }])).toBe(null);
  });
});

describe("weeklyBreakdown", () => {
  it("agrupa por lunes y calcula error y sesgo de cada semana", () => {
    const out = weeklyBreakdown([
      item("2026-07-27", "m1", 10, 12), item("2026-07-29", "m2", 10, 8),  // semana 27/07
      item("2026-08-03", "m1", 10, 20),                                    // semana 03/08
    ]);
    expect(out.map(w => w.weekStart)).toEqual(["2026-07-27", "2026-08-03"]);
    expect(out[0].menus).toBe(2);
    expect(out[0].bias).toBe(1);      // 20 proyectado, 20 vendido
    expect(out[1].bias).toBe(2);      // 10 proyectado, 20 vendido
  });

  it("cuenta las veces que se vendió más de lo recomendado producir", () => {
    const out = weeklyBreakdown([item("2026-08-03", "m1", 10, 30)]); // recomendado 12
    expect(out[0].shortages).toBe(1);
  });

  it("ordena las semanas cronológicamente", () => {
    const out = weeklyBreakdown([item("2026-08-03", "m1", 5, 5), item("2026-07-20", "m1", 5, 5)]);
    expect(out[0].weekStart).toBe("2026-07-20");
  });
});

describe("menuBreakdown", () => {
  it("detecta el sesgo consistente de un menú", () => {
    const items = Array.from({ length: 5 }, (_, i) => item(addDays("2026-08-03", -7 * i), "m1", 10, 15));
    const out = menuBreakdown(items, ctxCon());
    expect(out[0].veces).toBe(5);
    expect(out[0].bias).toBe(1.5);
  });

  it("ordena por volumen vendido, no alfabéticamente", () => {
    const out = menuBreakdown([
      item("2026-08-03", "m1", 5, 4), item("2026-08-03", "m2", 20, 30),
    ], ctxCon());
    expect(out[0].productId).toBe("m2");
  });

  it("acompaña cada menú con su confianza actual", () => {
    const out = menuBreakdown([item("2026-08-03", "m1", 10, 10)], ctxCon());
    expect(["alta", "media", "baja"]).toContain(out[0].confidence);
    expect(out[0].historial).toBeGreaterThan(0);
  });
});

describe("dowBreakdown", () => {
  it("agrupa por día de la semana empezando en lunes", () => {
    const out = dowBreakdown([
      item("2026-08-09", "m1", 5, 5),  // domingo
      item("2026-08-03", "m1", 5, 5),  // lunes
    ]);
    expect(out.map(d => d.label)).toEqual(["Lunes", "Domingo"]);
  });
});

describe("dataReadiness", () => {
  it("marca como esperando datos los factores sin historial suficiente", () => {
    const r = dataReadiness(buildForecastContext([sale("2026-08-05", [line("m1", 5)])], PRODUCTS, [], HOY), []);
    const estacional = r.factores.find(f => f.factor === "Estacionalidad anual");
    expect(estacional.estado).toBe("esperando datos");
    expect(r.mesesCubiertos).toBe(1);
  });

  it("da por listo el calendario, que no depende del historial", () => {
    const r = dataReadiness(ctxCon(), []);
    expect(r.factores.find(f => f.factor === "Feriados y puentes").estado).toBe("listo");
  });

  it("cuenta semanas cerradas y menús evaluados", () => {
    const r = dataReadiness(ctxCon(), [
      item("2026-08-03", "m1", 5, 5), item("2026-08-04", "m2", 5, 5),
      item("2026-07-27", "m1", 5, 5), item("2026-07-27", "m3", 5, null),
    ]);
    expect(r.semanasCerradas).toBe(2);
    expect(r.menusEvaluados).toBe(2); // m3 no cerró
  });
});

describe("buildInsights", () => {
  const base = {
    global: { n: 20, bias: 1, shortages: 0 }, weekly: [], menus: [], dows: [],
    readiness: { factores: [{ factor: "X", estado: "listo" }] }, pendingSync: 0, marginPct: 18,
  };

  it("guía el arranque cuando no hay nada cerrado", () => {
    const out = buildInsights({ ...base, global: { n: 0 } });
    expect(out).toHaveLength(1);
    expect(out[0].texto).toContain("Actualizar ventas reales");
  });

  it("avisa cuando quedaron días sin registrar", () => {
    const out = buildInsights({ ...base, pendingSync: 4 });
    expect(out.some(i => i.texto.includes("4 día(s)"))).toBe(true);
  });

  it("recomienda subir el margen cuando el modelo se queda corto", () => {
    const out = buildInsights({ ...base, global: { n: 20, bias: 1.3, shortages: 0 } });
    const sesgo = out.find(i => i.tipo === "sesgo");
    expect(sesgo.texto).toContain("30%");
    expect(sesgo.texto).toContain("margen de seguridad");
  });

  it("avisa cuando el modelo se pasa", () => {
    const out = buildInsights({ ...base, global: { n: 20, bias: 0.8, shortages: 0 } });
    expect(out.find(i => i.tipo === "sesgo").texto).toContain("se pasa");
  });

  it("señala los menús que se venden sistemáticamente más de lo proyectado", () => {
    const out = buildInsights({ ...base, menus: [{ name: "GUISO", veces: 5, bias: 1.4 }] });
    expect(out.some(i => i.tipo === "menú" && i.texto.includes("GUISO"))).toBe(true);
  });

  it("no saca conclusiones de un menú con una sola aparición", () => {
    const out = buildInsights({ ...base, menus: [{ name: "GUISO", veces: 1, bias: 3 }] });
    expect(out.some(i => i.tipo === "menú")).toBe(false);
  });

  it("marca como riesgo que falte producción seguido", () => {
    const out = buildInsights({ ...base, global: { n: 20, bias: 1, shortages: 8 } });
    expect(out.find(i => i.texto.includes("8 de 20")).tipo).toBe("riesgo");
  });

  it("reconoce cuando la proyección viene mejorando", () => {
    const weekly = [{ wape: 60 }, { wape: 55 }, { wape: 30 }, { wape: 25 }];
    const out = buildInsights({ ...base, weekly });
    expect(out.some(i => i.tipo === "ok" && i.texto.includes("mejorando"))).toBe(true);
  });

  it("lista los factores que todavía no aportan", () => {
    const out = buildInsights({ ...base, readiness: { factores: [{ factor: "Estacionalidad anual", estado: "esperando datos" }] } });
    expect(out.some(i => i.texto.includes("estacionalidad anual"))).toBe(true);
  });
});

describe("buildLearningDoc", () => {
  const items = [
    item("2026-07-27", "m1", 10, 13), item("2026-07-28", "m2", 6, 5),
    item("2026-08-03", "m1", 10, 14), item("2026-08-04", "m2", 6, 6),
    item("2026-08-10", "m1", 10, null), // semana futura, sin cerrar
  ];

  it("arma todas las secciones", () => {
    const doc = buildLearningDoc({ plans: [{ weekStart: "2026-08-03" }], items, ctx: ctxCon(), generatedAt: HOY });
    expect(doc.global.n).toBe(4);
    expect(doc.weekly).toHaveLength(2);
    expect(doc.menus).toHaveLength(2);
    expect(doc.dows.length).toBeGreaterThan(0);
    expect(doc.insights.length).toBeGreaterThan(0);
    expect(doc.readiness.factores.length).toBe(6);
  });

  it("ignora los ítems sin venta real al medir", () => {
    const doc = buildLearningDoc({ items, ctx: ctxCon(), generatedAt: HOY });
    expect(doc.global.unidadesProyectadas).toBe(32); // no incluye el de 2026-08-10
  });

  it("genera un Markdown con las siete secciones", () => {
    const { markdown } = buildLearningDoc({ items, ctx: ctxCon(), generatedAt: HOY });
    for (const t of ["# Proyección de Viandas — Documento de aprendizaje",
      "## 1. Qué conviene hacer", "## 2. Precisión del modelo", "## 3. Evolución semana a semana",
      "## 4. Comportamiento de cada menú", "## 5. Por día de la semana", "## 6. Madurez del modelo",
      "## 7. Cómo se hace más preciso con el tiempo"]) {
      expect(markdown).toContain(t);
    }
    expect(markdown).toContain("M1");
    expect(markdown).toContain("viernes 7 de agosto de 2026");
  });

  it("produce un documento útil incluso sin ninguna semana cerrada", () => {
    const doc = buildLearningDoc({ items: [], ctx: ctxCon(), generatedAt: HOY });
    expect(doc.global.n).toBe(0);
    expect(doc.markdown).toContain("Todavía no hay proyecciones cerradas");
    expect(doc.markdown).toContain("## 7. Cómo se hace más preciso con el tiempo");
  });

  it("no rompe sin contexto de ventas", () => {
    const doc = buildLearningDoc({ items, ctx: null, generatedAt: HOY });
    expect(doc.markdown).toContain("## 2. Precisión del modelo");
  });
});
