/**
 * WeeklyReportPage — Reporte semanal generado desde Supabase RPC.
 *
 * Llama a la función `weekly_report(p_week_start)` y renderiza:
 *  - Resumen de ventas (actual vs anterior, variación %)
 *  - Top 10 productos vendidos
 *  - Clientes nuevos
 *  - Gastos por categoría
 *  - Mayorista vs Minorista
 *  - Métodos de pago
 *  - Cambios de precio en ingredientes
 *  - Cambios de precio en productos (audit_log)
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";
import { $ } from "../shared.jsx";

const PAY_LABELS = { cash: "Efectivo", transfer: "Transferencia", mercadopago: "MercadoPago", account: "Cuenta corriente" };
const CANAL_LABELS = { retail: "Minorista", wholesale: "Mayorista" };

function getMonday(date) {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
}

function VariationBadge({ pct }) {
  if (pct == null) return <span style={{ color: "var(--t4)", fontSize: ".8em" }}>—</span>;
  const up = pct >= 0;
  return (
    <span style={{ fontWeight: 700, fontSize: ".88em", color: up ? "var(--green)" : "var(--red)" }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function ProgressBar({ value, max, color = "var(--accent)" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ flex: 1, height: 6, background: "var(--s2)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 3, transition: "width .3s ease" }} />
    </div>
  );
}

export default function WeeklyReportPage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date().toISOString().slice(0, 10)));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async (ws) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc("weekly_report", { p_week_start: ws });
      if (err) throw err;
      setReport(data);
    } catch (e) {
      setError(e.message || "Error al generar el reporte");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(weekStart); }, [weekStart, fetchReport]);

  const goWeek = (delta) => {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const weekEnd = (() => {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();

  if (loading && !report) return (
    <div className="page">
      <div className="page-header"><div><div className="page-title">Reporte Semanal</div></div></div>
      <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>Generando reporte...</div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div className="page-header"><div><div className="page-title">Reporte Semanal</div></div></div>
      <div className="card" style={{ color: "var(--red)", padding: 20 }}>Error: {error}</div>
    </div>
  );

  if (!report) return null;

  const v = report.ventas || {};
  const actual = v.actual || {};
  const anterior = v.anterior || {};
  const topProds = report.top_productos || [];
  const maxUnits = topProds[0]?.unidades || 1;
  const clientesNuevos = report.clientes_nuevos || [];
  const gastos = report.gastos || {};
  const canales = report.canales || [];
  const metodos = report.metodos_pago || [];
  const ingredientesAct = report.ingredientes_actualizados || [];
  const cambiosPrecios = report.cambios_precios_productos || [];

  const totalVentasMetodos = metodos.reduce((s, m) => s + (m.total || 0), 0);

  return (
    <div className="page">
      {/* Header con navegación de semana */}
      <div className="page-header">
        <div>
          <div className="page-title">Reporte Semanal</div>
          <div className="page-sub">Semana del {fmtDate(weekStart)} al {fmtDate(weekEnd)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => goWeek(-1)}>← Anterior</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(getMonday(new Date().toISOString().slice(0, 10)))}>Esta semana</button>
          <button className="btn btn-secondary btn-sm" onClick={() => goWeek(1)}>Siguiente →</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 8, color: "var(--t4)", fontSize: ".82em" }}>Actualizando...</div>}

      {/* 1. Resumen de ventas */}
      <div className="stats-row">
        <div className="stat stat-blue">
          <div className="stat-num">{$(actual.ingreso || 0)}</div>
          <div className="stat-label">Ingresos</div>
          <div style={{ marginTop: 6 }}>
            <VariationBadge pct={v.variacion_pct} />
            <span style={{ fontSize: ".72em", color: "var(--t4)", marginLeft: 6 }}>vs semana anterior</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-num">{actual.cantidad || 0}</div>
          <div className="stat-label">Ventas</div>
          <div style={{ fontSize: ".72em", color: "var(--t4)", marginTop: 4 }}>Anterior: {anterior.cantidad || 0}</div>
        </div>
        <div className="stat stat-green">
          <div className="stat-num">{$(actual.ticket_promedio || 0)}</div>
          <div className="stat-label">Ticket promedio</div>
          <div style={{ fontSize: ".72em", color: "var(--t4)", marginTop: 4 }}>Anterior: {$(anterior.ticket_promedio || 0)}</div>
        </div>
        <div className="stat stat-red">
          <div className="stat-num">{$(gastos.total || 0)}</div>
          <div className="stat-label">Gastos totales</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {/* 2. Top 10 productos */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 12px" }}>Top 10 productos</div>
          {topProds.length === 0
            ? <div style={{ color: "var(--t4)", fontSize: ".85em" }}>Sin ventas</div>
            : topProds.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 20, fontSize: ".75em", color: "var(--t4)", textAlign: "right" }}>{i + 1}</span>
                <span style={{ flex: 2, fontSize: ".84em", fontWeight: 500 }}>{p.nombre}</span>
                <ProgressBar value={p.unidades} max={maxUnits} />
                <span style={{ width: 40, textAlign: "right", fontSize: ".8em", fontWeight: 700 }}>{Math.round(p.unidades)}</span>
                <span style={{ width: 70, textAlign: "right", fontSize: ".75em", color: "var(--t3)" }}>{$(p.facturado)}</span>
              </div>
            ))
          }
        </div>

        {/* 5. Gastos por categoría */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 12px" }}>Gastos por categoría</div>
          {(gastos.por_categoria || []).length === 0
            ? <div style={{ color: "var(--t4)", fontSize: ".85em" }}>Sin gastos</div>
            : (gastos.por_categoria || []).map((g, i) => {
              const maxG = gastos.por_categoria[0]?.total || 1;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ flex: 2, fontSize: ".84em", fontWeight: 500 }}>{g.categoria || "Otros"}</span>
                  <ProgressBar value={g.total} max={maxG} color="var(--red)" />
                  <span style={{ width: 80, textAlign: "right", fontSize: ".8em", fontWeight: 700 }}>{$(g.total)}</span>
                  <span style={{ width: 30, textAlign: "right", fontSize: ".72em", color: "var(--t4)" }}>×{g.cantidad}</span>
                </div>
              );
            })
          }
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {/* 6. Canales (mayorista vs minorista) */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 12px" }}>Canales de venta</div>
          {canales.length === 0
            ? <div style={{ color: "var(--t4)", fontSize: ".85em" }}>Sin datos</div>
            : canales.map((c, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: i < canales.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: ".9em" }}>{CANAL_LABELS[c.canal] || c.canal}</span>
                  <span style={{ fontWeight: 700 }}>{$(c.ingreso)}</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: ".75em", color: "var(--t3)", marginTop: 4 }}>
                  <span>{c.cantidad} ventas</span>
                  <span>Ticket: {$(c.ticket_promedio)}</span>
                </div>
              </div>
            ))
          }
        </div>

        {/* 7. Métodos de pago */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 12px" }}>Métodos de pago</div>
          {metodos.length === 0
            ? <div style={{ color: "var(--t4)", fontSize: ".85em" }}>Sin datos</div>
            : metodos.map((m, i) => {
              const pct = totalVentasMetodos > 0 ? ((m.total / totalVentasMetodos) * 100).toFixed(1) : 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ flex: 2, fontSize: ".84em", fontWeight: 500 }}>{PAY_LABELS[m.metodo] || m.metodo}</span>
                  <ProgressBar value={m.total} max={metodos[0]?.total || 1} color="var(--accent)" />
                  <span style={{ width: 70, textAlign: "right", fontSize: ".8em", fontWeight: 700 }}>{$(m.total)}</span>
                  <span style={{ width: 40, textAlign: "right", fontSize: ".72em", color: "var(--t4)" }}>{pct}%</span>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* 3. Clientes nuevos */}
      {clientesNuevos.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title" style={{ margin: "0 0 12px" }}>Clientes nuevos ({clientesNuevos.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {clientesNuevos.map((c, i) => (
              <span key={i} style={{
                background: "var(--s2)", padding: "4px 10px", borderRadius: 12,
                fontSize: ".82em", fontWeight: 500
              }}>
                {c.customer_name || c.customer_id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4. Cambios de precio en ingredientes */}
      {ingredientesAct.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title" style={{ margin: "0 0 12px" }}>
            Ingredientes con cambio de precio ({ingredientesAct.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ fontSize: ".82em" }}>
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th style={{ textAlign: "right" }}>Costo actual</th>
                  <th>Unidad</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {ingredientesAct.map((ing, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{ing.nombre}</td>
                    <td style={{ textAlign: "right" }}>{$(Math.round(ing.costo_actual || 0))}</td>
                    <td style={{ color: "var(--t3)" }}>/{ing.unidad}</td>
                    <td style={{ color: "var(--t4)", fontSize: ".9em" }}>{fmtDate(ing.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. Cambios de precio en productos */}
      {cambiosPrecios.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title" style={{ margin: "0 0 12px" }}>
            Cambios de precio en productos ({cambiosPrecios.length})
          </div>
          {cambiosPrecios.map((c, i) => (
            <div key={i} style={{
              padding: "6px 0", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontSize: ".82em" }}>{c.detalle}</span>
              <span style={{ fontSize: ".72em", color: "var(--t4)", whiteSpace: "nowrap", marginLeft: 12 }}>
                {fmtDate(c.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
