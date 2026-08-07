/**
 * viandaForecast.js — Motor de proyección de demanda de viandas.
 *
 * Responde a la pregunta "si programo el menú X para el día D, ¿cuántas unidades
 * voy a vender?" a partir del historial de ventas. No es un promedio: es un
 * modelo multiplicativo desestacionalizado.
 *
 *   proyección = nivel_base × f_día_semana × f_mes × f_calendario × f_tendencia × sesgo
 *
 * Donde:
 *  - `nivel_base`     media exponencialmente ponderada (las ventas recientes pesan
 *                     más) de las observaciones del menú, previamente
 *                     **desestacionalizadas** dividiéndolas por los factores del
 *                     día en que ocurrieron.
 *  - `f_día_semana`   cuánto se vende un lunes vs. un día promedio.
 *  - `f_mes`          estacionalidad anual: invierno/verano, vacaciones.
 *  - `f_calendario`   feriados y puentes (eventos discretos, no estacionales).
 *  - `f_tendencia`    crecimiento o caída del negocio en las últimas semanas.
 *  - `sesgo`          corrección aprendida: cuánto se equivocó el modelo en las
 *                     semanas ya cerradas (proyectado vs. vendido real).
 *
 * Por qué desestacionalizar antes de promediar: un menú que solo se ofrece los
 * lunes tendría su "efecto lunes" ya incorporado en el promedio crudo, y volver a
 * multiplicar por `f_día_semana` lo contaría dos veces. Dividiendo cada
 * observación por los factores de su propio día, el nivel base queda expresado en
 * "unidades de un día promedio" y los factores se aplican una sola vez.
 *
 * Los días en que un menú NO se ofreció no cuentan como demanda cero: solo se
 * promedian los días en que efectivamente estuvo a la venta.
 *
 * El módulo es puro (no toca Supabase ni el DOM) para poder testearlo.
 */

export const VIANDA_CATEGORY = "Viandas";
const AR_TZ = "America/Argentina/Buenos_Aires";

// ─── HELPERS DE FECHA ───────────────────────────────────────────────────────
// Todas las fechas circulan como strings "YYYY-MM-DD". Se parsean al mediodía
// local para que ningún corrimiento de zona horaria cambie el día.

const pad = n => String(n).padStart(2, "0");

/** Convierte un timestamp ISO a la fecha calendario argentina "YYYY-MM-DD". */
export const arDateStr = (iso) => {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
};

export const parseDay = (s) => new Date(`${s}T12:00:00`);
export const toDayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return toDayStr(d); };
export const dayDiff = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 86400000);
export const dowOf = (s) => parseDay(s).getDay();      // 0=domingo … 6=sábado
export const monthOf = (s) => parseDay(s).getMonth();  // 0=enero … 11=diciembre
export const todayDayStr = () => arDateStr(new Date().toISOString());

/** Lunes de la semana a la que pertenece la fecha. */
export const mondayOf = (s) => {
  const d = parseDay(s);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toDayStr(d);
};

/** Los 7 días (lunes→domingo) de la semana que arranca en `weekStart`. */
export const weekDays = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export const DOW_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_LABELS = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-08-10" → "lunes 10 de agosto de 2026". */
export const fmtDayEs = (s) => {
  if (!s) return "";
  const d = parseDay(s);
  return `${DOW_LABELS[d.getDay()].toLowerCase()} ${d.getDate()} de ${MONTH_LABELS[d.getMonth()]} de ${d.getFullYear()}`;
};

// ─── CALENDARIO ARGENTINO ───────────────────────────────────────────────────

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Traslado de los feriados trasladables (Ley 27.399): si caen martes o miércoles
 * pasan al lunes anterior; si caen jueves o viernes, al lunes siguiente.
 */
