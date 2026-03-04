import { useState } from "react";
import { Ico, Modal, $, fmtDate, uid, PAY_LABELS, todayStr } from "../shared.jsx";
import { supabase, customerToDb, accountPaymentToDb } from "../supabase.js";

export default function CustomersPage({ customers, setCustomers, sales, accountPayments, setAccountPayments, showToast }) {
  const custBal = (id) => {
    const c = customers.find(x => x.id === id);
    return (c?.balance ?? 0) + accountPayments.filter(p => p.customerId === id)
      .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);
  };
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | customer
  const [form, setForm] = useState({ name:"", phone:"", address:"", notes:"", priceList:"retail", balance:0, discountPct:0 });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const [payModal, setPayModal] = useState(null); // customer object
  const [payForm, setPayForm] = useState({ amount:"", paymentMethod:"cash", notes:"" });

  const filtered = customers.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));

  const openNew = () => { setForm({ name:"", phone:"", address:"", notes:"", priceList:"retail", balance:0, discountPct:0 }); setModal("new"); };
  const openEdit = c => { setForm({...c}); setModal(c); };

  const save = async () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    if (modal==="new") {
      const newCustomer = {...form, id:uid(), balance:Number(form.balance)||0};
      const { error } = await supabase.from("customers").insert(customerToDb(newCustomer));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setCustomers(p => [...p, newCustomer]);
    } else {
      const updated = {...form, balance:Number(form.balance)||0};
      const { error } = await supabase.from("customers").update(customerToDb(updated)).eq("id", modal.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setCustomers(p => p.map(c => c.id===modal.id ? {...c,...updated} : c));
    }
    setModal(null);
    showToast("Cliente guardado");
  };

  const del = async (id) => {
    if (confirm("¿Eliminar cliente?")) {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setCustomers(p=>p.filter(c=>c.id!==id));
      showToast("Eliminado");
    }
  };

  const adjustBalance = async (id, amount) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    const newBalance = customer.balance + Number(amount);
    const { error } = await supabase.from("customers").update({ balance: newBalance }).eq("id", id);
    if (error) { showToast("Error al ajustar saldo: " + error.message, "error"); return; }
    setCustomers(p => p.map(c => c.id===id ? {...c, balance: newBalance} : c));
    showToast("Saldo actualizado");
  };

  const registerPayment = async () => {
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { showToast("Monto inválido", "error"); return; }
    const payment = { id: crypto.randomUUID(), customerId: payModal.id, saleId: null,
      amount, type: "payment", paymentMethod: payForm.paymentMethod, date: todayStr(), notes: payForm.notes };
    const { error: payErr } = await supabase.from("account_payments").insert(accountPaymentToDb(payment));
    if (payErr) { showToast("Error al registrar pago: " + payErr.message, "error"); return; }
    setAccountPayments(prev => [...prev, payment]);
    setPayModal(null);
    showToast("Pago registrado");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Clientes</div><div className="page-sub">{customers.length} registrados</div></div>
        <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo cliente</button>
      </div>

      <div className="search-wrap" style={{ marginBottom:16, maxWidth:320 }}>
        <div className="search-ico"><Ico n="search" s={14}/></div>
        <input placeholder="Buscar por nombre o teléfono..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Lista</th><th>Descuento</th><th>Saldo</th><th>Notas</th><th></th><th></th></tr></thead>
          <tbody>
            {filtered.map(c => {
              const custSales = sales.filter(s=>s.customerId===c.id).length;
              return (
                <tr key={c.id} className="tr-click" onClick={()=>openEdit(c)}>
                  <td><div style={{ fontWeight:600 }}>{c.name}</div><div style={{ fontSize:".76em", color:"var(--t3)" }}>{custSales} compra{custSales!==1?"s":""}</div></td>
                  <td style={{ color:"var(--t2)" }}>{c.phone||"—"}</td>
                  <td><span className={`badge ${c.priceList==="wholesale"?"badge-blue":"badge-green"}`}>{c.priceList==="wholesale"?"Mayorista":"Minorista"}</span></td>
                  <td>{(c.discountPct||0)>0 ? <span className="badge badge-amber">{c.discountPct}%</span> : <span style={{color:"var(--t4)"}}>—</span>}</td>
                  <td>{(() => { const b = custBal(c.id); return <span className={b>0?"balance-pos":b<0?"balance-neg":"balance-zero"}>{$(b)}</span>; })()}</td>
                  <td style={{ color:"var(--t3)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.notes||"—"}</td>
                  <td>
                    <button className="btn btn-amber btn-sm" onClick={e=>{e.stopPropagation();setPayModal(c);setPayForm({amount:"",paymentMethod:"cash",notes:""});}}>
                      Registrar Pago
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={e=>{e.stopPropagation();del(c.id);}}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">👥</div><h3>Sin clientes</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==="new"?"Nuevo cliente":form.name} onClose={()=>setModal(null)}>
          <div className="form-grid" style={{ marginBottom:14 }}>
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>set("name",e.target.value)} autoFocus/></div>
            <div className="form-group"><label className="lbl">Teléfono</label><input value={form.phone} onChange={e=>set("phone",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Lista de precios</label>
              <select value={form.priceList} onChange={e=>set("priceList",e.target.value)}>
                <option value="retail">Minorista</option>
                <option value="wholesale">Mayorista</option>
              </select>
            </div>
            <div className="form-group full"><label className="lbl">Dirección</label><input value={form.address} onChange={e=>set("address",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Saldo inicial ($)</label><input type="number" value={form.balance} onChange={e=>set("balance",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Descuento por defecto (%)</label><input type="number" min="0" max="100" value={form.discountPct||0} onChange={e=>set("discountPct",e.target.value)}/></div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>set("notes",e.target.value)}/></div>
          </div>
          {modal!=="new" && (
            <div style={{ marginBottom:14 }}>
              <div className="section-title">Ajuste de saldo</div>
              <div className="input-group">
                <input type="number" id="bal-adj" placeholder="Monto (positivo o negativo)"/>
                <button className="btn btn-amber" onClick={()=>{
                  const v=document.getElementById("bal-adj").value;
                  if(v) adjustBalance(modal.id, v);
                }}>Aplicar</button>
              </div>
            </div>
          )}
          {modal!=="new" && (() => {
            const movements = accountPayments
              .filter(p => p.customerId === modal.id)
              .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (!movements.length) return null;
            return (
              <div style={{ marginBottom:14 }}>
                <div className="section-title">Historial cuenta corriente</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Método</th><th>Notas</th></tr></thead>
                    <tbody>
                      {movements.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontSize:".82em", color:"var(--t3)" }}>{fmtDate(p.date)}</td>
                          <td><span className={`badge ${p.type==="charge"?"badge-red":"badge-green"}`}>{p.type==="charge"?"Cargo":"Pago"}</span></td>
                          <td style={{ fontWeight:700, color: p.type==="charge"?"var(--red)":"var(--green)" }}>
                            {p.type==="charge"?"-":"+"}{$(p.amount)}
                          </td>
                          <td style={{ fontSize:".84em" }}>{PAY_LABELS[p.paymentMethod]||"—"}</td>
                          <td style={{ fontSize:".82em", color:"var(--t3)" }}>{p.notes||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}

      {payModal && (
        <Modal title={`Registrar pago — ${payModal.name}`} onClose={()=>setPayModal(null)}>
          <div style={{ background:"var(--redl)", border:"1px solid var(--redlb)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:".9em" }}>
            Deuda actual: <strong className="balance-neg">{$(custBal(payModal.id))}</strong>
          </div>
          <div className="form-grid" style={{ marginBottom:14 }}>
            <div className="form-group full">
              <label className="lbl">Monto a pagar ($) *</label>
              <input type="number" min="0" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} autoFocus placeholder="0"/>
            </div>
            <div className="form-group full">
              <label className="lbl">Método de pago</label>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                {[["cash","Efectivo"],["transfer","Transferencia"]].map(([k,v]) => (
                  <button key={k} className={`btn btn-sm ${payForm.paymentMethod===k?"btn-primary":"btn-secondary"}`}
                    onClick={()=>setPayForm(p=>({...p,paymentMethod:k}))}>
                    {payForm.paymentMethod===k && <Ico n="check" s={12}/>}{v}
                  </button>
                ))}
              </div>
            </div>
            {payForm.amount > 0 && (
              <div className="form-group full">
                <label className="lbl">Saldo resultante</label>
                <div style={{ marginTop:4, fontWeight:700, fontSize:"1.05em" }}>
                  {(() => { const r = custBal(payModal.id) + Number(payForm.amount); return <span className={r >= 0 ? "balance-pos" : "balance-neg"}>{$(r)}</span>; })()}
                </div>
              </div>
            )}
            <div className="form-group full">
              <label className="lbl">Notas</label>
              <textarea value={payForm.notes} onChange={e=>setPayForm(p=>({...p,notes:e.target.value}))} placeholder="Observaciones opcionales..."/>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setPayModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={registerPayment}><Ico n="check" s={13}/>Confirmar pago</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
