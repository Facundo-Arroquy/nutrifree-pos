/**
 * WeeklyGoalModal — Objetivo semanal de producción.
 *
 * Muestra:
 *  - Modal popup al iniciar la app dentro del rango horario (una vez por día).
 *  - Banner colapsable persistente debajo del topbar (dentro del rango horario).
 *
 * Props:
 *  - goals         : [{ id, productId, productName, targetQty, unitLabel, sortOrder }]
 *  - stockMovements: [{ productId, qty, type, createdAt }]
 *  - onClose       : fn — cierra el modal (marca "visto hoy")
 *  - showBanner    : boolean — si mostrar el banner permanente
 *  - onToggleBanner: fn — colapsar/expandir banner
 *  - bannerOpen    : boolean
 */
import { useMemo } from "react";

/** Devuelve la fecha del lunes de la semana actual (00:00:00 local). */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 1=Lun…
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Tabla: Producto | Objetivo | Producido esta semana */
function GoalTable({ goals, stockMovements }) {
  const weekStart = useMemo(getWeekStart, []);

  const rows = useMemo(() => {
    return goals.map(g => {
      const produced = stockMovements
        .filter(m =>
          m.type === "production" &&
          m.productId === g.productId &&
          new Date(m.createdAt) >= weekStart
        )
        .reduce((sum, m) => sum + (m.qty || 0), 0);
      const pct = g.targetQty > 0 ? Math.min(100, Math.round((produced / g.targetQty) * 100)) : 0;
      const done = produced >= g.targetQty && g.targetQty > 0;
      return { ...g, produced, pct, done };
    });
  }, [goals, stockMovements, weekStart]);

  if (!rows.length) {
    return (
      <div style={{ textAlign:"center", color:"var(--t4)", padding:"20px 0", fontSize:".84em" }}>
        No hay objetivos cargados para esta semana.
      </div>
    );
  }

  return (
    <div className="table-wrap" style={{ marginBottom:0 }}>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th style={{ textAlign:"center" }}>Objetivo</th>
            <th style={{ textAlign:"center" }}>Producido</th>
            <th style={{ textAlign:"center", width:80 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight:500 }}>
                {r.done && <span style={{ marginRight:5 }}>✅</span>}
                {r.productName}
              </td>
              <td style={{ textAlign:"center", color:"var(--t3)" }}>
                {r.targetQty > 0 ? `${r.targetQty} ${r.unitLabel}`.trim() : r.unitLabel || "–"}
              </td>
              <td style={{ textAlign:"center", fontWeight:r.done ? 700 : 400, color: r.done ? "var(--green)" : "var(--t1)" }}>
                {r.produced > 0 ? r.produced : "–"}
              </td>
              <td style={{ textAlign:"center" }}>
                <span style={{
                  display:"inline-block", padding:"2px 8px", borderRadius:99,
                  fontSize:".75em", fontWeight:700,
                  background: r.done ? "var(--greenl)" : r.pct >= 50 ? "var(--s3)" : "var(--s2)",
                  color: r.done ? "var(--green)" : "var(--t2)",
                }}>
                  {r.pct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Modal popup (aparece al entrar a la app una vez por día). */
export function WeeklyGoalModal({ goals, stockMovements, onClose }) {
  if (!goals || goals.length === 0) return null;
  return (
    <div className="modal-bg">
      <div className="modal" style={{ maxWidth:540 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span>🎯</span> Objetivo semanal de producción
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} title="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ fontSize:".84em", color:"var(--t3)", marginBottom:16 }}>
          Estos son los objetivos de producción para la semana.
        </p>
        <GoalTable goals={goals} stockMovements={stockMovements} />
        <div className="modal-footer" style={{ marginTop:20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/** Banner colapsable que aparece debajo del topbar. */
export function WeeklyGoalBanner({ goals, stockMovements, open, onToggle }) {
  if (!goals || goals.length === 0) return null;
  return (
    <div style={{
      background:"var(--s2)", borderBottom:"1px solid var(--border)",
      transition:"all .2s",
    }}>
      {/* Header siempre visible */}
      <button
        onClick={onToggle}
        style={{
          width:"100%", display:"flex", alignItems:"center", gap:8,
          padding:"8px 20px", background:"none", border:"none", cursor:"pointer",
          color:"var(--t2)", fontSize:".82em", fontWeight:600,
        }}
      >
        <span>🎯</span>
        <span>Objetivo semanal de producción</span>
        <span style={{
          marginLeft:"auto", display:"inline-flex", alignItems:"center",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition:"transform .2s",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>

      {/* Tabla colapsable */}
      {open && (
        <div style={{ padding:"0 20px 14px" }}>
          <GoalTable goals={goals} stockMovements={stockMovements} />
        </div>
      )}
    </div>
  );
}