export const movedHoliday = (dateStr) => {
  const dow = dowOf(dateStr);
  if (dow === 2 || dow === 3) return addDays(dateStr, 1 - dow);
  if (dow === 4 || dow === 5) return addDays(dateStr, 8 - dow);
  return dateStr;
};

/**
 * Feriados nacionales argentinos del año. Los "puentes turísticos" cambian por
 * decreto cada año y no se pueden derivar: se agregan a mano en EXTRA_HOLIDAYS.
 */
export function holidaysFor(year) {
  const easter = easterSunday(year);
  const fixed = [
    `${year}-01-01`, `${year}-03-24`, `${year}-04-02`, `${year}-05-01`,
    `${year}-05-25`, `${year}-06-20`, `${year}-07-09`, `${year}-12-08`, `${year}-12-25`,
  ];
  const movable = [
    addDays(easter, -48), // carnaval lunes
    addDays(easter, -47), // carnaval martes
    addDays(easter, -2),  // viernes santo
  ];
  const transferable = [`${year}-08-17`, `${year}-10-12`, `${year}-11-20`].map(movedHoliday);
  return new Set([...fixed, ...movable, ...transferable, ...EXTRA_HOLIDAYS.filter(d => d.startsWith(String(year)))]);
}

/** Feriados/puentes por decreto que no se derivan de una regla. Editable a mano. */
export const EXTRA_HOLIDAYS = [];

const holidayCache = new Map();
const holidaysCached = (year) => {
  if (!holidayCache.has(year)) holidayCache.set(year, holidaysFor(year));
  return holidayCache.get(year);
};

export const isHoliday = (dateStr) => holidaysCached(Number(dateStr.slice(0, 4))).has(dateStr);

/** Cuánto cae la venta un feriado, y un día "puente" pegado a un feriado. */
export const HOLIDAY_FACTOR = 0.5;
export const BRIDGE_FACTOR = 0.85;

/**
 * Factor de calendario: solo eventos discretos (feriados y puentes). La
 * estacionalidad de temporada la aporta `f_mes`, calculada del historial — meterla
 * también acá la contaría dos veces.
 */
export function calendarFactor(dateStr) {
  if (isHoliday(dateStr)) return HOLIDAY_FACTOR;
  const dow = dowOf(dateStr);
  // Lunes pegado a un feriado martes, o viernes pegado a un feriado jueves.
  if (dow === 1 && isHoliday(addDays(dateStr, 1))) return BRIDGE_FACTOR;
  if (dow === 5 && isHoliday(addDays(dateStr, -1))) return BRIDGE_FACTOR;
  return 1;
}

// ─── HELPERS ESTADÍSTICOS ───────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

/**
 * Encoge una estimación hacia un valor de referencia según cuántas
 * observaciones la respaldan: con pocos datos manda el `target`, con muchos
 * manda el dato crudo. Evita que 2 ventas raras disparen un factor absurdo.
 */
export const shrink = (raw, n, k, target = 1) =>
  (n + k) === 0 ? target : (n * raw + k * target) / (n + k);

/** Peso de una observación por antigüedad: cae a la mitad cada `halfLife` días. */
export const recencyWeight = (ageDays, halfLife) => Math.pow(0.5, Math.max(0, ageDays) / halfLife);

// ─── EXTRACCIÓN DEL HISTORIAL ───────────────────────────────────────────────

const IGNORED_STATUSES = ["cancelled"];

/**
 * Fecha en que la vianda se consumió: la de entrega si el pedido la declara,
 * si no la de carga. Un pedido cargado el viernes para el lunes es demanda del
 * lunes.
 */
export const demandDateOf = (sale) =>
  sale?.deliveryDate ? arDateStr(sale.deliveryDate) : arDateStr(sale?.createdAt);

/**
 * Recorre las ventas y devuelve las unidades de vianda vendidas por producto y
 * por día. Los kits (ej. "Almuerzo y Cena del día") se expanden a sus
 * componentes: el menú vendido dentro de un kit es demanda de ese menú.
 *
 * @returns {{ byProduct: Map<string, Map<string, number>>, byDate: Map<string, number>, menusByDate: Map<string, Set<string>> }}
 */
