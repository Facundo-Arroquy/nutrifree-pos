/**
 * Tests del motor de proyección de viandas.
 *
 * Cubren las decisiones de diseño que hacen que esto no sea un promedio:
 *  1. Los kits se expanden: un menú vendido dentro de "Almuerzo y Cena" es demanda
 *     de ese menú.
 *  2. Los días sin oferta no cuentan como demanda cero.
 *  3. El nivel base se desestacionaliza antes de promediar, para no contar dos
 *     veces el efecto del día de la semana.
 *  4. Las ventas recientes pesan más que las viejas.
 *  5. El colchón de producción se decide sobre el día, no sobre cada plato.
 *  6. El sesgo aprendido corrige proyecciones sistemáticamente cortas.
 *  7. Las ventas anteriores al 1/6/2026 se ignoran: el sistema no se usaba bien.
 */
import { describe, it, expect } from "vitest";
import {
  arDateStr, addDays, dayDiff, mondayOf, weekDays,
  easterSunday, movedHoliday, isHoliday, calendarFactor, HOLIDAY_FACTOR,
  shrink, recencyWeight,
  extractViandaHistory, demandDateOf,
  dowFactors, monthFactors, trendFactor,
  learnedBias, buildForecastContext, forecastMenu, forecastPlan,
  confidenceOf, accuracyReport, actualUnitsFor,
  dailyBaseLevel, forecastDayTotal, menuLevel,
  HISTORY_START, quantile, allocateIntegers, dayCoverageMultiplier, coverageMultiplier,
} from "./viandaForecast.js";

const PRODUCTS = [
  { id: "m1", name: "Menú 1", category: "Viandas", kitItems: [] },
  { id: "m2", name: "Menú 2", category: "Viandas", kitItems: [] },
  { id: "kit", name: "Almuerzo y Cena del día", category: "Viandas", kitItems: [{ productId: "m1", qty: 1 }] },
  { id: "pan", name: "Pan de molde", category: "Panadería", kitItems: [] },
];

/** Venta mínima con la forma real que guarda el POS. */
const sale = (date, items, extra = {}) => ({
  id: `s-${date}-${Math.random()}`,
  status: "closed",
  createdAt: `${date}T15:00:00.000Z`,
  deliveryDate: null,
  items,
  ...extra,
});
const item = (productId, qty, category = "Viandas", extra = {}) =>
  ({ productId, qty, name: productId, category, ...extra });

// ─── FECHAS ─────────────────────────────────────────────────────────────────

describe("helpers de fecha", () => {
  it("convierte un ISO a fecha calendario argentina", () => {
    // 01:30 UTC del 8 son las 22:30 del 7 en Argentina (UTC-3)
    expect(arDateStr("2026-08-08T01:30:00.000Z")).toBe("2026-08-07");
    expect(arDateStr("2026-08-07T15:00:00.000Z")).toBe("2026-08-07");
  });

  it("deja pasar una fecha que ya viene sin hora", () => {
    expect(arDateStr("2026-08-07")).toBe("2026-08-07");
  });

  it("suma días cruzando fin de mes", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(dayDiff("2026-02-01", "2026-01-31")).toBe(1);
  });

  it("encuentra el lunes de la semana, incluso desde un domingo", () => {
    expect(mondayOf("2026-08-07")).toBe("2026-08-03"); // viernes → lunes
    expect(mondayOf("2026-08-09")).toBe("2026-08-03"); // domingo → lunes previo
    expect(mondayOf("2026-08-03")).toBe("2026-08-03");
  });

  it("arma la semana de lunes a domingo", () => {
    expect(weekDays("2026-08-03")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
      "2026-08-07", "2026-08-08", "2026-08-09",
    ]);
  });
});

// ─── CALENDARIO ─────────────────────────────────────────────────────────────

