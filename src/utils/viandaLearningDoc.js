/**
 * viandaLearningDoc.js — Documento de aprendizaje de la proyección de viandas.
 *
 * Consolida todo lo que el sistema aprendió comparando lo proyectado contra lo
 * realmente vendido, y lo traduce en acciones concretas. Es la memoria del
 * modelo: cada semana que se cierra lo hace más útil.
 *
 * Devuelve un objeto estructurado (para dibujar en pantalla) y su versión en
 * Markdown (para descargar y compartir). Módulo puro: no toca Supabase ni el DOM.
 */
import {
  DOW_LABELS, dowOf, monthOf, addDays, dayDiff, todayDayStr, fmtDayEs,
  accuracyReport, menuReliability, learnedBias,
} from "./viandaForecast.js";

/** Error porcentual ponderado por volumen: el que corresponde con cantidades chicas. */
export const wape = (items) => {
  const total = items.reduce((s, it) => s + Number(it.actualQty), 0);
  if (!(total > 0)) return null;
  const err = items.reduce((s, it) => s + Math.abs(Number(it.actualQty) - Number(it.forecastQty)), 0);
  return Math.round((err / total) * 1000) / 10;
};

const ratio = (items) => {
  const f = items.reduce((s, it) => s + Number(it.forecastQty), 0);
  const a = items.reduce((s, it) => s + Number(it.actualQty), 0);
  return f > 0 ? Math.round((a / f) * 100) / 100 : null;
};

const closedItems = (items) =>
  items.filter(it => it && it.actualQty != null && Number(it.forecastQty) > 0);

const groupBy = (items, keyFn) => {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
};