export function extractViandaHistory(sales = [], products = []) {
  const catalog = new Map(products.map(p => [p.id, p]));
  const byProduct = new Map();
  const byDate = new Map();
  const menusByDate = new Map();

  const isVianda = (productId, fallbackCategory) => {
    const p = catalog.get(productId);
    // Un kit no es demanda propia: sus componentes ya se contaron por separado.
    if (p) return p.category === VIANDA_CATEGORY && !(p.kitItems?.length);
    return fallbackCategory === VIANDA_CATEGORY;
  };

  const add = (productId, date, qty, fallbackCategory) => {
    if (!productId || !date || !(qty > 0)) return;
    if (!isVianda(productId, fallbackCategory)) return;
    if (!byProduct.has(productId)) byProduct.set(productId, new Map());
    const series = byProduct.get(productId);
    series.set(date, (series.get(date) || 0) + qty);
    byDate.set(date, (byDate.get(date) || 0) + qty);
    if (!menusByDate.has(date)) menusByDate.set(date, new Set());
    menusByDate.get(date).add(productId);
  };

  for (const sale of sales) {
    if (!sale || IGNORED_STATUSES.includes(sale.status)) continue;
    const date = demandDateOf(sale);
    if (!date) continue;
    for (const item of sale.items || []) {
      const qty = Number(item?.qty) || 0;
      if (item?.kitItems?.length) {
        for (const comp of item.kitItems) {
          add(comp.productId, date, (Number(comp.qty) || 0) * qty, null);
        }
      } else {
        add(item?.productId, date, qty, item?.category);
      }
    }
  }
  return { byProduct, byDate, menusByDate };
}

// ─── FACTORES ───────────────────────────────────────────────────────────────

/** Cuánto se vende cada día de la semana respecto de un día promedio. */
export function dowFactors(byDate) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const [date, qty] of byDate) if (qty > 0) buckets[dowOf(date)].push(qty);
  const overall = mean(buckets.flat());
  return buckets.map(b =>
    overall > 0 ? clamp(shrink(mean(b) / overall, b.length, 4), 0.6, 1.6) : 1
  );
}

/**
 * Estacionalidad mensual (invierno/verano, vacaciones). Las observaciones se
 * normalizan por el factor de día de semana para que un mes con más lunes no
 * parezca más estacional de lo que es.
 */
export function monthFactors(byDate, fDow) {
  const buckets = Array.from({ length: 12 }, () => []);
  for (const [date, qty] of byDate) {
    if (qty > 0) buckets[monthOf(date)].push(qty / (fDow[dowOf(date)] || 1));
  }
  const overall = mean(buckets.flat());
  return buckets.map(b =>
    overall > 0 ? clamp(shrink(mean(b) / overall, b.length, 3), 0.7, 1.4) : 1
  );
}

/**
 * Tendencia del negocio: promedio diario de las últimas 4 semanas contra las 8
 * anteriores. Captura crecimiento o caída que ningún factor estacional explica.
 */
export function trendFactor(byDate, refDate, { recentDays = 28, priorDays = 84 } = {}) {
  const recent = [], prior = [];
  for (const [date, qty] of byDate) {
    if (!(qty > 0)) continue;
    const age = dayDiff(refDate, date);
    if (age < 0) continue;
    if (age < recentDays) recent.push(qty);
    else if (age < priorDays) prior.push(qty);
  }
  const mr = mean(recent), mp = mean(prior);
  if (!(mr > 0) || !(mp > 0)) return 1;
  return clamp(shrink(mr / mp, Math.min(recent.length, prior.length), 6), 0.75, 1.3);
}

// ─── APRENDIZAJE: SESGO PROYECTADO vs. REAL ─────────────────────────────────

