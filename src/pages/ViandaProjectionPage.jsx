/**
 * ViandaProjectionPage — Planificación semanal de menús y proyección de demanda.
 *
 * Flujo:
 *  1. Se elige una semana y se arman los menús de cada día con un dropdown que
 *     lista los productos de la categoría "Viandas".
 *  2. El motor (`utils/viandaForecast.js`) proyecta la demanda de cada menú
 *     programado y recomienda cuánto producir sumando un margen de seguridad.
 *  3. Al guardar, la proyección queda congelada en `vianda_plan_items`.
 *  4. Pasado el día, "Actualizar ventas reales" completa lo efectivamente
 *     vendido; el modelo mide su error y corrige el sesgo de la próxima semana.
 *
 * Props: products, sales, user, showToast, logAction
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Ico, Modal, exportXlsx } from "../shared.jsx";
import {
  VIANDA_CATEGORY, DOW_LABELS,
  mondayOf, weekDays, addDays, dayDiff, todayDayStr, dowOf, isHoliday, fmtDayEs,
  buildForecastContext, forecastPlan, accuracyReport, menuReliability,
} from "../utils/viandaForecast.js";
import { buildLearningDoc } from "../utils/viandaLearningDoc.js";
import {
  fetchViandaPlans, saveViandaPlan, syncActualSales, saveProducedQty,
} from "../utils/viandaPlans.js";

const CONFIDENCE_BADGE = { alta: "badge-green", media: "badge-amber", baja: "badge-red" };
const CONFIDENCE_DOT = { alta: "🟢", media: "🟡", baja: "🔴" };
const DEFAULT_MARGIN = 18;

/** Descarga un texto como archivo. */
const downloadText = (filename, text, mime = "text/markdown;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Fecha corta para la tabla: "Lunes 10/08". */
const fmtDayLabel = (date) => {
  const [, m, d] = date.split("-");
  return `${DOW_LABELS[dowOf(date)]} ${d}/${m}`;
};

export default function ViandaProjectionPage({ products, sales, user, showToast, logAction }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(addDays(todayDayStr(), 7)));
  const [plan, setPlan] = useState({});          // { "YYYY-MM-DD": [productId, …] }
  const [margin, setMargin] = useState(DEFAULT_MARGIN);
  const [savedPlans, setSavedPlans] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(null); // fila con el detalle de factores abierto
  const [learningDoc, setLearningDoc] = useState(null);

  const today = todayDayStr();
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const viandas = useMemo(() => products
    .filter(p => p.category === VIANDA_CATEGORY && p.active && !(p.kitItems?.length))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [products]);

  // ─── Carga inicial de planificaciones guardadas ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchViandaPlans()
      .then(({ plans, items }) => {
        if (cancelled) return;
        setSavedPlans(plans);
        setSavedItems(items);
      })
      .catch(err => showToast("Error al cargar planificaciones: " + err.message, "error"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const currentPlan = useMemo(
    () => savedPlans.find(p => p.weekStart === weekStart) || null,
    [savedPlans, weekStart]);

  const currentItems = useMemo(
    () => savedItems.filter(it => currentPlan && it.planId === currentPlan.id),
    [savedItems, currentPlan]);

  // Al cambiar de semana, se rehidrata la grilla con lo que haya guardado.
  useEffect(() => {
    const grid = {};
    for (const day of weekDays(weekStart)) grid[day] = [];
    for (const it of savedItems) {
      if (grid[it.date]) grid[it.date] = [...grid[it.date], it.productId];
    }
    setPlan(grid);
    setMargin(savedPlans.find(p => p.weekStart === weekStart)?.safetyMarginPct ?? DEFAULT_MARGIN);
  }, [weekStart, savedPlans, savedItems]);

  // ─── Proyección ──────────────────────────────────────────────────────────
  // Los ítems ya cerrados de TODAS las semanas alimentan el sesgo aprendido.
  const ctx = useMemo(
    () => buildForecastContext(sales, products, savedItems, today),
    [sales, products, savedItems, today]);

  const rows = useMemo(() => {
    const flat = days.flatMap(date =>
      (plan[date] || [])
        .filter(Boolean)
        .map(productId => ({
          date, productId,
          productName: products.find(p => p.id === productId)?.name || "—",
        }))
    );
    return forecastPlan(ctx, flat, { safetyMarginPct: Number(margin) || 0 });
  }, [days, plan, products, ctx, margin]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ forecast: acc.forecast + r.forecast, recommended: acc.recommended + r.recommended }),
    { forecast: 0, recommended: 0 }), [rows]);

  /** Unidades proyectadas por día: el número más confiable del modelo. */
  const dayTotals = useMemo(() => {
    const out = {};
    for (const r of rows) {
      out[r.date] ??= { forecast: 0, recommended: 0 };
      out[r.date].forecast += r.forecast;
      out[r.date].recommended += r.recommended;
    }
    return out;
  }, [rows]);

  /** Fiabilidad de cada menú, para mostrarla al momento de elegirlo. */
  const reliability = useMemo(
    () => new Map(viandas.map(p => [p.id, menuReliability(ctx, p.id)])),
    [viandas, ctx]);

  const accuracy = useMemo(() => accuracyReport(savedItems), [savedItems]);
  const pendingSync = useMemo(
    () => savedItems.filter(it => it.actualQty == null && dayDiff(today, it.date) > 0).length,
    [savedItems, today]);

  // ─── Acciones ────────────────────────────────────────────────────────────
  const addMenu = (date) => setPlan(p => ({ ...p, [date]: [...(p[date] || []), ""] }));
  const removeMenu = (date, idx) =>
    setPlan(p => ({ ...p, [date]: (p[date] || []).filter((_, i) => i !== idx) }));
  const setMenu = (date, idx, productId) =>
    setPlan(p => ({ ...p, [date]: (p[date] || []).map((v, i) => i === idx ? productId : v) }));

  /** Copia los menús de la semana anterior, el atajo más pedido al planificar. */
  const copyPreviousWeek = () => {
    const prev = addDays(weekStart, -7);
    const prevItems = savedItems.filter(it => dayDiff(it.date, prev) >= 0 && dayDiff(it.date, prev) < 7);
    if (!prevItems.length) { showToast("La semana anterior no tiene planificación guardada", "error"); return; }
    const grid = Object.fromEntries(days.map(d => [d, []]));
    for (const it of prevItems) {
      const target = addDays(it.date, 7);
      if (grid[target]) grid[target] = [...grid[target], it.productId];
    }
    setPlan(grid);
    showToast("Menús copiados de la semana anterior");
  };

  const save = async () => {
    const duplicated = days.some(d => {
      const ids = (plan[d] || []).filter(Boolean);
      return new Set(ids).size !== ids.length;
    });
    if (duplicated) { showToast("Hay un menú repetido en el mismo día", "error"); return; }
    if (!rows.length) { showToast("Agregá al menos un menú antes de guardar", "error"); return; }

    setSaving(true);
    try {
      const { plan: savedPlan, items } = await saveViandaPlan({
        weekStart,
        safetyMarginPct: Number(margin) || 0,
        rows,
        userEmail: user?.email || "",
        existingPlan: currentPlan,
        existingItems: currentItems,
      });
      setSavedPlans(prev => [savedPlan, ...prev.filter(p => p.id !== savedPlan.id)]);
      setSavedItems(prev => [
        ...prev.filter(it => it.planId !== savedPlan.id),
        ...items,
      ]);
      logAction?.("guardar", "proyección de viandas", `Semana del ${weekStart} — ${items.length} menú(s)`);
      showToast(`Planificación guardada · ${items.length} menú(s)`);
    } catch (err) {
      showToast("Error al guardar: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const syncActuals = async () => {
    setSyncing(true);
    try {
      const updated = await syncActualSales(savedItems, ctx, { today });
      if (!updated.length) { showToast("No hay días cerrados pendientes de registrar", "info"); return; }
      const byId = new Map(updated.map(it => [it.id, it]));
      setSavedItems(prev => prev.map(it => byId.get(it.id) || it));
      showToast(`${updated.length} día(s) cerrados · el modelo ya aprendió de ellos`);
    } catch (err) {
      showToast("Error al registrar ventas reales: " + err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const setProduced = useCallback(async (itemId, value) => {
    const item = savedItems.find(it => it.id === itemId);
    if (!item) return;
    try {
      const updated = await saveProducedQty(item, value);
      setSavedItems(prev => prev.map(it => it.id === updated.id ? updated : it));
    } catch (err) {
      showToast("Error al guardar lo producido: " + err.message, "error");
    }
  }, [savedItems, showToast]);

  const openLearningDoc = () => {
    setLearningDoc(buildLearningDoc({
      plans: savedPlans, items: savedItems, ctx,
      marginPct: Number(margin) || 0, generatedAt: today,
    }));
    logAction?.("ver", "proyección de viandas", "Documento de aprendizaje");
  };

  const exportPlan = () => exportXlsx(
    ["Fecha", "Día", "Menú", "Proyección de ventas", "Cantidad a producir", "Confianza"],
    rows.map(r => [r.date, DOW_LABELS[dowOf(r.date)], r.productName, r.forecast, r.recommended, r.confidence]),
    `proyeccion-viandas-${weekStart}`
  );

  const itemFor = (row) => currentItems.find(it => it.date === row.date && it.productId === row.productId);

  if (loading) return (
    <div className="page"><div className="empty"><div className="empty-icon">📊</div><p>Cargando planificaciones…</p></div></div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Proyección de Viandas</div>
          <div className="page-sub">Planificá los menús de la semana y el sistema estima cuánto producir</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={openLearningDoc}>
            <Ico n="recipes" s={13} /> Documento de aprendizaje
          </button>
          <button className="btn btn-secondary btn-sm" onClick={copyPreviousWeek}>
            <Ico n="copy" s={13} /> Copiar semana anterior
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportPlan} disabled={!rows.length}>
            <Ico n="download" s={13} /> Exportar
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !rows.length}>
            <Ico n="check" s={13} /> {saving ? "Guardando…" : "Guardar planificación"}
          </button>
        </div>
      </div>

      {/* ─── CONTROLES DE SEMANA Y MARGEN ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekStart(w => addDays(w, -7))} title="Semana anterior">
            <Ico n="back" s={15} />
          </button>
          <div style={{ minWidth: 190, textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: ".95em" }}>
              Semana del {fmtDayLabel(weekStart).split(" ")[1]} al {fmtDayLabel(days[6]).split(" ")[1]}
            </div>
            <div style={{ fontSize: ".74em", color: "var(--t4)" }}>
              {currentPlan ? "Planificación guardada" : "Sin guardar"}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekStart(w => addDays(w, 7))} title="Semana siguiente"
            style={{ transform: "rotate(180deg)" }}>
            <Ico n="back" s={15} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="lbl" style={{ whiteSpace: "nowrap" }}>Margen de seguridad</label>
          <input type="number" min="0" max="100" step="1" value={margin}
            onChange={e => setMargin(e.target.value)} style={{ width: 78 }} />
          <span style={{ fontSize: ".85em", color: "var(--t3)" }}>%</span>
        </div>

        <div style={{ flex: 1, minWidth: 200, fontSize: ".8em", color: "var(--t3)", display: "flex", gap: 7, alignItems: "center" }}>
          <Ico n="alert" s={14} c="var(--amber)" />
          El margen se amplía automáticamente en los menús de baja confianza.
        </div>

        <button className="btn btn-blue btn-sm" onClick={syncActuals} disabled={syncing || !pendingSync}>
          <Ico n="refresh" s={13} /> {syncing ? "Registrando…" : `Actualizar ventas reales${pendingSync ? ` (${pendingSync})` : ""}`}
        </button>
      </div>

      {/* ─── PRECISIÓN DEL MODELO ─────────────────────────────────────────── */}
      {accuracy.n > 0 && (
        <div className="stats-row">
          <div className="stat stat-blue">
            <div className="stat-num">{accuracy.hitRate}%</div>
            <div className="stat-label">Proyecciones dentro de ±15%</div>
            <div className="stat-icon">🎯</div>
          </div>
          <div className="stat">
            <div className="stat-num">{accuracy.mape}%</div>
            <div className="stat-label">Error promedio (MAPE)</div>
            <div className="stat-icon">📉</div>
          </div>
          <div className={`stat ${accuracy.bias > 1.1 || accuracy.bias < 0.9 ? "stat-amber" : "stat-green"}`}>
            <div className="stat-num">×{accuracy.bias}</div>
            <div className="stat-label">
              {accuracy.bias > 1.05 ? "Se queda corto: ya se corrige"
                : accuracy.bias < 0.95 ? "Se pasa: ya se corrige"
                : "Sin sesgo apreciable"}
            </div>
            <div className="stat-icon">⚖️</div>
          </div>
          <div className={`stat ${accuracy.shortages > 0 ? "stat-red" : "stat-green"}`}>
            <div className="stat-num">{accuracy.shortages}</div>
            <div className="stat-label">Veces que faltó producción</div>
            <div className="stat-icon">⚠️</div>
          </div>
        </div>
      )}

      {/* ─── PLANIFICACIÓN POR DÍA ────────────────────────────────────────── */}
      <div className="section-title">1 · Menús de la semana</div>
      {!viandas.length && (
        <div className="card" style={{ marginBottom: 20, fontSize: ".85em", color: "var(--t3)" }}>
          No hay productos activos en la categoría <strong>{VIANDA_CATEGORY}</strong>. Cargalos en Productos para poder planificar.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 26 }}>
        {days.map(date => {
          const holiday = isHoliday(date);
          const past = dayDiff(today, date) > 0;
          return (
            <div key={date} className="card card-sm" style={{ opacity: past ? 0.65 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".88em" }}>{DOW_LABELS[dowOf(date)]}</div>
                  <div style={{ fontSize: ".74em", color: "var(--t4)" }}>{date.slice(8)}/{date.slice(5, 7)}</div>
                </div>
                {holiday && <span className="badge badge-red">Feriado</span>}
              </div>

              {(plan[date] || []).map((productId, idx) => {
                const rel = reliability.get(productId);
                return (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      <select value={productId} onChange={e => setMenu(date, idx, e.target.value)} style={{ flex: 1, fontSize: ".84em" }}>
                        <option value="">Elegí un menú…</option>
                        {viandas.map(p => {
                          const r = reliability.get(p.id);
                          return (
                            <option key={p.id} value={p.id}>
                              {CONFIDENCE_DOT[r.confidence]} {p.name} — confianza {r.confidence}
                              {r.samples > 0 ? ` · ${r.samples} día(s) · ~${r.avgUnits} u.` : " · sin historial"}
                            </option>
                          );
                        })}
                      </select>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeMenu(date, idx)} title="Quitar">
                        <Ico n="x" s={13} c="var(--red)" />
                      </button>
                    </div>
                    {rel && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: ".72em", color: "var(--t4)" }}>
                        <span className={`badge ${CONFIDENCE_BADGE[rel.confidence]}`} style={{ fontSize: ".92em", padding: "1px 7px" }}>
                          {rel.confidence}
                        </span>
                        {rel.samples > 0
                          ? <span>{rel.samples} día(s) de historial · ~{rel.avgUnits} u./día</span>
                          : <span>menú nuevo: hereda el promedio</span>}
                      </div>
                    )}
                  </div>
                );
              })}

              <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 4 }}
                onClick={() => addMenu(date)} disabled={!viandas.length}>
                <Ico n="plus" s={12} /> Agregar plato
              </button>

              {dayTotals[date] && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: ".78em", color: "var(--t3)" }}>
                  Proyectado: <strong style={{ color: "var(--t1)" }}>{dayTotals[date].forecast} u.</strong>
                  {" · "}producir <strong style={{ color: "var(--green)" }}>{dayTotals[date].recommended} u.</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── PROYECCIÓN ───────────────────────────────────────────────────── */}
      <div className="section-title">2 · Proyección de demanda</div>
      {!rows.length ? (
        <div className="empty">
          <div className="empty-icon">🍱</div>
          <h3>Todavía no hay menús programados</h3>
          <p>Agregá platos a los días de arriba y la proyección aparece acá.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Fecha</th>
              <th>Menú</th>
              <th style={{ textAlign: "right" }}>Proyección de ventas</th>
              <th style={{ textAlign: "right" }}>Cantidad a producir</th>
              <th>Confianza</th>
              <th style={{ textAlign: "right" }}>Producido</th>
              <th style={{ textAlign: "right" }}>Vendido real</th>
              <th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const key = `${r.date}|${r.productId}`;
                const item = itemFor(r);
                const open = expanded === key;
                const deviation = item?.actualQty != null && r.forecast > 0
                  ? Math.round(((item.actualQty - item.forecastQty) / item.forecastQty) * 100) : null;
                return [
                  <tr key={key}>
                    <td data-label="Fecha" style={{ whiteSpace: "nowrap" }}>
                      {fmtDayLabel(r.date)}
                      {r.factors.holiday && <span className="badge badge-red" style={{ marginLeft: 6 }}>Feriado</span>}
                    </td>
                    <td data-label="Menú" style={{ fontWeight: 600 }}>{r.productName}</td>
                    <td data-label="Proyección" style={{ textAlign: "right", fontWeight: 600 }}>{r.forecast} u.</td>
                    <td data-label="A producir" style={{ textAlign: "right", fontWeight: 700, color: "var(--green)" }}>
                      {r.recommended} u.
                      <div style={{ fontSize: ".72em", color: "var(--t4)", fontWeight: 400 }}>+{r.effectiveMarginPct}%</div>
                    </td>
                    <td data-label="Confianza">
                      <span className={`badge ${CONFIDENCE_BADGE[r.confidence]}`}>{r.confidence}</span>
                      {r.coldStart && <div style={{ fontSize: ".7em", color: "var(--t4)" }}>menú sin historial</div>}
                    </td>
                    <td data-label="Producido" style={{ textAlign: "right", width: 100 }}>
                      {item ? (
                        <input type="number" min="0" defaultValue={item.producedQty ?? ""} placeholder="—"
                          onBlur={e => setProduced(item.id, e.target.value)}
                          style={{ width: 72, textAlign: "right", padding: "5px 8px" }} />
                      ) : <span style={{ color: "var(--t4)" }}>guardá primero</span>}
                    </td>
                    <td data-label="Vendido" style={{ textAlign: "right" }}>
                      {item?.actualQty != null
                        ? <span style={{ fontWeight: 600 }}>
                            {item.actualQty} u.
                            <div style={{ fontSize: ".72em", fontWeight: 400, color: deviation > 0 ? "var(--red)" : "var(--t4)" }}>
                              {deviation > 0 ? "+" : ""}{deviation}% vs. proyectado
                            </div>
                          </span>
                        : <span style={{ color: "var(--t4)" }}>—</span>}
                    </td>
                    <td data-label="">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setExpanded(open ? null : key)} title="Ver cómo se calculó">
                        <Ico n="eye" s={14} />
                      </button>
                    </td>
                  </tr>,
                  open && (
                    <tr key={key + "-detail"}>
                      <td colSpan={8} style={{ background: "var(--s1)", fontSize: ".82em" }}>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                          <span><strong>Total del día</strong> {r.factors.dayTotal} u.</span>
                          <span><strong>Participación</strong> {r.factors.share}%</span>
                          <span><strong>Nivel del menú</strong> {r.factors.level} u. ({r.factors.vsAverage}× el promedio)</span>
                          <span><strong>Día de semana</strong> ×{r.factors.dow}</span>
                          <span><strong>Mes</strong> ×{r.factors.month}</span>
                          <span><strong>Calendario</strong> ×{r.factors.calendar}</span>
                          <span><strong>Tendencia</strong> ×{r.factors.trend}</span>
                          <span><strong>Aprendizaje</strong> ×{r.factors.bias}</span>
                          <span style={{ color: "var(--t4)" }}>· {r.samples} día(s) de historial de este menú</span>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--s2)" }}>
                <td colSpan={2} style={{ fontWeight: 700 }}>Total de la semana</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{totals.forecast} u.</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--green)" }}>{totals.recommended} u.</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {learningDoc && (
        <LearningDocModal doc={learningDoc} onClose={() => setLearningDoc(null)} />
      )}
    </div>
  );
}