describe("calendario argentino", () => {
  it("calcula el domingo de Pascua", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
  });

  it("traslada los feriados trasladables según la Ley 27.399", () => {
    expect(movedHoliday("2027-08-17")).toBe("2027-08-16"); // martes → lunes anterior
    expect(movedHoliday("2028-08-17")).toBe("2028-08-21"); // jueves → lunes siguiente
    expect(movedHoliday("2026-08-17")).toBe("2026-08-17"); // ya es lunes
  });

  it("reconoce feriados fijos y móviles", () => {
    expect(isHoliday("2026-05-01")).toBe(true);   // Día del Trabajador
    expect(isHoliday("2026-04-03")).toBe(true);   // Viernes Santo (Pascua 5/4)
    expect(isHoliday("2026-08-06")).toBe(false);
  });

  it("castiga el feriado y, más suave, el día puente", () => {
    expect(calendarFactor("2026-05-01")).toBe(HOLIDAY_FACTOR);
    // 2026-12-08 (Inmaculada) cae martes ⇒ el lunes 7 es puente
    expect(calendarFactor("2026-12-07")).toBe(0.85);
    expect(calendarFactor("2026-08-05")).toBe(1);
  });
});

// ─── ESTADÍSTICA ────────────────────────────────────────────────────────────

describe("helpers estadísticos", () => {
  it("encoge hacia 1 cuando hay pocas observaciones", () => {
    expect(shrink(2, 1, 4)).toBeCloseTo(1.2);   // 1 dato: casi no mueve la aguja
    expect(shrink(2, 100, 4)).toBeGreaterThan(1.9); // muchos datos: manda el dato
  });

  it("halvea el peso cada media vida", () => {
    expect(recencyWeight(0, 28)).toBe(1);
    expect(recencyWeight(28, 28)).toBeCloseTo(0.5);
    expect(recencyWeight(56, 28)).toBeCloseTo(0.25);
  });
});

// ─── EXTRACCIÓN DEL HISTORIAL ───────────────────────────────────────────────

describe("extractViandaHistory", () => {
  it("suma unidades por producto y por día", () => {
    const { byProduct, byDate } = extractViandaHistory([
      sale("2026-08-03", [item("m1", 4), item("m2", 2)]),
      sale("2026-08-03", [item("m1", 1)]),
    ], PRODUCTS);
    expect(byProduct.get("m1").get("2026-08-03")).toBe(5);
    expect(byProduct.get("m2").get("2026-08-03")).toBe(2);
    expect(byDate.get("2026-08-03")).toBe(7);
  });

  it("expande los kits a sus componentes y no cuenta el kit como demanda propia", () => {
    const { byProduct } = extractViandaHistory([
      sale("2026-08-03", [{ productId: "kit", qty: 3, kitItems: [{ productId: "m1", qty: 1 }], category: "Viandas" }]),
    ], PRODUCTS);
    expect(byProduct.get("m1").get("2026-08-03")).toBe(3);
    expect(byProduct.has("kit")).toBe(false);
  });

  it("ignora las ventas canceladas", () => {
    const { byDate } = extractViandaHistory([
      sale("2026-08-03", [item("m1", 5)], { status: "cancelled" }),
    ], PRODUCTS);
    expect(byDate.size).toBe(0);
  });

  it("ignora los productos que no son viandas", () => {
    const { byProduct } = extractViandaHistory([
      sale("2026-08-03", [item("pan", 9, "Panadería")]),
    ], PRODUCTS);
    expect(byProduct.has("pan")).toBe(false);
  });

  it("usa la fecha de entrega cuando el pedido la declara", () => {
    expect(demandDateOf({ createdAt: "2026-08-07T15:00:00Z", deliveryDate: "2026-08-10" })).toBe("2026-08-10");
    expect(demandDateOf({ createdAt: "2026-08-07T15:00:00Z", deliveryDate: null })).toBe("2026-08-07");

    const { byProduct } = extractViandaHistory([
      sale("2026-08-07", [item("m1", 6)], { deliveryDate: "2026-08-10" }),
    ], PRODUCTS);
    expect(byProduct.get("m1").get("2026-08-10")).toBe(6);
  });
});