/**
 * Corrección aprendida de semanas ya cerradas: si el modelo viene proyectando
 * 20 y se venden 24, el sesgo es 1.2 y la próxima proyección se corrige.
 *
 * Se estima primero un sesgo global (todas las viandas) y sobre él se encoge el
 * sesgo específico del menú, para que un menú con 2 registros no arrastre la
 * proyección a un extremo.
 *
 * @param {Array} planItems ítems históricos con forecastQty y actualQty cargados
 */
export function learnedBias(planItems = [], productId = null, refDate = todayDayStr(), { halfLifeDays = 45 } = {}) {
  const usable = planItems.filter(it =>
    it && it.actualQty != null && Number(it.forecastQty) > 0 && it.date && dayDiff(refDate, it.date) >= 0
  );
  const ratioStats = (items) => {
    let wSum = 0, wRatio = 0;
    for (const it of items) {
      // Peso por antigüedad y por tamaño: errar 2 sobre 40 informa más que sobre 3.
      const w = recencyWeight(dayDiff(refDate, it.date), halfLifeDays) * Math.sqrt(Number(it.forecastQty));
      wSum += w;
      wRatio += w * (Number(it.actualQty) / Number(it.forecastQty));
    }
    return { n: items.length, ratio: wSum > 0 ? wRatio / wSum : 1 };
  };

  const global = ratioStats(usable);
  const biasGlobal = clamp(shrink(global.ratio, global.n, 5), 0.6, 1.5);
  if (!productId) return { bias: biasGlobal, biasGlobal, samples: global.n };

  const own = ratioStats(usable.filter(it => it.productId === productId));
  const bias = clamp(shrink(own.ratio, own.n, 3, biasGlobal), 0.6, 1.5);
  return { bias, biasGlobal, samples: own.n };
}

// ─── CONTEXTO ───────────────────────────────────────────────────────────────

/**
 * Precalcula todo lo que es común a la semana entera (historial y factores) para
 * no recorrer las ventas una vez por fila de la tabla.
 */
export function buildForecastContext(sales, products, planItems = [], refDate = todayDayStr()) {
  const history = extractViandaHistory(sales, products);
  const fDow = dowFactors(history.byDate);
  const fMonth = monthFactors(history.byDate, fDow);
  const trend = trendFactor(history.byDate, refDate);
  const ctx = { ...history, fDow, fMonth, trend, refDate, planItems };
  ctx.dailyBase = dailyBaseLevel(ctx).value;
  return ctx;
}

// ─── PROYECCIÓN ─────────────────────────────────────────────────────────────
//
// La proyección es "de arriba hacia abajo", y no es un capricho: el negocio rota
// los menús constantemente (la mitad de los platos tiene menos de 3 días de
// historial), pero el total de viandas del día es notablemente estable. Entonces:
//
//   1. Se proyecta el TOTAL de viandas del día — sobre 90+ días de historial.
//   2. Ese total se reparte entre los menús programados según el "peso" de cada
//      uno, o sea cuánto vende comparado con un menú promedio del mismo día.
//
// Un modelo plato-por-plato ignora algo que los datos muestran claramente: si un
// día se ofrecen 6 menús se venden ~8 unidades de cada uno, y si se ofrecen 16 se
// venden ~3, porque el total del día apenas se mueve. Repartir el total captura
// ese efecto; proyectar cada plato por separado, no.

const DAY_HALF_LIFE = 28;   // media vida del nivel diario
const MIX_HALF_LIFE = 60;   // media vida del peso de cada menú (rotan, hay menos datos)
const MIN_SAMPLES_OWN = 2;  // menos observaciones que esto ⇒ arranque en frío
const MIX_SHRINK = 1;       // fuerza del encogimiento del nivel de cada menú
// Cuánto pesa el nivel propio del menú frente al reparto del total del día.
// 0.65 es el valor que minimizó el error en el backtest sobre el historial real,
// y de paso deja el total del día mejor calibrado que cualquiera de los extremos.
const BOTTOM_UP_BLEND = 0.65;
const MIN_WEIGHT = 0.15;    // un menú no puede quedar por debajo del 15% del promedio
const MAX_WEIGHT = 5;       // ni por encima de 5 veces el promedio

