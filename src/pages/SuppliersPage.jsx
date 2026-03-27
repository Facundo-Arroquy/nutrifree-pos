/**
 * SuppliersPage — CRUD de proveedores y cuenta corriente.
 *
 * El saldo de cada proveedor se calcula como la suma de supplier_payments:
 * charges (deudas generadas por gastos) menos payments (pagos realizados).
 * Valor negativo = deuda pendiente con el proveedor.
 * Permite registrar pagos manuales independientes de un gasto.
 *
 * Props: suppliers, setSuppliers, supplierPayments, setSupplierPayments, showToast
 */
import { useState } from "react";
import { Ico, Modal, $, fmtDate, todayStr, PAY_LABELS } from "../shared.jsx";
import { supabase, supplierToDb, supplierPaymentToDb } from "../supabase.js";

export default function SuppliersPage({ suppliers, setSuppliers, supplierPayments, setSupplierPayments, showToast }) {
  const emptyForm = { name:"", phone:"", email:"", address:"", notes:"" };
  const [modal, setModal] = useState(null); // null | "new" | supplier obj
  const [accountModal, setAccountModal] = useState(null); // supplier obj
  const [payModal, setPayModal] = useState(null); // supplier obj
  const [form, setForm] = useState(emptyForm);
  const [payForm, setPayForm] = useState({ amount:"", paymentMethod:"cash", notes:"" });
  const [search, setSearch] = useState("");

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const supplierBal = (id) =>
    supplierPayments.filter(p => p.supplierId === id)
      .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);

  const totalDebt = suppliers.reduce((sum, s) => {
    const bal = supplierBal(s.id);
    return bal < 0 ? sum + Math.abs(bal) : sum;
  }, 0);

  const openNew = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = (s) => { setForm({ name:s.name, phone:s.phone||"", email:s.email||"", address:s.address||"", notes:s.notes||"" }); setModal(s); };

  const save = async () => {
    if (!form.name.trim()) { showToast("El nombre es obligatorio", "error"); return; }
    if (modal === "new") {
      const newSup = { ...form, id: crypto.randomUUID() };
      const { error } = await supabase.from("suppliers").insert(supplierToDb(newSup));
      if (error) { showToast("Error: " + error.message, "error"); return; }
      setSuppliers(p => [...p, newSup].sort((a,b) => a.name.localeCompare(b.name)));
    } else {
      const updated = { ...modal, ...form };
      const { error } = await supabase.from("suppliers").update(supplierToDb(updated)).eq("id", modal.id);
      if (error) { showToast("Error: " + error.message, "error"); return; }
      setSuppliers(p => p.map(s => s.id === modal.id ? updated : s));
    }
    showToast(modal === "new" ? "Proveedor creado" : "Proveedor actualizado");
    setModal(null);
  };

  const del = async (id) => {
    const hasPayments = supplierPayments.some(p => p.supplierId === id);
    const msg = hasPayments
      ? "Este proveedor tiene movimientos en cuenta corriente. ¿Eliminar proveedor y todos sus movimientos?"
      : "¿Eliminar proveedor?";
    if (!confirm(msg)) return;
    if (hasPayments) {
      const { error } = await supabase.from("supplier_payments").delete().eq("supplier_id", id);
      if (error) { showToast("Error al eliminar movimientos: " + error.message, "error"); return; }
      setSupplierPayments(p => p.filter(x => x.supplierId !== id));
    }
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setSuppliers(p => p.filter(s => s.id !== id));
    showToast("Proveedor eliminado");
  };

  const registerPayment = async () => {
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { showToast("Ingresá un monto válido", "error"); return; }
    const payment = { id: crypto.randomUUID(), supplierId: payModal.id, expenseId: null, amount, type: "payment", paymentMethod: payForm.paymentMethod, date: todayStr(), notes: payForm.notes || "Pago manual" };
    const { error } = await supabase.from("supplier_payments").insert(supplierPaymentToDb(payment));
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setSupplierPayments(prev => [...prev, payment]);
    setPayForm({ amount:"", paymentMethod:"cash", notes:"" });
    setPayModal(null);
    showToast("Pago registrado ✓");
  };

  const PAY_OPTS = [["cash","Efectivo"],["transfer","Transferencia"],["card","Tarjeta"],["check","Cheque"]];

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Proveedores</div><div className="page-sub">{suppliers.length} registrados</div></div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar proveedor..." style={{ width:220 }}/>
          <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo proveedor</button>
        </div>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns:"repeat(2,1fr)" }}>
        <div className="stat"><div className="stat-num">{suppliers.length}</div><div className="stat-label">Proveedores</div><div className="stat-icon">🏭</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(totalDebt)}</div><div className="stat-label">Deuda pendiente total</div><div className="stat-icon">💳</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Saldo</th><th></th></tr></thead>
          <tbody>
            {suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone||"").includes(search) || (s.email||"").toLowerCase().includes(search.toLowerCase())).map(s => {
              const bal = supplierBal(s.id);
              return (
                <tr key={s.id} className="tr-click" onClick={()=>openEdit(s)}>
                  <td style={{ fontWeight:700 }}>{s.name}</td>
                  <td style={{ color:"var(--t3)", fontSize:".85em" }}>{s.phone||"—"}</td>
                  <td style={{ color:"var(--t3)", fontSize:".85em" }}>{s.email||"—"}</td>
                  <td>
                    {bal === 0
                      ? <span className="badge badge-green">Al día</span>
                      : bal < 0
                        ? <span className="badge badge-amber" style={{ fontWeight:700 }}>Debemos {$(Math.abs(bal))}</span>
                        : <span className="badge" style={{ background:"var(--bluel)", color:"var(--blue)", fontWeight:700 }}>A favor {$(bal)}</span>
                    }
                  </td>
                  <td onClick={ev=>ev.stopPropagation()} style={{ display:"flex", gap:4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={()=>{ setAccountModal(s); }}>Ver cuenta</button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(s.id)}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </td>
                </tr>
              );
            })}
            {suppliers.length===0 && <tr><td colSpan={5}><div className="empty"><div className="empty-icon">🏭</div><h3>Sin proveedores</h3><p>Creá el primer proveedor</p></div></td></tr>}
            {suppliers.length>0 && suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone||"").includes(search) || (s.email||"").toLowerCase().includes(search.toLowerCase())).length===0 && <tr><td colSpan={5}><div className="empty"><div className="empty-icon">🔍</div><h3>Sin resultados</h3><p>No hay proveedores que coincidan con "{search}"</p></div></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal CRUD */}
      {modal && (
        <Modal title={modal==="new"?"Nuevo proveedor":form.name} onClose={()=>setModal(null)}>
          <div className="form-grid">
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>set("name",e.target.value)} autoFocus placeholder="Nombre del proveedor"/></div>
            <div className="form-group"><label className="lbl">Teléfono</label><input value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+54 9..."/></div>
            <div className="form-group"><label className="lbl">Email</label><input type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="correo@..."/></div>
            <div className="form-group full"><label className="lbl">Dirección</label><input value={form.address} onChange={e=>set("address",e.target.value)} placeholder="Dirección..."/></div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Observaciones..."/></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}

      {/* Modal cuenta corriente */}
      {accountModal && (() => {
        const sup = accountModal;
        const movements = supplierPayments.filter(p => p.supplierId === sup.id).sort((a,b) => new Date(b.createdAt||b.date) - new Date(a.createdAt||a.date));
        const bal = supplierBal(sup.id);
        return (
          <Modal title={`Cuenta corriente — ${sup.name}`} onClose={()=>setAccountModal(null)} lg>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:".82em", color:"var(--t3)", marginBottom:2 }}>Saldo actual</div>
                <div style={{ fontWeight:800, fontSize:"1.4em", color: bal < 0 ? "var(--amber)" : bal > 0 ? "var(--green)" : "var(--t2)" }}>
                  {bal < 0 ? `Debemos ${$(Math.abs(bal))}` : bal > 0 ? `A favor ${$(bal)}` : "Al día"}
                </div>
              </div>
              <button className="btn btn-primary" onClick={()=>{ setPayModal(sup); setAccountModal(null); }}>
                <Ico n="plus" s={13}/>Registrar pago
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Método</th><th>Notas</th></tr></thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontSize:".82em", color:"var(--t3)", whiteSpace:"nowrap" }}>{fmtDate(m.date)}</td>
                      <td>
                        {m.type==="charge"
                          ? <span className="badge badge-amber">Cargo</span>
                          : <span className="badge badge-green">Pago</span>}
                      </td>
                      <td style={{ fontWeight:700, color: m.type==="charge" ? "var(--red)" : "var(--green)" }}>
                        {m.type==="charge" ? "-" : "+"}{$(m.amount)}
                      </td>
                      <td style={{ fontSize:".82em", color:"var(--t3)" }}>{m.paymentMethod ? PAY_LABELS[m.paymentMethod]||m.paymentMethod : "—"}</td>
                      <td style={{ fontSize:".82em", color:"var(--t3)" }}>{m.notes||"—"}</td>
                    </tr>
                  ))}
                  {movements.length===0 && <tr><td colSpan={5} style={{ textAlign:"center", color:"var(--t4)", padding:"20px 0" }}>Sin movimientos</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setAccountModal(null)}>Cerrar</button>
            </div>
          </Modal>
        );
      })()}

      {/* Modal registrar pago manual */}
      {payModal && (
        <Modal title={`Registrar pago — ${payModal.name}`} onClose={()=>{ setPayModal(null); setAccountModal(payModal); }}>
          <div className="form-grid">
            <div className="form-group full"><label className="lbl">Monto *</label><input type="number" min="0" step="0.01" autoFocus value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="0.00"/></div>
            <div className="form-group full"><label className="lbl">Método de pago</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {PAY_OPTS.map(([k,v]) => (
                  <button key={k} className={`btn ${payForm.paymentMethod===k?"btn-primary":"btn-secondary"}`} onClick={()=>setPayForm(p=>({...p,paymentMethod:k}))}>
                    {payForm.paymentMethod===k && <Ico n="check" s={13}/>}{v}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group full"><label className="lbl">Notas</label><input value={payForm.notes} onChange={e=>setPayForm(p=>({...p,notes:e.target.value}))} placeholder="Observaciones..."/></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>{ setPayModal(null); setAccountModal(payModal); }}>Cancelar</button>
            <button className="btn btn-primary" onClick={registerPayment}><Ico n="check" s={13}/>Registrar pago</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
