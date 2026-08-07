/**
 * viandaPlans.js — Persistencia de la planificación semanal de viandas.
 *
 * Aísla a la página de los detalles de Supabase: cargar todo, guardar una
 * semana y cerrar el ciclo de aprendizaje registrando lo realmente vendido.
 *
 * Las consultas se limitan a `select / eq / order` y el filtrado fino se hace en
 * memoria: es lo único que soporta el cliente del modo demo, y el volumen es de
 * unas pocas decenas de filas por semana.
 */
import {
  supabase,
  dbToViandaPlan, viandaPlanToDb,
  dbToViandaPlanItem, viandaPlanItemToDb,
} from "../supabase.js";
import { actualUnitsFor, dayDiff, todayDayStr } from "./viandaForecast.js";

/** Carga todas las planificaciones y sus ítems. */
export async function fetchViandaPlans() {
  const [{ data: plans, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    supabase.from("vianda_plans").select("*").order("week_start", { ascending: false }),
    supabase.from("vianda_plan_items").select("*").order("date", { ascending: true }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    plans: (plans || []).map(dbToViandaPlan),
    items: (items || []).map(dbToViandaPlanItem),
  };
}

/**
 * Guarda la planificación de una semana. Reemplaza los ítems de esa semana por
 * los que llegan: borra los que se sacaron, inserta los nuevos y actualiza los
 * que siguen. Los ítems ya cerrados conservan su `actualQty` y su proyección
 * original — recalcularla borraría la evidencia que alimenta el aprendizaje.
 *
 * @param {object} args { weekStart, serviceLevelPct, notes, rows, userEmail, existingPlan, existingItems }
 * @returns {Promise<{plan: object, items: Array}>}
 */
export async function saveViandaPlan({
  weekStart, serviceLevelPct, notes = "", rows = [],
  userEmail = "", existingPlan = null, existingItems = [],
}) {
  const plan = {
    id: existingPlan?.id || crypto.randomUUID(),
    weekStart,
    serviceLevelPct,
    notes,
    createdBy: existingPlan?.createdBy || userEmail,
  };
  const { error: planErr } = await supabase.from("vianda_plans").upsert(viandaPlanToDb(plan));
  if (planErr) throw planErr;

  const keyOf = (r) => `${r.date}|${r.productId}`;
  const previous = new Map(existingItems.map(it => [keyOf(it), it]));

  const items = rows.map(row => {
    const prev = previous.get(keyOf(row));
    // Un ítem ya cerrado no se re-proyecta: se preserva tal cual quedó.
    if (prev && prev.actualQty != null) return { ...prev, planId: plan.id };
    return {
      id: prev?.id || crypto.randomUUID(),
      planId: plan.id,
      date: row.date,
      productId: row.productId,
      productName: row.productName,
      forecastQty: row.forecast,
      recommendedQty: row.recommended,
      producedQty: prev?.producedQty ?? null,
      actualQty: null,
      confidence: row.confidence,
      forecastDetail: {
        factors: row.factors, samples: row.samples,
        coldStart: row.coldStart, coverage: row.coverage,
        serviceLevelPct: row.serviceLevelPct,
      },
    };
  });

  const keptIds = new Set(items.map(i => i.id));
  const removed = existingItems.filter(it => !keptIds.has(it.id));
  for (const it of removed) {
    const { error } = await supabase.from("vianda_plan_items").delete().eq("id", it.id);
    if (error) throw error;
  }

  if (items.length) {
    const { error } = await supabase.from("vianda_plan_items").upsert(items.map(viandaPlanItemToDb));
    if (error) throw error;
  }
  return { plan, items };
}

/**
 * Cierra el ciclo de aprendizaje: para los ítems de días ya pasados sin venta
 * real cargada, la lee del historial de ventas y la persiste. A partir de ahí el
 * modelo puede medir su error y corregir el sesgo.
 *
 * @returns {Promise<Array>} los ítems actualizados (vacío si no había nada que cerrar)
 */
export async function syncActualSales(items, ctx, { today = todayDayStr() } = {}) {
  const pending = items.filter(it => it.actualQty == null && dayDiff(today, it.date) > 0);
  if (!pending.length) return [];

  const updated = pending.map(it => ({ ...it, actualQty: actualUnitsFor(ctx, it.productId, it.date) }));
  const { error } = await supabase.from("vianda_plan_items").upsert(updated.map(viandaPlanItemToDb));
  if (error) throw error;
  return updated;
}

/** Registra cuántas unidades se produjeron finalmente de un menú. */
export async function saveProducedQty(item, producedQty) {
  const updated = { ...item, producedQty: producedQty === "" ? null : Number(producedQty) };
  const { error } = await supabase.from("vianda_plan_items").upsert(viandaPlanItemToDb(updated));
  if (error) throw error;
  return updated;
}