/** Media y coeficiente de variación ponderados por recencia. */
function weightedStats(obs) {
  if (!obs.length) return { value: 0, samples: 0, cv: null };
  const wSum = obs.reduce((s, o) => s + o.weight, 0);
  const value = obs.reduce((s, o) => s + o.weight * o.value, 0) / wSum;
  const variance = obs.reduce((s, o) => s + o.weight * (o.value - value) ** 2, 0) / wSum;
  return { value, samples: obs.length, cv: value > 0 ? Math.sqrt(variance) / value : null };
}

/** Unidades de vianda que vende un día promedio, ya desestacionalizado. */
export function dailyBaseLevel(ctx) {
  const obs = [];
  for (const [date, total] of ctx.byDate) {
    const age = dayDiff(ctx.refDate, date);
    if (age < 0 || !(total > 0)) continue;
    const seasonal = (ctx.fDow[dowOf(date)] || 1) * (ctx.fMonth[monthOf(date)] || 1) * calendarFactor(date);
    obs.push({ value: total / (seasonal || 1), weight: recencyWeight(age, DAY_HALF_LIFE) });
  }
  return weightedStats(obs);
}

/**
 * Total de viandas proyectado para un día.
 * @param {number} biasGlobal corrección aprendida a nivel negocio
 */
export function forecastDayTotal(ctx, date, biasGlobal = 1) {
  const level = ctx.dailyBase ?? dailyBaseLevel(ctx).value;
  const fDow = ctx.fDow[dowOf(date)] || 1;
  const fMonth = ctx.fMonth[monthOf(date)] || 1;
  const fCalendar = calendarFactor(date);
  return {
    total: Math.max(0, level * fDow * fMonth * fCalendar * ctx.trend * biasGlobal),
    factors: { level, dow: fDow, month: fMonth, calendar: fCalendar, trend: ctx.trend, bias: biasGlobal },
  };
}

/**
 * Nivel propio de un menú: cuántas unidades vende, en promedio, un día en que se
 * ofrece — desestacionalizado y con las ventas recientes pesando más.
 *
 * Se encoge hacia `fallback` (lo que vendería un menú promedio ese día): un
 * plato con dos apariciones no tiene con qué justificar un nivel propio, y la
 * mitad del catálogo tiene menos de tres. Ese encogimiento es también el
 * arranque en frío: un menú nuevo hereda exactamente el promedio.
 *
 * Se mide en unidades absolutas y no como proporción del día porque en el
 * backtest sobre el historial real resultó ~5% más preciso.
 */
export function menuLevel(ctx, productId, fallback) {
  const stats = menuStats(ctx, productId);
  const coldStart = stats.samples < MIN_SAMPLES_OWN;
  const level = clamp(
    shrink(coldStart ? fallback : stats.value, stats.samples, MIX_SHRINK, fallback),
    fallback * MIN_WEIGHT, fallback * MAX_WEIGHT
  );
  return { level, samples: stats.samples, cv: stats.cv, coldStart };
}

/** Observaciones desestacionalizadas de un menú, ponderadas por recencia. */
function menuStats(ctx, productId) {
  const obs = [];
  for (const [date, qty] of ctx.byProduct.get(productId) || []) {
    const age = dayDiff(ctx.refDate, date);
    if (age < 0 || !(qty > 0)) continue;
    const seasonal = (ctx.fDow[dowOf(date)] || 1) * (ctx.fMonth[monthOf(date)] || 1) * calendarFactor(date);
    obs.push({ value: qty / (seasonal || 1), weight: recencyWeight(age, MIX_HALF_LIFE) });
  }
  return weightedStats(obs);
}