// ─── FACTORES ───────────────────────────────────────────────────────────────

describe("factores", () => {
  it("detecta que un día de la semana vende más que el promedio", () => {
    const byDate = new Map();
    // 8 lunes con 20 y 8 miércoles con 10
    for (let i = 0; i < 8; i++) {
      byDate.set(addDays("2026-06-01", i * 7), 20);      // lunes
      byDate.set(addDays("2026-06-03", i * 7), 10);      // miércoles
    }
    const f = dowFactors(byDate);
    expect(f[1]).toBeGreaterThan(f[3]);   // lunes > miércoles
    expect(f[1]).toBeGreaterThan(1);
  });

  it("devuelve 1 para los días de semana sin datos", () => {
    const f = dowFactors(new Map([["2026-08-03", 10]]));
    expect(f[6]).toBe(1); // ningún sábado observado
  });

  it("no inventa estacionalidad mensual sin historial", () => {
    const f = monthFactors(new Map([["2026-08-03", 10]]), Array(7).fill(1));
    expect(f[0]).toBe(1); // enero sin datos
  });

  it("detecta una tendencia de crecimiento", () => {
    const byDate = new Map();
    for (let i = 1; i <= 80; i++) {
      byDate.set(addDays("2026-08-07", -i), i < 28 ? 30 : 15);
    }
    expect(trendFactor(byDate, "2026-08-07")).toBeGreaterThan(1.1);
  });

  it("no aplica tendencia si falta uno de los dos períodos", () => {
    const byDate = new Map([["2026-08-06", 20]]);
    expect(trendFactor(byDate, "2026-08-07")).toBe(1);
  });
});

// ─── PROYECCIÓN ─────────────────────────────────────────────────────────────

/** Historial sintético: `weeks` lunes seguidos vendiendo `qty` del menú m1. */
const mondaySales = (weeks, qty, lastMonday = "2026-08-03") =>
  Array.from({ length: weeks }, (_, i) => sale(addDays(lastMonday, -7 * i), [item("m1", qty)]));

