/**
 * BillingPage — Gestión de facturación manual.
 *
 * Muestra las ventas marcadas con "Generar factura" (needsBilling=true).
 * Permite marcar cada ítem como "Listo" (facturado) o "Cancelar".
 * Incluye resumen de montos por estado y filtro por período.
 *
 * Props: sales, setSales, showToast
 */
import { useState, useRef } from "react";
import { Ico, $, useSortable, SortableTh } from "../shared.jsx";
import { supabase } from "../supabase.js";
import { sendInvoiceEmail } from "../utils/emailAlerts.js";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

export default function BillingPage({ sales, setSales, customers, showToast }) {
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear]   = useState(now.getFullYear());
  const [expandedId, setExpandedId]   = useState(null);

  // Panel envío de facturas
  const [sendCustomerId, setSendCustomerId] = useState("");
  const [sendFiles, setSendFiles]           = useState([]);
  const [isDragging, setIsDragging]         = useState(false);
  const [sending, setSending]               = useState(false);
  const fileInputRef                        = useRef(null);

  const customersWithEmail = customers.filter(c => c.email);

  const addFiles = newFiles => {
    const pdfs = Array.from(newFiles).filter(f => f.type === "application/pdf");
    if (pdfs.length !== newFiles.length) showToast("Solo se aceptan archivos PDF", "error");
    setSendFiles(prev => {
      const names = prev.map(f => f.name);
      return [...prev, ...pdfs.filter(f => !names.includes(f.name))];
    });
  };

  const handleDrop = e => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSend = async () => {
    const customer = customers.find(c => c.id === sendCustomerId);
    if (!customer) { showToast("Seleccioná un cliente", "error"); return; }
    if (!customer.email) { showToast("El cliente no tiene email", "error"); return; }
    if (sendFiles.length === 0) { showToast("Agregá al menos un archivo PDF", "error"); return; }
    setSending(true);
    try {
      const uploaded = [];
      for (const file of sendFiles) {
        const path = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
        if (upErr) throw new Error(`No se pudo subir "${file.name}": ${upErr.message}`);
        const { data } = supabase.storage.from("invoices").getPublicUrl(path);
        uploaded.push({ name: file.name, url: data.publicUrl });
      }
      await sendInvoiceEmail(customer, uploaded);
      showToast(`Factura${uploaded.length > 1 ? "s" : ""} enviada${uploaded.length > 1 ? "s" : ""} a ${customer.email} ✓`);
      setSendFiles([]);
      setSendCustomerId("");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSending(false);
    }
  };

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

  const fmtDate = iso => new Date(iso).toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric", timeZone:"America/Argentina/Buenos_Aires" });

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

  const { sortBy, sortDir, toggleSort } = useSortable("createdAt", "desc");

  const sortedFiltered = [...filtered].sort((a, b) => {
    let av, bv;
    if      (sortBy === "createdAt")     { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
    else if (sortBy === "customerName")  { av = a.customerName ?? ""; bv = b.customerName ?? ""; }
    else if (sortBy === "total")         { av = a.total ?? 0; bv = b.total ?? 0; }
    else if (sortBy === "billingStatus") { av = a.billingStatus ?? ""; bv = b.billingStatus ?? ""; }
    else                                 { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
    let v = typeof av === "string" ? av.localeCompare(bv, undefined, { sensitivity:"base" }) : (av - bv);
    return sortDir === "asc" ? v : -v;
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
                <SortableTh col="createdAt" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Fecha</SortableTh>
                <SortableTh col="customerName" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Cliente</SortableTh>
                <th>CUIT / CUIL</th>
                <th>Email</th>
                <th>Items</th>
                <SortableTh col="total" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} align="right">Total</SortableTh>
                <SortableTh col="billingStatus" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort} align="center">Estado</SortableTh>
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

      {/* Panel: Enviar factura por mail */}
      <div style={{ marginTop:32, background:"var(--s1)", border:"1px solid var(--border)", borderRadius:12, padding:"20px 24px" }}>
        <h3 style={{ margin:"0 0 16px", fontSize:"1em", fontWeight:700, display:"flex", alignItems:"center", gap:8 }}>
          <Ico n="mail" s={16}/> Enviar factura por mail
        </h3>

        {/* Selector de cliente */}
        <div style={{ marginBottom:14 }}>
          <label className="lbl">Cliente</label>
          <select
            value={sendCustomerId}
            onChange={e => setSendCustomerId(e.target.value)}
            style={{ width:"100%", maxWidth:340, marginTop:4, padding:"7px 10px", borderRadius:7, border:"1px solid var(--border)", background:"var(--bg1)", fontSize:".88em" }}>
            <option value="">Seleccioná un cliente...</option>
            {customersWithEmail.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
            ))}
          </select>
          {customersWithEmail.length === 0 && (
            <p style={{ fontSize:".78em", color:"var(--t4)", marginTop:4 }}>Ningún cliente tiene email registrado aún.</p>
          )}
        </div>

        {/* Zona drag & drop */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? "var(--primary)" : "var(--border)"}`,
            borderRadius: 10,
            padding: "22px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: isDragging ? "var(--s2)" : "var(--bg1)",
            transition: "all .15s",
            marginBottom: 12,
            maxWidth: 500,
          }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display:"none" }}
            onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
          />
          <div style={{ fontSize:"1.6em", marginBottom:6 }}>📄</div>
          <div style={{ fontSize:".84em", color:"var(--t3)", fontWeight:600 }}>
            {isDragging ? "Soltá los archivos acá" : "Arrastrá PDFs acá o hacé click para buscar"}
          </div>
          <div style={{ fontSize:".75em", color:"var(--t4)", marginTop:3 }}>Solo archivos PDF</div>
        </div>

        {/* Lista de archivos seleccionados */}
        {sendFiles.length > 0 && (
          <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:6, maxWidth:500 }}>
            {sendFiles.map((f, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, background:"var(--s2)", borderRadius:7, padding:"6px 10px", fontSize:".83em" }}>
                <span>📄</span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                <span style={{ color:"var(--t4)", fontSize:".78em" }}>{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={() => setSendFiles(prev => prev.filter((_, j) => j !== i))}
                  style={{ background:"none", border:"none", cursor:"pointer", color:"var(--t4)", padding:"0 2px", fontSize:"1em", lineHeight:1 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={sending || !sendCustomerId || sendFiles.length === 0}>
          {sending ? "Enviando..." : <><Ico n="mail" s={13}/> Enviar{sendFiles.length > 1 ? ` ${sendFiles.length} archivos` : " factura"}</>}
        </button>
      </div>
    </div>
  );
}