/** Lunes de la semana de una fecha, sin depender de la zona horaria. */
const weekOf = (date) => {
  const dow = dowOf(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
};

// ─── SECCIONES ──────────────────────────────────────────────────────────────

/** Precisión semana a semana: muestra si el modelo está mejorando. */
export function weeklyBreakdown(items) {
  const byWeek = groupBy(items, it => weekOf(it.date));
  return [...byWeek.entries()]
    .map(([weekStart, list]) => ({
      weekStart,
      menus: list.length,
      forecast: list.reduce((s, it) => s + Number(it.forecastQty), 0),
      actual: list.reduce((s, it) => s + Number(it.actualQty), 0),
      wape: wape(list),
      bias: ratio(list),
      shortages: list.filter(it => it.recommendedQty != null && Number(it.actualQty) > Number(it.recommendedQty)).length,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Comportamiento de cada menú. Lo importante no es el error puntual sino el
 * sesgo: un menú que siempre vende un 30% más de lo proyectado es información
 * accionable, uno que oscila al azar no.
 */
export function menuBreakdown(items, ctx) {
  const byMenu = groupBy(items, it => it.productId);
  return [...byMenu.entries()]
    .map(([productId, list]) => {
      const rel = ctx ? menuReliability(ctx, productId) : null;
      return {
        productId,
        name: list[list.length - 1].productName,
        veces: list.length,
        forecast: list.reduce((s, it) => s + Number(it.forecastQty), 0),
        actual: list.reduce((s, it) => s + Number(it.actualQty), 0),
        bias: ratio(list),
        wape: wape(list),
        confidence: rel?.confidence ?? null,
        historial: rel?.samples ?? null,
      };
    })
    .sort((a, b) => b.actual - a.actual);
}

/** Qué días de la semana cuestan más de proyectar. */
export function dowBreakdown(items) {
  const byDow = groupBy(items, it => dowOf(it.date));
  return [...byDow.entries()]
    .map(([dow, list]) => ({
      dow: Number(dow),
      label: DOW_LABELS[dow],
      menus: list.length,
      actual: list.reduce((s, it) => s + Number(it.actualQty), 0),
      wape: wape(list),
      bias: ratio(list),
    }))
    .sort((a, b) => (a.dow === 0 ? 7 : a.dow) - (b.dow === 0 ? 7 : b.dow));
}

/**
 * Qué tan "maduro" está el modelo: qué factores ya tienen datos que los
 * respalden y cuáles siguen dormidos esperando historial.
 */
export function dataReadiness(ctx, items) {
  const dates = ctx ? [...ctx.byDate.keys()].sort() : [];
  const months = new Set(dates.map(monthOf));
  const daysOfHistory = dates.length ? dayDiff(dates[dates.length - 1], dates[0]) + 1 : 0;
  const closed = closedItems(items).length;

  const check = (ok, partial = false) => (ok ? "listo" : partial ? "parcial" : "esperando datos");
  return {
    diasDeHistorial: daysOfHistory,
    diasConVenta: dates.length,
    mesesCubiertos: months.size,
    semanasCerradas: new Set(closedItems(items).map(it => weekOf(it.date))).size,
    menusEvaluados: new Set(closedItems(items).map(it => it.productId)).size,
    factores: [
      { factor: "Día de la semana", estado: check(dates.length >= 60, dates.length >= 20),
        detalle: `${dates.length} días con venta registrados` },
      { factor: "Tendencia del negocio", estado: check(daysOfHistory >= 84, daysOfHistory >= 42),
        detalle: `necesita 12 semanas, hay ${Math.floor(daysOfHistory / 7)}` },
      { factor: "Estacionalidad anual", estado: check(months.size >= 12, months.size >= 6),
        detalle: `${months.size} de 12 meses cubiertos` },
      { factor: "Nivel de cada menú", estado: check(dates.length >= 60, dates.length >= 20),
        detalle: `${ctx ? ctx.byProduct.size : 0} menús con historial` },
      { factor: "Corrección por aprendizaje", estado: check(closed >= 40, closed >= 10),
        detalle: `${closed} proyecciones cerradas` },
      { factor: "Feriados y puentes", estado: "listo",
        detalle: "calendario argentino calculado, no requiere historial" },
    ],
  };
}

/** Traduce los números en cosas para hacer. Es la parte que se lee primero. */
export function buildInsights({ global, weekly, menus, dows, readiness, pendingSync, serviceLevelPct }) {
  const out = [];

  if (global.n === 0) {
    out.push({
      tipo: "arranque",
      texto: "Todavía no hay ninguna semana cerrada. Planificá una semana, dejá que pase, y tocá «Actualizar ventas reales»: recién ahí el modelo empieza a corregirse solo.",
    });
    return out;
  }

  if (pendingSync > 0) {
    out.push({
      tipo: "acción",
      texto: `Hay ${pendingSync} día(s) ya pasados sin registrar la venta real. Tocá «Actualizar ventas reales» — cada día que se cierra afina la proyección de la semana siguiente.`,
    });
  }

  if (global.bias > 1.08) {
    out.push({
      tipo: "sesgo",
      texto: `El modelo se queda corto: se vende un ${Math.round((global.bias - 1) * 100)}% más de lo proyectado. Ya lo corrige solo, pero mientras tanto conviene subir el nivel de servicio por encima de ${serviceLevelPct}%.`,
    });
  } else if (global.bias < 0.92) {
    out.push({
      tipo: "sesgo",
      texto: `El modelo se pasa: se vende un ${Math.round((1 - global.bias) * 100)}% menos de lo proyectado. Ya lo corrige solo; si venís tirando comida, bajá el nivel de servicio.`,
    });
  } else {
    out.push({ tipo: "ok", texto: "El modelo no muestra sesgo sistemático: en promedio proyecta lo que efectivamente se vende." });
  }

  if (global.shortages > 0) {
    const pct = Math.round((global.shortages / global.n) * 100);
    out.push({
      tipo: pct > 15 ? "riesgo" : "info",
      texto: `En ${global.shortages} de ${global.n} casos (${pct}%) se vendió más de lo que se recomendó producir de ese menú. Con nivel de servicio ${serviceLevelPct}% eso es esperable y no significa venta perdida: quien no encuentra su plato elige otro. Lo que importa es si faltó comida en el día.`,
    });
  }

  const subestimados = menus.filter(m => m.veces >= 3 && m.bias >= 1.25).slice(0, 5);
  for (const m of subestimados) {
    out.push({
      tipo: "menú",
      texto: `«${m.name}» vende un ${Math.round((m.bias - 1) * 100)}% más de lo proyectado, y es consistente (${m.veces} veces). El modelo ya lo está ajustando; si lo programás, considerá producir de más.`,
    });
  }

  const sobreestimados = menus.filter(m => m.veces >= 3 && m.bias <= 0.75).slice(0, 5);
  for (const m of sobreestimados) {
    out.push({
      tipo: "menú",
      texto: `«${m.name}» vende un ${Math.round((1 - m.bias) * 100)}% menos de lo proyectado (${m.veces} veces). Puede ser un plato que ya no engancha: vale revisarlo o rotarlo.`,
    });
  }

  const peorDia = [...dows].filter(d => d.menus >= 3 && d.wape != null).sort((a, b) => b.wape - a.wape)[0];
  if (peorDia && peorDia.wape > 40) {
    out.push({
      tipo: "info",
      texto: `Los ${peorDia.label.toLowerCase()} son los más difíciles de proyectar (${peorDia.wape}% de error). Si ese día la demanda depende de algo que el sistema no ve (un cliente grande, un evento fijo), conviene ajustarlo a mano.`,
    });
  }

  // ¿Está mejorando? Se compara la primera mitad del período contra la segunda.
  if (weekly.length >= 4) {
    const corte = Math.ceil(weekly.length / 2);
    const media = (ws) => ws.reduce((s, w) => s + (w.wape ?? 0), 0) / ws.length;
    const errIni = media(weekly.slice(0, corte));
    const errFin = media(weekly.slice(corte));
    if (errFin < errIni - 3) {
      out.push({ tipo: "ok", texto: `La proyección está mejorando: el error bajó de ${Math.round(errIni)}% en las primeras semanas a ${Math.round(errFin)}% en las últimas.` });
    } else if (errFin > errIni + 8) {
      out.push({ tipo: "riesgo", texto: `El error creció de ${Math.round(errIni)}% a ${Math.round(errFin)}%. Suele pasar cuando cambia mucho la carta o entra un cliente grande nuevo; se reacomoda en unas semanas.` });
    }
  }

  const dormidos = readiness.factores.filter(f => f.estado !== "listo");
  if (dormidos.length) {
    out.push({
      tipo: "info",
      texto: `Factores que todavía no aportan por falta de historial: ${dormidos.map(f => f.factor.toLowerCase()).join(", ")}. Se activan solos a medida que se acumulan datos.`,
    });
  }

  return out;
}

// ─── DOCUMENTO ──────────────────────────────────────────────────────────────

/**
 * Arma el documento completo.
 *
 * @param {object} args { plans, items, ctx, serviceLevelPct, generatedAt }
 * @returns {object} secciones estructuradas + `markdown`
 */
export function buildLearningDoc({ plans = [], items = [], ctx = null, serviceLevelPct = 90, generatedAt = todayDayStr() }) {
  const closed = closedItems(items);
  const pendingSync = items.filter(it => it.actualQty == null && dayDiff(generatedAt, it.date) > 0).length;

  const global = {
    ...accuracyReport(items),
    wape: wape(closed),
    unidadesProyectadas: closed.reduce((s, it) => s + Number(it.forecastQty), 0),
    unidadesVendidas: closed.reduce((s, it) => s + Number(it.actualQty), 0),
  };
  const weekly = weeklyBreakdown(closed);
  const menus = menuBreakdown(closed, ctx);
  const dows = dowBreakdown(closed);
  const readiness = dataReadiness(ctx, items);
  const biasNow = ctx ? learnedBias(items, null, generatedAt) : { biasGlobal: 1, samples: 0 };
  const insights = buildInsights({ global, weekly, menus, dows, readiness, pendingSync, serviceLevelPct });

  const doc = {
    generatedAt,
    period: {
      desde: weekly.length ? weekly[0].weekStart : null,
      hasta: weekly.length ? weekly[weekly.length - 1].weekStart : null,
      semanasPlanificadas: plans.length,
      semanasCerradas: weekly.length,
    },
    global,
    biasAplicado: biasNow.biasGlobal,
    pendingSync,
    serviceLevelPct,
    historyFrom: ctx?.historyFrom ?? null,
    weekly,
    menus,
    dows,
    readiness,
    insights,
  };
  doc.markdown = renderMarkdown(doc);
  return doc;
}

const n1 = (v) => (v == null ? "—" : String(v));
const pct = (v) => (v == null ? "—" : `${v}%`);

/** Versión descargable y compartible del documento. */
export function renderMarkdown(doc) {
  const L = [];
  L.push("# Proyección de Viandas — Documento de aprendizaje");
  L.push("");
  L.push(`_Generado el ${fmtDayEs(doc.generatedAt)}._`);
  L.push("");
  L.push("Este documento resume lo que el sistema aprendió comparando lo que proyectó");
  L.push("contra lo que realmente se vendió. Se regenera cuando quieras: cada semana");
  L.push("que se cierra lo hace más preciso.");
  L.push("");
  if (doc.historyFrom) {
    L.push(`> El modelo solo mira ventas desde el **${doc.historyFrom}**: antes de esa fecha`);
    L.push("> el sistema no se usaba de forma consistente y esos datos no representan");
    L.push("> demanda real.");
  }
  L.push("");
  L.push(`Nivel de servicio configurado: **${doc.serviceLevelPct}%** — se produce para que la`);
  L.push("comida del día alcance esa proporción de los días.");
  L.push("");

  // 1. Qué mirar primero
  L.push("## 1. Qué conviene hacer");
  L.push("");
  if (!doc.insights.length) L.push("_Sin conclusiones todavía._");
  for (const i of doc.insights) L.push(`- **[${i.tipo}]** ${i.texto}`);
  L.push("");

  // 2. Precisión
  L.push("## 2. Precisión del modelo");
  L.push("");
  if (doc.global.n === 0) {
    L.push("Todavía no hay proyecciones cerradas para medir.");
  } else {
    L.push(`- Proyecciones evaluadas: **${doc.global.n}**`);
    L.push(`- Error ponderado por volumen (WAPE): **${pct(doc.global.wape)}**`);
    L.push(`- Error promedio por menú (MAPE): **${pct(doc.global.mape)}**`);
    L.push(`- Dentro de ±15%: **${pct(doc.global.hitRate)}**`);
    L.push(`- Sesgo: **×${n1(doc.global.bias)}** ${doc.global.bias > 1 ? "(se vende más de lo proyectado)" : doc.global.bias < 1 ? "(se vende menos de lo proyectado)" : ""}`);
    L.push(`- Corrección que el modelo ya está aplicando: **×${n1(doc.biasAplicado)}**`);
    L.push(`- Veces que faltó producción: **${doc.global.shortages}**`);
    L.push(`- Unidades proyectadas vs. vendidas: **${doc.global.unidadesProyectadas}** vs. **${doc.global.unidadesVendidas}**`);
    L.push("");
    L.push("> El WAPE es la métrica honesta acá: el MAPE castiga desproporcionadamente");
    L.push("> los menús que venden 1 o 2 unidades, donde errar por uno ya es 100%.");
  }
  L.push("");

  // 3. Evolución
  L.push("## 3. Evolución semana a semana");
  L.push("");
  if (!doc.weekly.length) {
    L.push("_Sin semanas cerradas todavía._");
  } else {
    L.push("| Semana | Menús | Proyectado | Vendido | Error | Sesgo | Faltó producción |");
    L.push("|---|---:|---:|---:|---:|---:|---:|");
    for (const w of doc.weekly) {
      L.push(`| ${w.weekStart} | ${w.menus} | ${w.forecast} u. | ${w.actual} u. | ${pct(w.wape)} | ×${n1(w.bias)} | ${w.shortages} |`);
    }
  }
  L.push("");

  // 4. Menús
  L.push("## 4. Comportamiento de cada menú");
  L.push("");
  if (!doc.menus.length) {
    L.push("_Sin menús evaluados todavía._");
  } else {
    L.push("| Menú | Veces | Proyectado | Vendido | Sesgo | Error | Confianza | Días de historial |");
    L.push("|---|---:|---:|---:|---:|---:|---|---:|");
    for (const m of doc.menus) {
      L.push(`| ${m.name} | ${m.veces} | ${m.forecast} u. | ${m.actual} u. | ×${n1(m.bias)} | ${pct(m.wape)} | ${n1(m.confidence)} | ${n1(m.historial)} |`);
    }
    L.push("");
    L.push("> Sesgo > 1 = se vende más de lo proyectado. El modelo lo corrige solo a");
    L.push("> partir de 3 apariciones; con menos, se apoya en el sesgo general.");
  }
  L.push("");

  // 5. Días
  L.push("## 5. Por día de la semana");
  L.push("");
  if (!doc.dows.length) {
    L.push("_Sin datos todavía._");
  } else {
    L.push("| Día | Menús | Vendido | Error | Sesgo |");
    L.push("|---|---:|---:|---:|---:|");
    for (const d of doc.dows) {
      L.push(`| ${d.label} | ${d.menus} | ${d.actual} u. | ${pct(d.wape)} | ×${n1(d.bias)} |`);
    }
  }
  L.push("");

  // 6. Madurez
  L.push("## 6. Madurez del modelo");
  L.push("");
  L.push(`Historial disponible: **${doc.readiness.diasConVenta} días con venta** a lo largo de ${doc.readiness.diasDeHistorial} días, ${doc.readiness.mesesCubiertos} mes(es) del año cubiertos.`);
  L.push("");
  L.push("| Factor | Estado | Detalle |");
  L.push("|---|---|---|");
  for (const f of doc.readiness.factores) {
    L.push(`| ${f.factor} | ${f.estado} | ${f.detalle} |`);
  }
  L.push("");

  // 7. Cómo mejora
  L.push("## 7. Cómo se hace más preciso con el tiempo");
  L.push("");
  L.push("1. **Cerrá cada semana.** Tocar «Actualizar ventas reales» es lo único que el");
  L.push("   modelo necesita de vos: sin eso no puede medir su error ni corregirse.");
  L.push("2. **Repetí menús.** Un plato que aparece 8 veces se proyecta con confianza alta;");
  L.push("   uno que aparece una vez hereda el promedio general. Una carta con rotación");
  L.push("   sobre un núcleo estable se proyecta mucho mejor que una que cambia entera.");
  L.push("3. **Cargá las ventas con la fecha de entrega correcta.** El modelo usa");
  L.push("   `delivery_date` cuando existe: si un pedido del viernes es para el lunes, esa");
  L.push("   demanda es del lunes.");
  L.push("4. **Anotá los feriados no derivables.** Los puentes turísticos cambian por");
  L.push("   decreto cada año; se agregan en `EXTRA_HOLIDAYS` dentro de `viandaForecast.js`.");
  L.push("5. **Esperá el año completo.** La estacionalidad (invierno, verano, vacaciones)");
  L.push("   necesita haber visto cada mes al menos una vez. Hasta entonces está");
  L.push("   deliberadamente neutralizada para no inventar.");
  L.push("");
  L.push("### Qué no puede hacer el modelo");
  L.push("");
  L.push("- No sabe de cosas que nunca vio: un torneo, un corte de luz, un cliente nuevo");
  L.push("  grande. Ante un evento conocido, ajustá a mano.");
  L.push("- La proyección **por plato** tiene un techo bajo, porque cada menú vende pocas");
  L.push("  unidades y el catálogo rota. El número confiable es el **total del día**.");
  L.push("- No decide qué cocinar: dice cuánto de lo que ya decidiste.");
  L.push("");

  return L.join("\n");
}
