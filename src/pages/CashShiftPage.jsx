/**
 * CashShiftPage — Gestión de turnos de caja.
 *
 * Estados posibles:
 *  - Sin turno: botón para abrir turno (registra responsable y efectivo inicial)
 *  - Turno abierto: dashboard en tiempo real con ventas, cobros de CC y egresos
 *    del período. Calcula efectivo esperado = inicial + efectivo + cobros CC − egresos.
 *  - Cerrar turno: ingreso del efectivo contado → diferencia calculada en vivo.
 *
 * Al cerrar, persiste todos los totales en cash_shifts con status="closed".
 * El historial muestra todos los turnos cerrados previos.
 *
 * Props: sales, expenses, accountPayments, user, cashShifts, setCashShifts, showToast
 */
import { useState } from "react";
import { Ico, Modal, $, fmtDT, fmtTime, PAY_LABELS } from "../shared.jsx";
import { supabase, cashShiftToDb } from "../supabase.js";

export default function CashShiftPage({ sales, expenses, accountPayments, user, cashShifts, setCashShifts, showToast }) {
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openForm, setOpenForm] = useState({ initialCash: "" });
  const [closeForm, setCloseForm] = useState({ countedCash: "", notes: "" });

  const openShift = cashShifts.find(s => s.status === "open") || null;
  const shiftStart = openShift ? new Date(openShift.openedAt) : null;

  // Ventas del turno (cerradas/entregadas)
  const shiftSales = openShift
    ? sales.filter(s => new Date(s.createdAt) >= shiftStart && ["closed","delivered"].includes(s.status))
    : [];
  const sCash     = shiftSales.filter(s => s.paymentMethod === "cash").reduce((sum,s) => sum + s.total, 0);
  const sTransfer = shiftSales.filter(s => s.paymentMethod === "transfer").reduce((sum,s) => sum + s.total, 0);
  const sCard     = shiftSales.filter(s => s.paymentMethod === "card").reduce((sum,s) => sum + s.total, 0);
  const sAccount  = shiftSales.filter(s => s.paymentMethod === "account").reduce((sum,s) => sum + s.total, 0);

  // Cobros de cuenta corriente durante el turno (pagos reales de deuda)
  const shiftAccPayments = openShift
    ? accountPayments.filter(p => p.type === "payment" && p.createdAt && new Date(p.createdAt) >= shiftStart)
    : [];
  const apCash     = shiftAccPayments.filter(p => p.paymentMethod === "cash").reduce((sum,p) => sum + p.amount, 0);
  const apTransfer = shiftAccPayments.filter(p => p.paymentMethod === "transfer").reduce((sum,p) => sum + p.amount, 0);
  const apCard     = shiftAccPayments.filter(p => p.paymentMethod === "card").reduce((sum,p) => sum + p.amount, 0);

  // Todos los gastos registrados durante el turno (independientemente del método)
  const shiftExpenses = openShift
    ? expenses.filter(e => e.createdAt && new Date(e.createdAt) >= shiftStart)
    : [];
  // Solo los pagados en efectivo reducen el cajón
  const eCash     = shiftExpenses.filter(e => e.paymentMethod === "cash").reduce((sum,e) => sum + (e.total || 0), 0);
  const eTransfer = shiftExpenses.filter(e => e.paymentMethod === "transfer").reduce((sum,e) => sum + (e.total || 0), 0);

  // Efectivo esperado = inicial + ventas ef. + cobros ef. − egresos ef.
  const expectedCash = openShift ? openShift.initialCash + sCash + apCash - eCash : 0;

  const countedCash = Number(closeForm.countedCash) || 0;
  const diff = countedCash - expectedCash;

  const doOpenShift = async () => {
    const initial = Number(openForm.initialCash) || 0;
    const shift = {
      id: crypto.randomUUID(), openedBy: user.name,
      openedAt: new Date().toISOString(), closedAt: null,
      status: "open", initialCash: initial,
      salesCash: 0, salesTransfer: 0, salesCard: 0, salesAccount: 0,
      expensesCash: 0, expectedCash: initial, countedCash: 0, difference: 0, notes: null,
    };
    const { error } = await supabase.from("cash_shifts").insert(cashShiftToDb(shift));
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setCashShifts(prev => [shift, ...prev]);
    setOpenModal(false);
    setOpenForm({ initialCash: "" });
    showToast("Turno abierto ✓");
  };

  const doCloseShift = async () => {
    if (closeForm.countedCash === "") { showToast("Ingresá el efectivo contado", "error"); return; }
    const counted = Number(closeForm.countedCash);
    const updated = {
      ...openShift, closedAt: new Date().toISOString(), status: "closed",
      salesCash: sCash + apCash,
      salesTransfer: sTransfer + apTransfer,
      salesCard: sCard + apCard,
      salesAccount: sAccount,
      expensesCash: eCash, expectedCash, countedCash: counted,
      difference: counted - expectedCash, notes: closeForm.notes || null,
    };
    const { error } = await supabase.from("cash_shifts").update(cashShiftToDb(updated)).eq("id", openShift.id);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setCashShifts(prev => prev.map(s => s.id === openShift.id ? updated : s));
    setCloseModal(false);
    setCloseForm({ countedCash: "", notes: "" });
    showToast("Turno cerrado ✓");
  };

  const closedShifts = cashShifts.filter(s => s.status === "closed");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Cierre de Caja</div>
          <div className="page-sub">{openShift ? "Turno en curso" : "Sin turno abierto"}</div>
        </div>
        {openShift
          ? <button className="btn btn-danger" onClick={() => setCloseModal(true)}><Ico n="x" s={14}/>Cerrar turno</button>
          : <button className="btn btn-primary" onClick={() => setOpenModal(true)}><Ico n="plus" s={14}/>Abrir turno</button>
        }
      </div>

      {!openShift && (
        <div className="empty" style={{ marginBottom: 24 }}>
          <div className="empty-icon">💵</div>
          <h3>No hay turno abierto</h3>
          <p>Abrí un turno para comenzar a registrar la caja</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setOpenModal(true)}><Ico n="plus" s={14}/>Abrir turno</button>
        </div>
      )}

      {openShift && (
        <>
          {/* Banner apertura */}
          <div style={{ background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:"var(--rl)", padding:"14px 20px", marginBottom:22, display:"flex", alignItems:"center", gap:16 }}>
            <Ico n="clock" s={20} c="var(--green)"/>
            <div>
              <div style={{ fontWeight:700, color:"var(--green)" }}>Turno abierto desde {fmtDT(openShift.openedAt)}</div>
              <div style={{ fontSize:".82em", color:"var(--t3)", marginTop:2 }}>Responsable: <b>{openShift.openedBy}</b> · Efectivo inicial: <b>{$(openShift.initialCash)}</b></div>
            </div>
          </div>

          {/* Dos paneles: EFECTIVO | DIGITAL */}
          <div className="resp-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:22 }}>

            {/* Panel EFECTIVO */}
            <div style={{ background:"var(--s0)", border:"2px solid var(--greenlb)", borderRadius:"var(--rl)", padding:20 }}>
              <div style={{ fontSize:".68em", fontWeight:800, textTransform:"uppercase", letterSpacing:".8px", color:"var(--green)", marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>
                💵 Efectivo (Caja)
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"var(--t3)", fontSize:".85em" }}>Inicial</span>
                  <span style={{ fontWeight:600 }}>{$(openShift.initialCash)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"var(--t3)", fontSize:".85em" }}>+ Ventas en efectivo</span>
                  <span style={{ fontWeight:700, color:"var(--green)" }}>{$(sCash)}</span>
                </div>
                {apCash > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ color:"var(--t3)", fontSize:".85em" }}>+ Cobros de cuenta (ef.)</span>
                    <span style={{ fontWeight:700, color:"var(--green)" }}>{$(apCash)}</span>
                  </div>
                )}
                {eCash > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ color:"var(--t3)", fontSize:".85em" }}>− Egresos en efectivo</span>
                    <span style={{ fontWeight:700, color:"var(--red)" }}>{$(eCash)}</span>
                  </div>
                )}
                <div style={{ height:1, background:"var(--greenlb)", margin:"4px 0" }}/>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--amberl)", border:"1px solid var(--amberlb)", borderRadius:8, padding:"10px 14px" }}>
                  <span style={{ fontWeight:700, color:"var(--amber)", fontSize:".9em" }}>Efectivo esperado</span>
                  <span style={{ fontWeight:800, fontSize:"1.35em", color:"var(--amber)" }}>{$(expectedCash)}</span>
                </div>
              </div>
            </div>

            {/* Panel DIGITAL */}
            <div style={{ background:"var(--s0)", border:"2px solid var(--blueb)", borderRadius:"var(--rl)", padding:20 }}>
              <div style={{ fontSize:".68em", fontWeight:800, textTransform:"uppercase", letterSpacing:".8px", color:"var(--blue)", marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>
                📲 Digital (Banco)
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"var(--t3)", fontSize:".85em" }}>Transferencias recibidas</span>
                  <span style={{ fontWeight:700, color:"var(--blue)" }}>{$(sTransfer + apTransfer)}</span>
                </div>
                {apTransfer > 0 && (
                  <div style={{ fontSize:".75em", color:"var(--t4)", textAlign:"right", marginTop:-6 }}>
                    Ventas {$(sTransfer)} + Cobros {$(apTransfer)}
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"var(--t3)", fontSize:".85em" }}>Tarjeta</span>
                  <span style={{ fontWeight:700, color:"var(--blue)" }}>{$(sCard + apCard)}</span>
                </div>
                {eTransfer > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ color:"var(--t3)", fontSize:".85em" }}>− Egresos por transferencia</span>
                    <span style={{ fontWeight:700, color:"var(--red)" }}>{$(eTransfer)}</span>
                  </div>
                )}
                {sAccount > 0 && (
                  <>
                    <div style={{ height:1, background:"var(--blueb)", margin:"4px 0" }}/>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ color:"var(--t3)", fontSize:".85em" }}>Cta. corriente (pendiente cobro)</span>
                      <span style={{ fontWeight:700, color:"var(--amber)" }}>{$(sAccount)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>

          {/* Tabla ventas del turno */}
          {shiftSales.length > 0 && (
            <div style={{ marginBottom:22 }}>
              <div className="section-title">Ventas del turno</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Hora</th><th>Cliente</th><th>Método</th><th>Total</th></tr></thead>
                  <tbody>
                    {shiftSales.slice(0,15).map(s => (
                      <tr key={s.id}>
                        <td data-label="Hora" style={{ color:"var(--t3)", fontSize:".82em", whiteSpace:"nowrap" }}>{fmtTime(s.createdAt)}</td>
                        <td data-label="Cliente">{s.customerName || "Anónimo"}</td>
                        <td data-label="Método"><span className={`badge ${s.paymentMethod==="cash"?"badge-green":s.paymentMethod==="transfer"?"badge-blue":s.paymentMethod==="account"?"badge-amber":"badge-gray"}`}>{PAY_LABELS[s.paymentMethod] || s.paymentMethod}</span></td>
                        <td data-label="Total" style={{ fontWeight:700 }}>{$(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shiftSales.length > 15 && <div style={{ textAlign:"center", color:"var(--t3)", fontSize:".8em", marginTop:8 }}>+ {shiftSales.length - 15} ventas más en el turno</div>}
            </div>
          )}

          {/* Tabla cobros de cuenta corriente */}
          {shiftAccPayments.length > 0 && (
            <div style={{ marginBottom:22 }}>
              <div className="section-title">Cobros de cuenta corriente</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Hora</th><th>Notas</th><th>Método real</th><th>Monto</th></tr></thead>
                  <tbody>
                    {shiftAccPayments.map(p => (
                      <tr key={p.id}>
                        <td data-label="Hora" style={{ color:"var(--t3)", fontSize:".82em", whiteSpace:"nowrap" }}>{fmtTime(p.createdAt)}</td>
                        <td data-label="Notas" style={{ color:"var(--t3)", fontSize:".85em" }}>{p.notes || "—"}</td>
                        <td data-label="Método"><span className={`badge ${p.paymentMethod==="cash"?"badge-green":"badge-blue"}`}>{PAY_LABELS[p.paymentMethod] || p.paymentMethod}</span></td>
                        <td data-label="Monto" style={{ fontWeight:700, color:"var(--green)" }}>{$(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabla gastos del turno */}
          {shiftExpenses.length > 0 && (
            <div style={{ marginBottom:22 }}>
              <div className="section-title">Gastos del turno</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Concepto</th><th>Categoría</th><th>Método</th><th>Total</th></tr></thead>
                  <tbody>
                    {shiftExpenses.map(e => (
                      <tr key={e.id}>
                        <td data-label="Concepto">{e.concept || "—"}</td>
                        <td data-label="Categoría" style={{ color:"var(--t3)", fontSize:".82em" }}>{e.category}</td>
                        <td data-label="Método"><span className={`badge ${e.paymentMethod==="cash"?"badge-green":e.paymentMethod==="transfer"?"badge-blue":"badge-gray"}`}>{PAY_LABELS[e.paymentMethod] || e.paymentMethod || "—"}</span></td>
                        <td data-label="Total" style={{ fontWeight:700, color:"var(--red)" }}>{$(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Historial turnos cerrados */}
      {closedShifts.length > 0 && (
        <div>
          <button className="btn btn-ghost" style={{ marginBottom:10, fontSize:".85em" }} onClick={() => setHistoryOpen(p => !p)}>
            <Ico n="chevron" s={14}/>{historyOpen ? "Ocultar" : "Ver"} historial ({closedShifts.length} turnos)
          </button>
          {historyOpen && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Apertura</th><th>Responsable</th><th>Inicial</th><th>Ef. recibido</th><th>Egresos ef.</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
                <tbody>
                  {closedShifts.map(s => (
                    <tr key={s.id}>
                      <td data-label="Apertura" style={{ fontSize:".82em", color:"var(--t3)", whiteSpace:"nowrap" }}>{fmtDT(s.openedAt)}</td>
                      <td data-label="Responsable">{s.openedBy}</td>
                      <td data-label="Inicial">{$(s.initialCash)}</td>
                      <td data-label="Ef. recibido">{$(s.salesCash)}</td>
                      <td data-label="Egresos ef." style={{ color:"var(--red)" }}>{$(s.expensesCash)}</td>
                      <td data-label="Esperado">{$(s.expectedCash)}</td>
                      <td data-label="Contado">{$(s.countedCash)}</td>
                      <td data-label="Diferencia">
                        {s.difference === 0
                          ? <span className="badge badge-green">Exacto</span>
                          : s.difference < 0
                            ? <span className="badge badge-red">Faltante {$(Math.abs(s.difference))}</span>
                            : <span className="badge badge-blue">Sobrante {$(s.difference)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Abrir turno */}
      {openModal && (
        <Modal title="Abrir turno" onClose={() => setOpenModal(false)}>
          <div className="form-grid">
            <div className="form-group"><label className="lbl">Fecha / Hora</label><input value={new Date().toLocaleString("es-AR")} readOnly style={{ color:"var(--t3)" }}/></div>
            <div className="form-group"><label className="lbl">Responsable</label><input value={user.name} readOnly style={{ color:"var(--t3)" }}/></div>
            <div className="form-group full"><label className="lbl">Efectivo inicial *</label><input type="number" min="0" step="0.01" autoFocus placeholder="0.00" value={openForm.initialCash} onChange={e => setOpenForm(p => ({ ...p, initialCash: e.target.value }))}/></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setOpenModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={doOpenShift}><Ico n="check" s={13}/>Abrir turno</button>
          </div>
        </Modal>
      )}

      {/* Modal Cerrar turno */}
      {closeModal && openShift && (
        <Modal title="Cerrar turno" onClose={() => setCloseModal(false)} lg>
          {/* Resumen en dos columnas */}
          <div className="resp-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>

            {/* Columna EFECTIVO */}
            <div style={{ background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:"var(--r)", padding:16 }}>
              <div style={{ fontSize:".68em", fontWeight:800, textTransform:"uppercase", letterSpacing:".7px", color:"var(--green)", marginBottom:12 }}>💵 Efectivo (Caja)</div>
              {[
                ["Inicial", $(openShift.initialCash), "var(--t2)"],
                [`+ Ventas en efectivo`, $(sCash), "var(--green)"],
                ...(apCash > 0 ? [[`+ Cobros de cuenta`, $(apCash), "var(--green)"]] : []),
                ...(eCash > 0 ? [[`− Egresos`, $(eCash), "var(--red)"]] : []),
              ].map(([label, val, color]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:".82em", color:"var(--t3)" }}>{label}</span>
                  <span style={{ fontWeight:700, color }}>{val}</span>
                </div>
              ))}
              <div style={{ height:1, background:"var(--greenlb)", margin:"8px 0" }}/>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:".85em", fontWeight:700, color:"var(--amber)" }}>Esperado en caja</span>
                <span style={{ fontWeight:800, fontSize:"1.2em", color:"var(--amber)" }}>{$(expectedCash)}</span>
              </div>
            </div>

            {/* Columna DIGITAL */}
            <div style={{ background:"var(--bluel)", border:"1px solid var(--blueb)", borderRadius:"var(--r)", padding:16 }}>
              <div style={{ fontSize:".68em", fontWeight:800, textTransform:"uppercase", letterSpacing:".7px", color:"var(--blue)", marginBottom:12 }}>📲 Digital (Banco)</div>
              {[
                ["Transferencias", $(sTransfer + apTransfer), "var(--blue)"],
                ["Tarjeta", $(sCard + apCard), "var(--blue)"],
                ...(eTransfer > 0 ? [[`− Egresos transf.`, $(eTransfer), "var(--red)"]] : []),
                ...(sAccount > 0 ? [["Cta. cte. pendiente", $(sAccount), "var(--amber)"]] : []),
              ].map(([label, val, color]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:".82em", color:"var(--t3)" }}>{label}</span>
                  <span style={{ fontWeight:700, color }}>{val}</span>
                </div>
              ))}
            </div>

          </div>
          <div className="form-grid">
            <div className="form-group full">
              <label className="lbl">Efectivo contado *</label>
              <input type="number" min="0" step="0.01" autoFocus placeholder="0.00" value={closeForm.countedCash} onChange={e => setCloseForm(p => ({ ...p, countedCash: e.target.value }))}/>
            </div>
            {closeForm.countedCash !== "" && (
              <div className="form-group full">
                <div style={{ background: diff===0?"var(--greenl)":diff<0?"var(--redl)":"var(--bluel)", border:`1px solid ${diff===0?"var(--greenlb)":diff<0?"var(--redlb)":"var(--blueb)"}`, borderRadius:"var(--r)", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontWeight:600, color: diff===0?"var(--green)":diff<0?"var(--red)":"var(--blue)", fontSize:".9em" }}>{diff===0?"Exacto":diff<0?"Faltante":"Sobrante"}</span>
                  <span style={{ fontWeight:800, fontSize:"1.3em", color: diff===0?"var(--green)":diff<0?"var(--red)":"var(--blue)" }}>{diff===0?"✓":$(Math.abs(diff))}</span>
                </div>
              </div>
            )}
            <div className="form-group full">
              <label className="lbl">Notas (opcional)</label>
              <textarea placeholder="Observaciones..." value={closeForm.notes} onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))}/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setCloseModal(false)}>Cancelar</button>
            <button className="btn btn-danger" onClick={doCloseShift}><Ico n="check" s={13}/>Confirmar cierre</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
