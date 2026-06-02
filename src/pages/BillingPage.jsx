/**
 * BillingPage — Gestión de facturación manual.
 *
 * Muestra las ventas marcadas con "Generar factura" (needsBilling=true).
 * Permite marcar cada ítem como "Listo" (facturado) o "Cancelar".
 * Incluye resumen de montos por estado y filtro por período.
 *
 * Props: sales, setSales, showToast
 */
import { useState } from "react";
import { Ico, $ } from "../shared.jsx";
import { supabase } from "../supabase.js";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

export default function BillingPage({ sales, setSales, customers, showToast }) {
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear]   = useState(now.getFullYear());
  const [expandedId, setExpandedId]   = useState(null);

  const toggleExpand = id => setExpandedId(prev => prev === id ? null : id);

  const allBillingSales = sales.filter(s => s.needsBilling);

  const filtered = allBillingSales.filter(s => {
    const d = new Date(s.createdAt);
    return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
  });

  const pending   = filtered.filter(s => s.billingStatus === "pending");
  const done      = filtered.filter(s => s.billingStatus === "done");
  const cancelled = filtered.filter(s => s.billingStatus === "cancelled");

  const totalPending   = pending.reduce((acc, s) => acc + s.total, 0);
  const totalDone      = done.reduce((acc, s) => acc + s.total, 0);
  const totalCancelled = cancelled.reduce((acc, s) => acc + s.total, 0);

  // años disponibles en el historial (más el año actual si no hay datos aún)
  const years = [...new Set(allBillingSales.map(s => new Date(s.createdAt).getFullYear()))].sort((a,b) => b-a);
  if (!years.includes(now.getFullYear())) years.unshift(now.getFullYear());

  const updateStatus = async (saleId, newStatus) => {
    const { error } = await supabase.from("sales")
      .update({ billing_status: newStatus })
      .eq("id", saleId);
    if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
    setSales(prev => prev.map(s => s.id === saleId ? { ...s, billingStatus: newStatus } : s));
    showToast(newStatus === "done" ? "Marcado como facturado ✓" : "Facturación cancelada");
  };

  const fmtDate = iso => new Date(iso).toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" });

  const fmtItems = items => {
    if (!items?.length) return "—";
    const preview = items.slice(0, 2).map(i => `${i.name} ×${i.qty}`).join(", ");
    return items.length > 2 ? `${preview} +${items.length - 2} más` : preview;
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      pending:   { bg:"var(--amberl,#fffbe6)", color:"var(--amber,#d97706)", border:"#fde68a", label:"Pendiente" },
      done:      { bg:"var(--greenl)",         color:"var(--green)",         border:"var(--greenlb)", label:"Facturado" },
      cancelled: { bg:"#fff0f0",               color:"var(--red)",           border:"#fca5a5", label:"Cancelado" },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:99, padding:"2px 10px", fontSize:".74em", fontWeight:700, whiteSpace:"nowrap" }}>
        {s.label}
      </span>
    );
  };

  // orden: pendientes primero, luego por fecha desc
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.billingStatus === "pending" && b.billingStatus !== "pending") return -1;
    if (a.billingStatus !== "pending" && b.billingStatus === "pending") return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Facturación</h2>
      </div>

      {/* Filtro de período */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:".82em", color:"var(--t3)", fontWeight:600 }}>Período:</span>
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(Number(e.target.value))}
          style={{ padding:"5px 10px", borderRadius:7, border:"1px solid var(--border)", background:"var(--s1)", fontSize:".84em" }}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
          style={{ padding:"5px 10px", borderRadius:7, border:"1px solid var(--border)", background:"var(--s1)", fontSize:".84em" }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize:".78em", color:"var(--t4)" }}>
          {filtered.length} venta{filtered.length !== 1 ? "s" : ""} en el período
        </span>
      </div>

      {/* Tarjetas de resumen */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))", gap:12, marginBottom:24 }}>
        <div className="stat-card" style={{ borderLeft:"3px solid var(--amber,#d97706)" }}>
          <div className="stat-label">Pendiente de facturar</div>
          <div className="stat-value" style={{ color:"var(--amber,#d97706)" }}>{$(totalPending)}</div>
          <div className="stat-sub">{pending.length} venta{pending.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="stat-card" style={{ borderLeft:"3px solid var(--green)" }}>
          <div className="stat-label">Facturado</div>
          <div className="stat-value" style={{ color:"var(--green)" }}>{$(totalDone)}</div>
          <div className="stat-sub">{done.length} venta{done.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="stat-card" style={{ borderLeft:"3px solid var(--red)" }}>
          <div className="stat-label">Cancelado</div>
          <div className="stat-value" style={{ color:"var(--red)" }}>{$(totalCancelled)}</div>
          <div className="stat-sub">{cancelled.length} venta{cancelled.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🧾</div>
          <h3>Sin ventas para facturar en este período</h3>
          <p>Al confirmar una venta con "Generar factura" activado, aparece aquí</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>CUIT / CUIL</th>
                <th>Email</th>
                <th>Items</th>
                <th style={{ textAlign:"right" }}>Total</th>
                <th style={{ textAlign:"center" }}>Estado</th>
                <th style={{ textAlign:"center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(s => {
                const cust = customers.find(c => c.id === s.customerId);
                const isExpanded = expandedId === s.id;
                return (
                  <>
                    <tr
                      key={s.id}
                      onClick={() => toggleExpand(s.id)}
                      style={{ cursor:"pointer", background: isExpanded ? "var(--s2)" : undefined }}
                    >
                      <td data-label="Fecha" style={{ whiteSpace:"nowrap", fontSize:".84em", color:"var(--t3)" }}>
                        <span style={{ marginRight:6, fontSize:".8em", color:"var(--t4)" }}>{isExpanded ? "▾" : "▸"}</span>
                        {fmtDate(s.createdAt)}
                      </td>
                      <td data-label="Cliente" style={{ fontWeight:600 }}>{s.customerName}</td>
                      <td data-label="CUIT" style={{ fontSize:".83em", color: cust?.cuit ? "var(--t1)" : "var(--t4)" }}>
                        {cust?.cuit || <span style={{ fontStyle:"italic" }}>—</span>}
                      </td>
                      <td data-label="Email" style={{ fontSize:".83em", color: cust?.email ? "var(--t1)" : "var(--t4)" }}>
                        {cust?.email || <span style={{ fontStyle:"italic" }}>—</span>}
                      </td>
                      <td data-label="Items" style={{ fontSize:".82em", color:"var(--t2)", maxWidth:220 }}>{fmtItems(s.items)}</td>
                      <td data-label="Total" style={{ textAlign:"right", fontWeight:700, color:"var(--green)", whiteSpace:"nowrap" }}>{$(s.total)}</td>
                      <td data-label="Estado" style={{ textAlign:"center" }}><StatusBadge status={s.billingStatus} /></td>
                      <td data-label="" style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
                        {s.billingStatus === "pending" ? (
                          <div style={{ display:"flex", gap:6, justifyContent:"center" }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => updateStatus(s.id, "done")}>
                              <Ico n="check" s={12}/>Listo
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color:"var(--red)", borderColor:"var(--red)" }}
                              onClick={() => updateStatus(s.id, "cancelled")}>
                              <Ico n="x" s={12}/>Cancelar
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize:".78em", color:"var(--t4)" }}>—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.id}-detail`} style={{ background:"var(--s2)" }}>
                        <td data-label="" colSpan={8} style={{ padding:"0 16px 14px 36px" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:".81em" }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign:"left", padding:"6px 8px", color:"var(--t4)", fontWeight:600, borderBottom:"1px solid var(--b2)" }}>Producto</th>
                                <th style={{ textAlign:"center", padding:"6px 8px", color:"var(--t4)", fontWeight:600, borderBottom:"1px solid var(--b2)" }}>Cant.</th>
                                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--t4)", fontWeight:600, borderBottom:"1px solid var(--b2)" }}>P. Unit.</th>
                                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--t4)", fontWeight:600, borderBottom:"1px solid var(--b2)" }}>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(s.items || []).map((item, idx) => (
                                <tr key={idx}>
                                  <td style={{ padding:"5px 8px", color:"var(--t1)" }}>{item.name}</td>
                                  <td style={{ padding:"5px 8px", textAlign:"center", color:"var(--t2)" }}>{item.qty}</td>
                                  <td style={{ padding:"5px 8px", textAlign:"right", color:"var(--t2)" }}>{$(item.price)}</td>
                                  <td style={{ padding:"5px 8px", textAlign:"right", fontWeight:600, color:"var(--t1)" }}>{$(item.price * item.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={3} style={{ padding:"7px 8px", textAlign:"right", fontWeight:700, borderTop:"1px solid var(--b2)", color:"var(--t2)" }}>Total</td>
                                <td style={{ padding:"7px 8px", textAlign:"right", fontWeight:700, borderTop:"1px solid var(--b2)", color:"var(--green)" }}>{$(s.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