describe("forecastMenu", () => {
  it("proyecta el nivel observado cuando la demanda es estable", () => {
    const ctx = buildForecastContext(mondaySales(10, 20), PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "m1", productName: "Menú 1", date: "2026-08-10" });
    expect(r.forecast).toBe(20);
    expect(r.confidence).toBe("alta");
  });

  it("no cuenta dos veces el efecto del día: un menú que solo se vende los lunes no se infla", () => {
    // m1 solo los lunes (20 u.), m2 todos los miércoles (5 u.) ⇒ el lunes es un
    // día "fuerte" a nivel categoría. Sin desestacionalizar, m1 daría >20.
    const sales = [
      ...mondaySales(10, 20),
      ...Array.from({ length: 10 }, (_, i) => sale(addDays("2026-08-05", -7 * i), [item("m2", 5)])),
    ];
    const ctx = buildForecastContext(sales, PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "m1", date: "2026-08-10" });
    expect(r.factors.dow).toBeGreaterThan(1);      // el lunes efectivamente pesa más
    expect(r.forecast).toBeGreaterThanOrEqual(18); // pero la proyección no se dispara
    expect(r.forecast).toBeLessThanOrEqual(22);
  });

  it("le da más peso a las ventas recientes que a las viejas", () => {
    // Bajó de 30 a 10 hace poco: la proyección debe acercarse a 10, no al promedio 20.
    const sales = [
      ...Array.from({ length: 4 }, (_, i) => sale(addDays("2026-08-03", -7 * i), [item("m1", 10)])),
      ...Array.from({ length: 8 }, (_, i) => sale(addDays("2026-07-06", -7 * i), [item("m1", 30)])),
    ];
    const ctx = buildForecastContext(sales, PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "m1", date: "2026-08-10" });
    expect(r.forecast).toBeLessThan(20);
  });

  it("no cuenta como cero los días en que el menú no se ofreció", () => {
    // 3 lunes de 20 en 3 meses: si los días sin oferta contaran, daría ~1.
    const sales = mondaySales(3, 20).map((s, i) => sale(addDays("2026-08-03", -28 * i), [item("m1", 20)]));
    const ctx = buildForecastContext(sales, PRODUCTS, [], "2026-08-07");
    expect(forecastMenu(ctx, { productId: "m1", date: "2026-08-10" }).forecast).toBeGreaterThan(12);
  });

  it("nunca recomienda producir menos de lo que proyecta vender", () => {
    const ctx = buildForecastContext(mondaySales(10, 20), PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "m1", date: "2026-08-10" });
    expect(r.recommended).toBeGreaterThanOrEqual(r.forecast);
  });

  it("castiga la proyección de un feriado", () => {
    const ctx = buildForecastContext(mondaySales(10, 20), PRODUCTS, [], "2026-08-07");
    const normal = forecastMenu(ctx, { productId: "m1", date: "2026-08-10" });
    const feriado = forecastMenu(ctx, { productId: "m1", date: "2026-08-17" }); // San Martín
    expect(feriado.factors.holiday).toBe(true);
    expect(feriado.forecast).toBeLessThan(normal.forecast);
  });

  it("estima un menú nuevo con el promedio de la categoría y lo marca como incierto", () => {
    const ctx = buildForecastContext(mondaySales(10, 20), PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "menu-nuevo", productName: "Menú nuevo", date: "2026-08-10" });
    expect(r.coldStart).toBe(true);
    expect(r.confidence).toBe("baja");
    expect(r.forecast).toBeGreaterThan(0);
  });

  it("devuelve 0 sin historial alguno, en vez de romper", () => {
    const ctx = buildForecastContext([], PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "m1", date: "2026-08-10" });
    expect(r.forecast).toBe(0);
    expect(r.recommended).toBe(0);
  });

  it("ordena la planificación por fecha e ignora las filas incompletas", () => {
    const ctx = buildForecastContext(mondaySales(10, 20), PRODUCTS, [], "2026-08-07");
    const out = forecastPlan(ctx, [
      { date: "2026-08-11", productId: "m2", productName: "Menú 2" },
      { date: "2026-08-10", productId: "m1", productName: "Menú 1" },
      { date: "2026-08-12", productId: "" },
    ]);
    expect(out.map(r => r.date)).toEqual(["2026-08-10", "2026-08-11"]);
  });
});

// ─── REPARTO DEL TOTAL DEL DÍA ──────────────────────────────────────────────