/**
 * Qué tan confiable es la proyección de un menú, sin depender de para qué día se
 * lo programe. Es lo que se muestra al elegirlo en la lista: sirve para saber, en
 * el momento de planificar, cuánto se puede creer el número que va a salir.
 *
 * `avgUnits` son las unidades que vende un día promedio (sin efecto de día ni de
 * temporada); `lastSold`, la última vez que estuvo a la venta.
 */
export function menuReliability(ctx, productId) {
  const stats = menuStats(ctx, productId);
  const series = ctx.byProduct.get(productId);
  const coldStart = stats.samples < MIN_SAMPLES_OWN;
  const dates = series ? [...series.keys()].sort() : [];
  return {
    samples: stats.samples,
    cv: stats.cv,
    coldStart,
    confidence: confidenceOf(stats.samples, stats.cv, coldStart),
    avgUnits: Math.round(stats.value * 10) / 10,
    lastSold: dates.length ? dates[dates.length - 1] : null,
    totalUnits: series ? [...series.values()].reduce((s, v) => s + v, 0) : 0,
  };
}

/** Etiqueta de confianza según cuántas apariciones tuvo el menú y qué tan parejas fueron. */
export function confidenceOf(samples, cv, coldStart) {
  if (coldStart || samples < MIN_SAMPLES_OWN) return "baja";
  if (samples >= 8 && cv != null && cv <= 0.45) return "alta";
  if (samples >= 4 && cv != null && cv <= 0.75) return "media";
  return samples >= 8 ? "media" : "baja";
}

/** Un menú con proyección incierta merece más colchón, no menos. */
const CONFIDENCE_MARGIN_MULT = { alta: 1, media: 1.2, baja: 1.5 };

/**
 * Proyecta la planificación completa: es la entrada principal, porque lo que se
 * vende de un menú depende de con qué otros menús comparte el día.
 *
 * @param {Array} plan filas { date, productId, productName }
 * @param {object} opts { safetyMarginPct, adjustMarginByConfidence }
 * @returns {Array} una fila por menú con proyección, recomendación y factores
 */