// ─── DOCUMENTO DE APRENDIZAJE ─────────────────────────────────────────────────

const INSIGHT_STYLE = {
  acción: { badge: "badge-blue", icon: "⚡" },
  riesgo: { badge: "badge-red", icon: "⚠️" },
  sesgo: { badge: "badge-amber", icon: "⚖️" },
  menú: { badge: "badge-amber", icon: "🍽️" },
  ok: { badge: "badge-green", icon: "✓" },
  info: { badge: "badge-gray", icon: "ℹ️" },
  arranque: { badge: "badge-blue", icon: "🚀" },
};
const READINESS_BADGE = { listo: "badge-green", parcial: "badge-amber", "esperando datos": "badge-gray" };

const pctTxt = (v) => (v == null ? "—" : `${v}%`);

/**
 * Muestra el documento en pantalla y permite bajarlo en Markdown.
 * Es la misma información que `doc.markdown`, dibujada para leer de un vistazo.
 */
function LearningDocModal({ doc, onClose }) {
  const { global: g, readiness: rd } = doc;

  return (
    <Modal title="📘 Documento de aprendizaje — Proyección de Viandas" onClose={onClose} lg>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: ".8em", color: "var(--t3)" }}>
          Generado el {fmtDayEs(doc.generatedAt)} · {doc.period.semanasCerradas} semana(s) cerrada(s)
          {doc.period.desde && ` · desde ${doc.period.desde}`}
        </div>
        <button className="btn btn-primary btn-sm"
          onClick={() => downloadText(`aprendizaje-viandas-${doc.generatedAt}.md`, doc.markdown)}>
          <Ico n="download" s={13} /> Descargar (.md)
        </button>
      </div>

      {/* 1 · Acciones */}
      <div className="section-title">1 · Qué conviene hacer</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
        {doc.insights.map((i, k) => {
          const st = INSIGHT_STYLE[i.tipo] || INSIGHT_STYLE.info;
          return (
            <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px" }}>
              <span style={{ fontSize: "1em", lineHeight: 1.4 }}>{st.icon}</span>
              <div style={{ flex: 1 }}>
                <span className={`badge ${st.badge}`} style={{ marginRight: 7, fontSize: ".72em" }}>{i.tipo}</span>
                <span style={{ fontSize: ".85em", color: "var(--t2)" }}>{i.texto}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2 · Precisión */}
      <div className="section-title">2 · Precisión del modelo</div>
      {g.n === 0 ? (
        <p style={{ fontSize: ".85em", color: "var(--t3)", marginBottom: 22 }}>
          Todavía no hay proyecciones cerradas para medir. El modelo empieza a aprender
          en cuanto registres las ventas reales de una semana ya pasada.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 22 }}>
          {[
            { label: "Error ponderado (WAPE)", value: pctTxt(g.wape), hint: "la métrica honesta" },
            { label: "Dentro de ±15%", value: pctTxt(g.hitRate), hint: `${g.n} proyecciones` },
            { label: "Sesgo medido", value: `×${g.bias ?? "—"}`, hint: g.bias > 1 ? "se vende más" : g.bias < 1 ? "se vende menos" : "sin sesgo" },
            { label: "Corrección aplicada", value: `×${doc.biasAplicado}`, hint: "ya activa en la proyección" },
            { label: "Faltó producción", value: g.shortages, hint: "veces que se agotó" },
            { label: "Proyectado vs. vendido", value: `${g.unidadesProyectadas} / ${g.unidadesVendidas}`, hint: "unidades" },
          ].map(s => (
            <div key={s.label} className="card card-sm">
              <div style={{ fontSize: "1.25em", fontWeight: 700, color: "var(--t1)" }}>{s.value}</div>
              <div style={{ fontSize: ".74em", color: "var(--t3)", marginTop: 2 }}>{s.label}</div>
              <div style={{ fontSize: ".68em", color: "var(--t4)" }}>{s.hint}</div>
            </div>
          ))}
        </div>
      )}

      {/* 3 · Evolución */}
      {doc.weekly.length > 0 && (
        <>
          <div className="section-title">3 · Evolución semana a semana</div>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table>
              <thead><tr>
                <th>Semana</th><th style={{ textAlign: "right" }}>Menús</th>
                <th style={{ textAlign: "right" }}>Proyectado</th><th style={{ textAlign: "right" }}>Vendido</th>
                <th style={{ textAlign: "right" }}>Error</th><th style={{ textAlign: "right" }}>Sesgo</th>
                <th style={{ textAlign: "right" }}>Faltó</th>
              </tr></thead>
              <tbody>
                {doc.weekly.map(w => (
                  <tr key={w.weekStart}>
                    <td data-label="Semana">{w.weekStart}</td>
                    <td data-label="Menús" style={{ textAlign: "right" }}>{w.menus}</td>
                    <td data-label="Proyectado" style={{ textAlign: "right" }}>{w.forecast} u.</td>
                    <td data-label="Vendido" style={{ textAlign: "right", fontWeight: 600 }}>{w.actual} u.</td>
                    <td data-label="Error" style={{ textAlign: "right" }}>{pctTxt(w.wape)}</td>
                    <td data-label="Sesgo" style={{ textAlign: "right" }}>×{w.bias ?? "—"}</td>
                    <td data-label="Faltó" style={{ textAlign: "right", color: w.shortages ? "var(--red)" : "var(--t4)" }}>{w.shortages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4 · Menús */}
      {doc.menus.length > 0 && (
        <>
          <div className="section-title">4 · Comportamiento de cada menú</div>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table>
              <thead><tr>
                <th>Menú</th><th style={{ textAlign: "right" }}>Veces</th>
                <th style={{ textAlign: "right" }}>Proyectado</th><th style={{ textAlign: "right" }}>Vendido</th>
                <th style={{ textAlign: "right" }}>Sesgo</th><th>Confianza</th>
              </tr></thead>
              <tbody>
                {doc.menus.map(m => (
                  <tr key={m.productId}>
                    <td data-label="Menú" style={{ fontWeight: 600 }}>{m.name}</td>
                    <td data-label="Veces" style={{ textAlign: "right" }}>{m.veces}</td>
                    <td data-label="Proyectado" style={{ textAlign: "right" }}>{m.forecast} u.</td>
                    <td data-label="Vendido" style={{ textAlign: "right", fontWeight: 600 }}>{m.actual} u.</td>
                    <td data-label="Sesgo" style={{ textAlign: "right", color: m.bias >= 1.25 ? "var(--red)" : m.bias <= 0.75 ? "var(--amber)" : "var(--t2)" }}>
                      ×{m.bias ?? "—"}
                    </td>
                    <td data-label="Confianza">
                      {m.confidence && <span className={`badge ${CONFIDENCE_BADGE[m.confidence]}`}>{m.confidence}</span>}
                      {m.historial != null && <span style={{ fontSize: ".72em", color: "var(--t4)", marginLeft: 6 }}>{m.historial} día(s)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 5 · Días */}
      {doc.dows.length > 0 && (
        <>
          <div className="section-title">5 · Por día de la semana</div>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table>
              <thead><tr>
                <th>Día</th><th style={{ textAlign: "right" }}>Menús</th>
                <th style={{ textAlign: "right" }}>Vendido</th><th style={{ textAlign: "right" }}>Error</th>
                <th style={{ textAlign: "right" }}>Sesgo</th>
              </tr></thead>
              <tbody>
                {doc.dows.map(d => (
                  <tr key={d.dow}>
                    <td data-label="Día">{d.label}</td>
                    <td data-label="Menús" style={{ textAlign: "right" }}>{d.menus}</td>
                    <td data-label="Vendido" style={{ textAlign: "right" }}>{d.actual} u.</td>
                    <td data-label="Error" style={{ textAlign: "right" }}>{pctTxt(d.wape)}</td>
                    <td data-label="Sesgo" style={{ textAlign: "right" }}>×{d.bias ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 6 · Madurez */}
      <div className="section-title">6 · Madurez del modelo</div>
      <p style={{ fontSize: ".82em", color: "var(--t3)", marginBottom: 10 }}>
        {rd.diasConVenta} días con venta a lo largo de {rd.diasDeHistorial} días · {rd.mesesCubiertos} de 12 meses cubiertos
      </p>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <table>
          <thead><tr><th>Factor</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>
            {rd.factores.map(f => (
              <tr key={f.factor}>
                <td data-label="Factor" style={{ fontWeight: 500 }}>{f.factor}</td>
                <td data-label="Estado"><span className={`badge ${READINESS_BADGE[f.estado]}`}>{f.estado}</span></td>
                <td data-label="Detalle" style={{ color: "var(--t3)" }}>{f.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 7 · Cómo mejora */}
      <div className="section-title">7 · Cómo se hace más preciso con el tiempo</div>
      <ol style={{ fontSize: ".85em", color: "var(--t2)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
        <li><strong>Cerrá cada semana.</strong> Tocar «Actualizar ventas reales» es lo único que el modelo necesita de vos: sin eso no puede medir su error ni corregirse.</li>
        <li><strong>Repetí menús.</strong> Un plato que aparece 8 veces se proyecta con confianza alta; uno que aparece una vez hereda el promedio general.</li>
        <li><strong>Cargá la fecha de entrega correcta.</strong> Si un pedido del viernes es para el lunes, esa demanda es del lunes.</li>
        <li><strong>Anotá los feriados por decreto.</strong> Los puentes turísticos cambian cada año; se agregan en <code>EXTRA_HOLIDAYS</code> dentro de <code>viandaForecast.js</code>.</li>
        <li><strong>Esperá el año completo.</strong> La estacionalidad necesita haber visto cada mes al menos una vez; hasta entonces está neutralizada para no inventar.</li>
      </ol>

      <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--amberl)", border: "1px solid var(--amberlb)", borderRadius: 9, fontSize: ".82em", color: "var(--t2)" }}>
        <strong>Lo que el modelo no puede hacer:</strong> no sabe de cosas que nunca vio
        (un torneo, un cliente grande nuevo). La proyección <em>por plato</em> tiene un techo
        bajo porque cada menú vende pocas unidades y la carta rota — el número confiable es
        el <strong>total del día</strong>.
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary"
          onClick={() => downloadText(`aprendizaje-viandas-${doc.generatedAt}.md`, doc.markdown)}>
          <Ico n="download" s={14} /> Descargar documento
        </button>
      </div>
    </Modal>
  );
}