describe("nivel diario y reparto entre menús", () => {
  /** Historial con `menus` menús distintos por día vendiendo `qty` cada uno. */
  const dailySales = (days, menus, qty, lastDay = "2026-08-06") =>
    Array.from({ length: days }, (_, d) =>
      sale(addDays(lastDay, -d), Array.from({ length: menus }, (_, m) => item(`p${m}`, qty)))
    );

  it("estima el total de viandas de un día promedio", () => {
    const ctx = buildForecastContext(dailySales(40, 5, 6), PRODUCTS, [], "2026-08-07");
    expect(dailyBaseLevel(ctx).value).toBeCloseTo(30, -0.5); // 5 menús × 6 u.
    expect(forecastDayTotal(ctx, "2026-08-10").total).toBeGreaterThan(20);
  });

  it("baja la proyección por menú cuando se programan más menús el mismo día", () => {
    // El total del día es lo estable: repartirlo entre más platos da menos a cada uno.
    const ctx = buildForecastContext(dailySales(40, 4, 10), PRODUCTS, [], "2026-08-07");
    const pocos = forecastPlan(ctx, [
      { date: "2026-08-10", productId: "p0", productName: "A" },
      { date: "2026-08-10", productId: "p1", productName: "B" },
    ]);
    const muchos = forecastPlan(ctx, ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]
      .map(id => ({ date: "2026-08-10", productId: id, productName: id })));
    expect(muchos.find(r => r.productId === "p0").forecast)
      .toBeLessThan(pocos.find(r => r.productId === "p0").forecast);
  });

  it("le da más unidades al menú que históricamente vende más", () => {
    const sales = Array.from({ length: 30 }, (_, d) =>
      sale(addDays("2026-08-06", -d), [item("m1", 20), item("m2", 5)])
    );
    const ctx = buildForecastContext(sales, PRODUCTS, [], "2026-08-07");
    const rows = forecastPlan(ctx, [
      { date: "2026-08-10", productId: "m1", productName: "Menú 1" },
      { date: "2026-08-10", productId: "m2", productName: "Menú 2" },
    ]);
    const fuerte = rows.find(r => r.productId === "m1").forecast;
    const flojo = rows.find(r => r.productId === "m2").forecast;
    expect(fuerte).toBeGreaterThan(flojo * 2);
  });

  it("mantiene el total del día en un rango sensato", () => {
    const ctx = buildForecastContext(dailySales(40, 5, 8), PRODUCTS, [], "2026-08-07"); // 40 u./día
    const rows = forecastPlan(ctx, ["p0", "p1", "p2", "p3", "p4"]
      .map(id => ({ date: "2026-08-10", productId: id, productName: id })));
    const total = rows.reduce((s, r) => s + r.forecast, 0);
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThan(50);
  });

  it("le asigna a un menú nuevo lo que vende un menú promedio", () => {
    const ctx = buildForecastContext(dailySales(40, 4, 10), PRODUCTS, [], "2026-08-07");
    const fallback = 10;
    const nuevo = menuLevel(ctx, "jamas-vendido", fallback);
    expect(nuevo.coldStart).toBe(true);
    expect(nuevo.level).toBeCloseTo(fallback, 1);
  });
});

// ─── CORTE DEL HISTORIAL ────────────────────────────────────────────────────

describe("corte del historial", () => {
  it("ignora las ventas anteriores al 1/6/2026", () => {
    const { byDate } = extractViandaHistory([
      sale("2026-05-31", [item("m1", 40)]),  // sistema todavía inconsistente
      sale("2026-06-01", [item("m1", 10)]),  // primer día confiable
    ], PRODUCTS);
    expect(byDate.has("2026-05-31")).toBe(false);
    expect(byDate.get("2026-06-01")).toBe(10);
    expect(HISTORY_START).toBe("2026-06-01");
  });

  it("permite mover el corte para analizar otro período", () => {
    const { byDate } = extractViandaHistory(
      [sale("2026-04-10", [item("m1", 7)])], PRODUCTS, { from: "2026-01-01" });
    expect(byDate.get("2026-04-10")).toBe(7);
  });

  it("no deja que los datos viejos ensucien la proyección", () => {
    const viejas = Array.from({ length: 20 }, (_, i) => sale(addDays("2026-05-30", -i), [item("m1", 60)]));
    const nuevas = Array.from({ length: 20 }, (_, i) => sale(addDays("2026-08-06", -i), [item("m1", 10)]));
    const ctx = buildForecastContext([...viejas, ...nuevas], PRODUCTS, [], "2026-08-07");
    const r = forecastMenu(ctx, { productId: "m1", date: "2026-08-10" });
    expect(r.forecast).toBeLessThan(20); // ni rastro de los 60 de mayo
  });

  it("deja registrado en el contexto desde cuándo mira", () => {
    expect(buildForecastContext([], PRODUCTS, [], "2026-08-07").historyFrom).toBe(HISTORY_START);
  });
});

// ─── CUÁNTO PRODUCIR ────────────────────────────────────────────────────────