export function forecastPlan(ctx, plan = [], {
  safetyMarginPct = 18,
  adjustMarginByConfidence = true,
} = {}) {
  const rows = plan.filter(r => r?.date && r?.productId);
  const { biasGlobal } = learnedBias(ctx.planItems, null, ctx.refDate);

  // Los menús del mismo día compiten por el total: hay que resolverlos juntos.
  const byDay = new Map();
  for (const row of rows) {
    if (!byDay.has(row.date)) byDay.set(row.date, []);
    byDay.get(row.date).push(row);
  }

  const out = [];
  for (const [date, dayRows] of byDay) {
    const day = forecastDayTotal(ctx, date, biasGlobal);
    // Lo que vendería un menú promedio ese día: referencia para encoger los
    // niveles propios y para los menús sin historial.
    const fallback = Math.max(0.01, (ctx.dailyBase ?? 0) / dayRows.length);
    const parts = dayRows.map(row => {
      const mw = menuLevel(ctx, row.productId, fallback);
      const { bias } = learnedBias(ctx.planItems, row.productId, ctx.refDate);
      // El sesgo global ya se aplicó al total del día; acá solo corrige la mezcla.
      const relBias = clamp(bias / (biasGlobal || 1), 0.7, 1.4);
      return { row, mw, bias, effective: mw.level * relBias };
    });
    const sum = parts.reduce((s, p) => s + p.effective, 0) || 1;
    // Reestacionaliza el nivel propio del menú para poder mezclarlo con el reparto.
    const seasonal = day.factors.dow * day.factors.month * day.factors.calendar * day.factors.trend;

    for (const p of parts) {
      const share = p.effective / sum;
      const topDown = day.total * share;                       // el día repartido
      const bottomUp = p.effective * seasonal;                 // el menú por sí solo
      const forecast = Math.max(0, Math.round(BOTTOM_UP_BLEND * bottomUp + (1 - BOTTOM_UP_BLEND) * topDown));
      const confidence = confidenceOf(p.mw.samples, p.mw.cv, p.mw.coldStart);
      const effectiveMarginPct = adjustMarginByConfidence
        ? safetyMarginPct * CONFIDENCE_MARGIN_MULT[confidence]
        : safetyMarginPct;
      out.push({
        productId: p.row.productId,
        productName: p.row.productName || "",
        date,
        forecast,
        recommended: forecast > 0 ? Math.ceil(forecast * (1 + effectiveMarginPct / 100)) : 0,
        confidence,
        coldStart: p.mw.coldStart,
        samples: p.mw.samples,
        effectiveMarginPct: Math.round(effectiveMarginPct * 10) / 10,
        factors: {
          dayTotal: Math.round(day.total),
          share: Math.round(share * 1000) / 10,                    // % del total del día
          level: Math.round(p.mw.level * 10) / 10,                 // unidades propias del menú
          vsAverage: Math.round((p.mw.level / fallback) * 100) / 100, // veces el menú promedio
          dow: Math.round(day.factors.dow * 100) / 100,
          month: Math.round(day.factors.month * 100) / 100,
          calendar: day.factors.calendar,
          trend: Math.round(day.factors.trend * 100) / 100,
          bias: Math.round(p.bias * 100) / 100,
          holiday: isHoliday(date),
        },
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.productName.localeCompare(b.productName));
}

/**
 * Proyección de un único menú. Atajo sobre `forecastPlan`: si ese día se van a
 * ofrecer otros menús hay que pasarlos en `dayPlan`, porque se reparten el total.
 */
export function forecastMenu(ctx, { productId, productName = "", date, dayPlan = null, ...opts }) {
  const plan = dayPlan?.length
    ? dayPlan.map(p => (typeof p === "string" ? { date, productId: p, productName: "" } : { date, ...p }))
    : [{ date, productId, productName }];
  const rows = forecastPlan(ctx, plan, opts);
  return rows.find(r => r.productId === productId);
}

// ─── PRECISIÓN DEL MODELO ───────────────────────────────────────────────────

/**
 * Compara lo proyectado contra lo vendido en las semanas ya cerradas.
 * MAPE = error porcentual absoluto medio; sesgo = tendencia a quedarse corto
 * (>1) o largo (<1).
 */
export function accuracyReport(planItems = []) {
  const usable = planItems.filter(it => it && it.actualQty != null && Number(it.forecastQty) > 0);
  if (!usable.length) return { n: 0, mape: null, bias: null, hitRate: null, shortages: 0 };

  let errSum = 0, ratioSum = 0, hits = 0, shortages = 0;
  for (const it of usable) {
    const f = Number(it.forecastQty), a = Number(it.actualQty);
    errSum += Math.abs(a - f) / f;
    ratioSum += a / f;
    if (Math.abs(a - f) / f <= 0.15) hits++;
    if (it.recommendedQty != null && a > Number(it.recommendedQty)) shortages++;
  }
  return {
    n: usable.length,
    mape: Math.round((errSum / usable.length) * 1000) / 10,   // %
    bias: Math.round((ratioSum / usable.length) * 100) / 100,
    hitRate: Math.round((hits / usable.length) * 1000) / 10,  // % dentro de ±15%
    shortages,                                                // veces que faltó producción
  };
}

/**
 * Unidades realmente vendidas de un menú en una fecha, para cerrar el ciclo de
 * aprendizaje sin que nadie las cargue a mano.
 */
export function actualUnitsFor(ctx, productId, date) {
  return ctx.byProduct.get(productId)?.get(date) ?? 0;
}