describe("nivel de servicio", () => {
  const estable = (dias, menus, qty) =>
    Array.from({ length: dias }, (_, d) =>
      sale(addDays("2026-08-06", -d), Array.from({ length: menus }, (_, m) => item(`p${m}`, qty))));

  it("calcula percentiles interpolando", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
    expect(quantile([], 0.9)).toBe(null);
    expect(quantile([7], 0.9)).toBe(7);
  });

  it("reparte enteros sin perder ni inventar unidades", () => {
    expect(allocateIntegers([1, 1, 1], 10).reduce((s, v) => s + v, 0)).toBe(10);
    expect(allocateIntegers([3, 1], 8)).toEqual([6, 2]);
    expect(allocateIntegers([0, 0], 5)).toEqual([0, 0]);
  });

  it("pide más colchón cuanto más alto el nivel de servicio", () => {
    const ctx = buildForecastContext(estable(40, 4, 8), PRODUCTS, [], "2026-08-07");
    const m80 = dayCoverageMultiplier(ctx, 80);
    const m95 = dayCoverageMultiplier(ctx, 95);
    expect(m95).toBeGreaterThanOrEqual(m80);
    expect(m80).toBeGreaterThanOrEqual(1);
  });

  it("recomienda más unidades al subir el nivel de servicio", () => {
    // Demanda irregular: el colchón tiene que notarse.
    const irregular = Array.from({ length: 40 }, (_, d) =>
      sale(addDays("2026-08-06", -d), [item("p0", 3 + (d % 7) * 4), item("p1", 5)]));
    const ctx = buildForecastContext(irregular, PRODUCTS, [], "2026-08-07");
    const plan = [{ date: "2026-08-10", productId: "p0", productName: "A" },
                  { date: "2026-08-10", productId: "p1", productName: "B" }];
    const bajo = forecastPlan(ctx, plan, { serviceLevelPct: 75 }).reduce((s, r) => s + r.recommended, 0);
    const alto = forecastPlan(ctx, plan, { serviceLevelPct: 95 }).reduce((s, r) => s + r.recommended, 0);
    expect(alto).toBeGreaterThan(bajo);
  });

  it("nunca recomienda producir menos de lo proyectado", () => {
    const ctx = buildForecastContext(estable(40, 5, 6), PRODUCTS, [], "2026-08-07");
    const rows = forecastPlan(ctx, ["p0", "p1", "p2"].map(id => ({ date: "2026-08-10", productId: id, productName: id })));
    for (const r of rows) expect(r.recommended).toBeGreaterThanOrEqual(r.forecast);
  });

  it("decide el colchón sobre el día entero, no sobre cada plato", () => {
    // Un plato con demanda muy errática no debe inflar la producción por sí solo:
    // si falta, el cliente elige otro menú del día.
    const errático = Array.from({ length: 40 }, (_, d) =>
      sale(addDays("2026-08-06", -d), [item("p0", d % 10 === 0 ? 40 : 2), item("p1", 8)]));
    const ctx = buildForecastContext(errático, PRODUCTS, [], "2026-08-07");
    const rows = forecastPlan(ctx, [
      { date: "2026-08-10", productId: "p0", productName: "A" },
      { date: "2026-08-10", productId: "p1", productName: "B" },
    ], { serviceLevelPct: 90 });
    const fila = rows.find(r => r.productId === "p0");
    // Cubrir ese plato solo pediría bastante más de lo que se termina produciendo.
    expect(fila.coverage.soloEstePlato).toBeGreaterThan(fila.recommended);
  });

  it("el total a producir del día es el cupo repartido", () => {
    const ctx = buildForecastContext(estable(40, 4, 9), PRODUCTS, [], "2026-08-07");
    const rows = forecastPlan(ctx, ["p0", "p1", "p2", "p3"].map(id => ({ date: "2026-08-10", productId: id, productName: id })));
    const total = rows.reduce((s, r) => s + r.recommended, 0);
    expect(total).toBeGreaterThanOrEqual(rows[0].coverage.dayQuota - rows.length);
  });

  it("un menú sin historial se apoya en la dispersión general", () => {
    const ctx = buildForecastContext(estable(40, 4, 9), PRODUCTS, [], "2026-08-07");
    expect(coverageMultiplier(ctx, "nunca-vendido", 90).source).toBe("general");
  });
});

// ─── APRENDIZAJE ────────────────────────────────────────────────────────────

describe("learnedBias", () => {
  const past = (date, productId, forecastQty, actualQty) => ({ date, productId, forecastQty, actualQty });

  it("es neutro sin historial de proyecciones", () => {
    expect(learnedBias([], "m1", "2026-08-07").bias).toBe(1);
  });

  it("corrige hacia arriba cuando el modelo viene quedándose corto", () => {
    const items = Array.from({ length: 10 }, (_, i) => past(addDays("2026-08-03", -7 * i), "m1", 20, 26));
    const { bias } = learnedBias(items, "m1", "2026-08-07");
    expect(bias).toBeGreaterThan(1.1);
  });

  it("ignora los ítems sin venta real cargada", () => {
    const items = [past("2026-07-27", "m1", 20, null), past("2026-08-03", "m1", 20, 30)];
    expect(learnedBias(items, "m1", "2026-08-07").samples).toBe(1);
  });

  it("apoya el sesgo de un menú con pocos datos en el sesgo global", () => {
    const items = [
      ...Array.from({ length: 12 }, (_, i) => past(addDays("2026-08-03", -7 * i), "m2", 20, 24)),
      past("2026-08-03", "m1", 20, 60), // un outlier aislado de m1
    ];
    const { bias, biasGlobal } = learnedBias(items, "m1", "2026-08-07");
    expect(biasGlobal).toBeGreaterThan(1);
    expect(bias).toBeLessThan(2); // no arrastra la proyección al outlier
  });

  it("mueve la proyección final cuando se lo alimenta al contexto", () => {
    const sales = mondaySales(10, 20);
    const learning = Array.from({ length: 10 }, (_, i) => past(addDays("2026-08-03", -7 * i), "m1", 20, 28));
    const sin = forecastMenu(buildForecastContext(sales, PRODUCTS, [], "2026-08-07"), { productId: "m1", date: "2026-08-10" });
    const con = forecastMenu(buildForecastContext(sales, PRODUCTS, learning, "2026-08-07"), { productId: "m1", date: "2026-08-10" });
    expect(con.forecast).toBeGreaterThan(sin.forecast);
  });
});

describe("confidenceOf", () => {
  it("exige muestras y consistencia para declarar confianza alta", () => {
    expect(confidenceOf(10, 0.2, false)).toBe("alta");
    expect(confidenceOf(5, 0.5, false)).toBe("media");
    expect(confidenceOf(1, 0.1, false)).toBe("baja");
    expect(confidenceOf(20, 0.9, false)).toBe("media");
    expect(confidenceOf(50, 0.1, true)).toBe("baja"); // arranque en frío
  });
});

describe("accuracyReport", () => {
  it("informa vacío sin datos", () => {
    expect(accuracyReport([]).n).toBe(0);
  });

  it("calcula error medio, sesgo y faltantes de producción", () => {
    const r = accuracyReport([
      { forecastQty: 20, actualQty: 22, recommendedQty: 24 },
      { forecastQty: 10, actualQty: 8, recommendedQty: 12 },
      { forecastQty: 10, actualQty: 15, recommendedQty: 12 }, // se vendió más de lo producido
      { forecastQty: 10, actualQty: null, recommendedQty: 12 }, // sin cerrar: se ignora
    ]);
    expect(r.n).toBe(3);
    expect(r.mape).toBeCloseTo(26.7, 0); // (10% + 20% + 50%) / 3
    expect(r.bias).toBeCloseTo(1.1, 1);
    expect(r.shortages).toBe(1);
  });
});

describe("actualUnitsFor", () => {
  it("lee del historial lo que realmente se vendió ese día", () => {
    const ctx = buildForecastContext([sale("2026-08-03", [item("m1", 17)])], PRODUCTS, [], "2026-08-07");
    expect(actualUnitsFor(ctx, "m1", "2026-08-03")).toBe(17);
    expect(actualUnitsFor(ctx, "m1", "2026-08-04")).toBe(0);
  });
});
