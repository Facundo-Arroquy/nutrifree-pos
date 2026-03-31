/**
 * ExpensesPage — Registro y gestión de gastos.
 *
 * Soporta dos flujos según la categoría:
 *  - "Ingredientes": tabla de líneas donde se elige ingrediente del catálogo.
 *    Al guardar actualiza `ingredients.unit_cost` y `recipe_ingredients.cost` en DB.
 *  - Otras categorías: formulario simple con concepto, proveedor, cantidad y precio.
 *
 * Los gastos con paymentStatus="pending" se pueden cerrar después eligiendo método
 * de pago (genera movimiento en supplier_payments si tiene proveedor asociado).
 *
 * Props: expenses, setExpenses, expenseCategories, ingredients, setIngredients,
 *        recipes, setRecipes, suppliers, setSupplierPayments, showToast, logAction
 */
import { useState } from "react";
import { Ico, Modal, $, fmtDate, uid, todayStr, PAY_LABELS } from "../shared.jsx";
import { supabase, expenseToDb, supplierPaymentToDb } from "../supabase.js";

const EXPENSE_UNITS = ["unidades", "kg", "g", "litros", "porciones"];

function CloseExpenseModal({ expense, onClose, onConfirm }) {
  const [payMethod, setPayMethod] = useState(expense.paymentMethod||"cash");
  return (
    <Modal title="Cerrar gasto" onClose={onClose}>
      <div style={{ background:"var(--s2)", borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
        <div style={{ fontWeight:700 }}>{expense.concept}</div>
        <div style={{ fontSize:".83em", color:"var(--t3)", marginTop:2 }}>{expense.supplier||"Sin proveedor"} · {fmtDate(expense.date)}</div>
        <div style={{ fontWeight:800, color:"var(--red)", fontSize:"1.15em", marginTop:6 }}>{$(expense.total)}</div>
      </div>
      <div className="section-title">Seleccioná el método de pago</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
        {Object.entries(PAY_LABELS).map(([k,v]) => (
          <button key={k} className={`btn ${payMethod===k?"btn-primary":"btn-secondary"}`} onClick={()=>setPayMethod(k)}>
            {payMethod===k && <Ico n="check" s={13}/>}{v}
          </button>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={()=>onConfirm(expense, payMethod)}><Ico n="check" s={14}/>Confirmar pago</button>
      </div>
    </Modal>
  );
}

export default function ExpensesPage({ expenses, setExpenses, expenseCategories, ingredients, setIngredients, recipes, setRecipes, suppliers, supplierPayments, setSupplierPayments, showToast, logAction, vatRate = 21 }) {
  const emptyLine = () => ({ ingredientId: "", qty: 1, unit: "", totalPaid: "" });
  const emptyForm = { date:todayStr(), supplier:"", supplierId:null, concept:"", quantity:1, unit:"unidades", unitPrice:0, total:0, paymentMethod:"", paymentStatus:"pending", category:"Ingredientes", notes:"", ingredientLines:[emptyLine()], withVat:false };
  const [modal, setModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat] = useState("Todos");
  const today = todayStr();
  const [dateFrom, setDateFrom] = useState(today.slice(0,7) + "-01");
  const [dateTo,   setDateTo]   = useState(today);

  const set = (k, v) => setForm(p => {
    const np = {...p, [k]:v};
    if (k==="quantity" || k==="unitPrice") np.total = Number(np.quantity||0) * Number(np.unitPrice||0);
    if (k==="category" && v==="Ingredientes" && (!np.ingredientLines || np.ingredientLines.length===0)) {
      np.ingredientLines = [emptyLine()];
    }
    return np;
  });

  const addLine = () => setForm(p => ({ ...p, ingredientLines: [...(p.ingredientLines||[]), emptyLine()] }));
  const removeLine = idx => setForm(p => ({
    ...p,
    ingredientLines: (p.ingredientLines||[]).filter((_,i) => i!==idx),
  }));
  const updateLine = (idx, key, value) => setForm(p => {
    const lines = (p.ingredientLines||[]).map((l, i) => {
      if (i!==idx) return l;
      const upd = { ...l, [key]: value };
      if (key==="ingredientId") {
        const ing = ingredients.find(x => x.id===value);
        upd.unit = ing ? ing.unit : "";
        upd.totalPaid = "";
      }
      return upd;
    });
    return { ...p, ingredientLines: lines };
  });

  const from = dateFrom || "0000-01-01";
  const to   = dateTo   || "9999-12-31";
  const inRange = e => { const d = e.date || e.createdAt?.slice(0,10) || ""; return d >= from && d <= to; };

  const dateFiltered = expenses.filter(inRange);
  const cats = ["Todos", ...expenseCategories];
  const filtered = dateFiltered
    .filter(e => filterStatus==="all" || e.paymentStatus===filterStatus)
    .filter(e => filterCat==="Todos" || e.category===filterCat)
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const totalPaid    = dateFiltered.filter(e=>e.paymentStatus==="paid").reduce((a,b)=>a+b.total,0);
  const totalPending = dateFiltered.filter(e=>e.paymentStatus==="pending").reduce((a,b)=>a+b.total,0);

  const openNew  = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = e  => {
    const lines = e.ingredientLines?.length
      ? e.ingredientLines.map(l => ({ ...l, totalPaid: l.totalPaid ?? (Number(l.unitPrice||0) * Number(l.qty||0)) }))
      : [emptyLine()];
    setForm({...e, ingredientLines: lines, withVat: e.withVat || false});
    setModal(e);
  };

  // When saving an ingredient expense, update matching ingredient costs in recipes
  const syncIngredientCosts = async (concept, unitPrice) => {
    if (!unitPrice || !concept) return 0;
    const lc = concept.toLowerCase().trim();
    const matchingIngIds = new Set(
      ingredients.filter(i => i.name.toLowerCase().includes(lc)).map(i => i.id)
    );
    if (matchingIngIds.size === 0) return 0;
    let updatedRecipes = 0;
    setRecipes(prev => prev.map(r => {
      const hasMatch = r.ingredients.some(i => matchingIngIds.has(i.ingredientId));
      if (!hasMatch) return r;
      updatedRecipes++;
      return {...r, ingredients: r.ingredients.map(i =>
        matchingIngIds.has(i.ingredientId) ? {...i, cost: Number(unitPrice)} : i
      )};
    }));
    for (const ingId of matchingIngIds) {
      const { error } = await supabase.from("recipe_ingredients")
        .update({ cost: Number(unitPrice) })
        .eq("ingredient_id", ingId);
      if (error) showToast("Error al sincronizar costo: " + error.message, "error");
    }
    return updatedRecipes;
  };

  const save = async () => {
    // ── Gastos de Ingredientes: múltiples líneas ──────────────────────────────
    if (form.category==="Ingredientes") {
      const rawLines = (form.ingredientLines||[]).filter(l => l.ingredientId);
      if (rawLines.length===0) { showToast("Agregá al menos un ingrediente", "error"); return; }
      // Aplicar IVA y calcular unitPrice por línea
      const validLines = rawLines.map(l => {
        const effTotal = form.withVat ? (Number(l.totalPaid)||0) * (1 + vatRate / 100) : (Number(l.totalPaid)||0);
        const qty = Number(l.qty || 0);
        return { ...l, unitPrice: qty > 0 ? effTotal / qty : 0, subtotal: effTotal };
      });
      const concept = validLines.map(l => ingredients.find(i=>i.id===l.ingredientId)?.name||"").filter(Boolean).join(", ");
      const total   = validLines.reduce((a,b)=>a+b.subtotal, 0);
      const data = { ...form, concept, quantity: validLines.reduce((a,b)=>a+Number(b.qty||0),0), unitPrice:0, total, paymentMethod:form.paymentMethod||null };
      if (modal==="new") {
        const newExp = {...data, id:uid()};
        const { error } = await supabase.from("expenses").insert(expenseToDb(newExp));
        if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
        setExpenses(p => p.some(x => x.id === newExp.id) ? p : [newExp, ...p]);
        if (newExp.supplierId && newExp.paymentStatus==="pending") {
          const charge = { id:crypto.randomUUID(), supplierId:newExp.supplierId, expenseId:newExp.id, amount:newExp.total, type:"charge", paymentMethod:null, date:newExp.date, notes:newExp.concept };
          await supabase.from("supplier_payments").insert(supplierPaymentToDb(charge));
          setSupplierPayments(prev => [...prev, charge]);
        }
      } else {
        const { error } = await supabase.from("expenses").update(expenseToDb(data)).eq("id", modal.id);
        if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
        setExpenses(p => p.map(e => e.id===modal.id ? {...e,...data} : e));
      }
      // Actualizar unit_cost + stock de cada ingrediente y sincronizar recetas
      for (const line of validLines) {
        const price = Number(line.unitPrice);
        const qty   = Number(line.qty || 0);
        const currentStock = ingredients.find(i => i.id===line.ingredientId)?.stock || 0;
        const newStock = currentStock + qty;
        const updates = { stock: newStock };
        if (price) updates.unit_cost = price;
        await supabase.from("ingredients").update(updates).eq("id", line.ingredientId);
        setIngredients(prev => prev.map(i => i.id===line.ingredientId ? {...i, unitCost: price||i.unitCost, stock: newStock} : i));
        if (price) await supabase.from("recipe_ingredients").update({ cost: price }).eq("ingredient_id", line.ingredientId);
      }
      // Actualizar estado local de recetas (batch)
      setRecipes(prev => prev.map(r => {
        let changed = false;
        const newIngrs = r.ingredients.map(ri => {
          const line = validLines.find(l => l.ingredientId===ri.ingredientId && Number(l.unitPrice));
          if (!line) return ri;
          changed = true;
          return { ...ri, cost: Number(line.unitPrice) };
        });
        return changed ? {...r, ingredients:newIngrs} : r;
      }));
      const updatedCount = recipes.filter(r => r.ingredients.some(ri => validLines.find(l => l.ingredientId===ri.ingredientId && Number(l.unitPrice)))).length;
      logAction?.(modal==="new" ? "crear" : "editar", "gasto", `Ingredientes: "${concept}" — $${total}`);
      showToast(updatedCount>0 ? `Gasto guardado · Costo actualizado en ${updatedCount} receta${updatedCount!==1?"s":""}` : "Gasto guardado");
      setModal(null);
      return;
    }

    // ── Resto de categorías ───────────────────────────────────────────────────
    if (!form.concept) { showToast("El concepto es obligatorio", "error"); return; }
    const data = {
      ...form,
      quantity: Number(form.quantity)||0,
      unitPrice: Number(form.unitPrice)||0,
      total: Number(form.total)||0,
      paymentMethod: form.paymentMethod||null,
    };
    if (modal==="new") {
      const newExp = {...data, id:uid()};
      const { error } = await supabase.from("expenses").insert(expenseToDb(newExp));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setExpenses(p => p.some(x => x.id === newExp.id) ? p : [newExp, ...p]);
      if (newExp.supplierId && newExp.paymentStatus==="pending") {
        const charge = { id:crypto.randomUUID(), supplierId:newExp.supplierId, expenseId:newExp.id, amount:newExp.total, type:"charge", paymentMethod:null, date:newExp.date, notes:newExp.concept };
        await supabase.from("supplier_payments").insert(supplierPaymentToDb(charge));
        setSupplierPayments(prev => [...prev, charge]);
      }
    } else {
      const { error } = await supabase.from("expenses").update(expenseToDb(data)).eq("id", modal.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setExpenses(p => p.map(e => e.id===modal.id ? {...e,...data} : e));
    }
    logAction?.(modal==="new" ? "crear" : "editar", "gasto", `"${data.concept}" — $${data.total} (${data.category})`);
    if (data.category==="Ingredientes" && data.unitPrice > 0) {
      const updated = await syncIngredientCosts(data.concept, data.unitPrice);
      if (updated > 0) showToast(`Gasto guardado · Costo actualizado en ${updated} receta${updated!==1?"s":""}`);
      else showToast("Gasto guardado");
    } else {
      showToast("Gasto guardado");
    }
    setModal(null);
  };

  const del = async (id) => {
    const expense = expenses.find(e => e.id === id);
    if (confirm("¿Eliminar gasto?")) {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setExpenses(p => p.filter(e => e.id!==id));
      logAction?.("eliminar", "gasto", `Eliminó "${expense?.concept}" — $${expense?.total}`);
      showToast("Eliminado");
    }
  };

  const closeExpense = async (expense, paymentMethod) => {
    const { error } = await supabase.from("expenses").update({ payment_method: paymentMethod, payment_status:"paid" }).eq("id", expense.id);
    if (error) { showToast("Error al cerrar gasto: " + error.message, "error"); return; }
    setExpenses(p => p.map(e => e.id===expense.id ? {...e, paymentMethod, paymentStatus:"paid"} : e));
    if (expense.supplierId) {
      const payment = { id:crypto.randomUUID(), supplierId:expense.supplierId, expenseId:expense.id, amount:expense.total, type:"payment", paymentMethod, date:todayStr(), notes:"Pago de gasto" };
      await supabase.from("supplier_payments").insert(supplierPaymentToDb(payment));
      setSupplierPayments(prev => [...prev, payment]);
    }
    logAction?.("pagar", "gasto", `"${expense.concept}" — $${expense.total} — ${PAY_LABELS[paymentMethod]||paymentMethod}`);
    setPayModal(null);
    showToast("Gasto cerrado ✓");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Gastos</div><div className="page-sub">{dateFiltered.length} en el período</div></div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label style={{ fontSize:".8em", color:"var(--t3)", whiteSpace:"nowrap" }}>Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width:140 }}/>
          <label style={{ fontSize:".8em", color:"var(--t3)", whiteSpace:"nowrap" }}>Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width:140 }}/>
          <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo gasto</button>
        </div>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat stat-red"><div className="stat-num">{$(totalPaid)}</div><div className="stat-label">Total pagado</div><div className="stat-icon">💸</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(totalPending)}</div><div className="stat-label">Pendiente de pago</div><div className="stat-icon">⏳</div></div>
        <div className="stat"><div className="stat-num">{dateFiltered.length}</div><div className="stat-label">Gastos en período</div><div className="stat-icon">📋</div></div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        {[["all","Todos"],["pending","Pendientes"],["paid","Pagados"]].map(([v,l]) => (
          <button key={v} className={`btn btn-sm ${filterStatus===v?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterStatus(v)}>{l}</button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
        <span style={{ fontSize:".74em", fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:".5px" }}>Cat.:</span>
        {cats.map(c => (
          <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterCat(c)}>{c}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Cant.</th><th>P. Unit.</th><th>Total</th><th>Categoría</th><th>Método pago</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="tr-click" onClick={()=>openEdit(e)}>
                <td style={{ fontSize:".82em", color:"var(--t3)", whiteSpace:"nowrap" }}>{fmtDate(e.date)}</td>
                <td style={{ fontWeight:600 }}>{e.supplier||"—"}</td>
                <td>{e.concept}</td>
                <td style={{ color:"var(--t2)", whiteSpace:"nowrap" }}>{e.quantity} {e.unit}</td>
                <td style={{ color:"var(--t2)" }}>{$(e.unitPrice)}</td>
                <td style={{ fontWeight:700, color:"var(--red)" }}>{$(e.total)}</td>
                <td><span className="tag">{e.category}</span></td>
                <td style={{ fontSize:".82em", color:"var(--t3)" }}>{e.paymentMethod ? PAY_LABELS[e.paymentMethod]||e.paymentMethod : <span style={{color:"var(--t4)"}}>—</span>}</td>
                <td>
                  {e.paymentStatus==="paid"
                    ? <span className="badge badge-green">Pagado</span>
                    : <span className="badge badge-amber">Pendiente</span>}
                </td>
                <td onClick={ev=>ev.stopPropagation()} style={{ whiteSpace:"nowrap" }}>
                  <div style={{ display:"flex", gap:4, alignItems:"center", justifyContent:"flex-end" }}>
                    {e.paymentStatus==="pending" && (
                      <button className="btn btn-sm btn-primary" style={{ fontSize:".76em", padding:"4px 9px" }} onClick={()=>setPayModal(e)}>
                        <Ico n="check" s={12}/>Cerrar
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(e.id)}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={10}><div className="empty"><div className="empty-icon">💸</div><h3>Sin gastos</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==="new"?"Nuevo gasto":form.concept} onClose={()=>setModal(null)} lg>
          <div className="form-grid">
            <div className="form-group"><label className="lbl">Fecha</label><input type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Proveedor</label>
              <select value={form.supplierId||""} onChange={e=>{
                const sup = suppliers.find(s=>s.id===e.target.value);
                setForm(p=>({...p, supplierId:e.target.value||null, supplier:sup?.name||""}));
              }}>
                <option value="">— Sin proveedor —</option>
                {[...suppliers].sort((a,b)=>a.name.localeCompare(b.name)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {form.category!=="Ingredientes" && <>
              <div className="form-group full"><label className="lbl">Concepto / Producto *</label><input value={form.concept} onChange={e=>set("concept",e.target.value)} autoFocus placeholder="¿Qué se compró?"/></div>
              <div className="form-group">
                <label className="lbl">Cantidad</label>
                <div style={{ display:"flex", gap:6 }}>
                  <input type="number" min="0" style={{ flex:1 }} value={form.quantity} onChange={e=>set("quantity",e.target.value)}/>
                  <select style={{ width:110 }} value={form.unit} onChange={e=>set("unit",e.target.value)}>
                    {EXPENSE_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="lbl">Precio unitario</label><input type="number" min="0" value={form.unitPrice} onChange={e=>set("unitPrice",e.target.value)}/></div>
              <div className="form-group"><label className="lbl">Total</label><input type="number" min="0" value={form.total} onChange={e=>set("total",e.target.value)} style={{ fontWeight:700 }}/></div>
            </>}
            <div className="form-group"><label className="lbl">Categoría</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)}>
                {expenseCategories.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Método de pago</label>
              <select value={form.paymentMethod||""} onChange={e=>set("paymentMethod",e.target.value||null)}>
                <option value="">Pendiente</option>
                {Object.entries(PAY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Estado de pago</label>
              <select value={form.paymentStatus} onChange={e=>set("paymentStatus",e.target.value)}>
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado</option>
              </select>
            </div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Observaciones opcionales..."/></div>
          </div>

          {form.category==="Ingredientes" && (
            <div style={{ marginTop:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:8 }}>
                <div className="section-title" style={{ margin:0 }}>Ingredientes comprados</div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <button className={`btn btn-sm ${!form.withVat?"btn-primary":"btn-secondary"}`} onClick={()=>setForm(p=>({...p,withVat:false}))}>Sin IVA</button>
                  <button className={`btn btn-sm ${form.withVat?"btn-primary":"btn-secondary"}`} onClick={()=>setForm(p=>({...p,withVat:true}))}>Con IVA (+{vatRate}%)</button>
                  <button className="btn btn-sm btn-secondary" onClick={addLine}><Ico n="plus" s={13}/>Agregar ingrediente</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Total pagado</th><th>Subtotal{form.withVat?` (+${vatRate}% IVA)`:""}</th><th></th></tr></thead>
                  <tbody>
                    {(form.ingredientLines||[]).map((line, idx) => {
                      const effTotal = form.withVat ? (Number(line.totalPaid)||0) * (1 + vatRate / 100) : (Number(line.totalPaid)||0);
                      return (
                        <tr key={idx}>
                          <td>
                            <select value={line.ingredientId} onChange={e=>updateLine(idx,"ingredientId",e.target.value)} style={{ minWidth:150 }}>
                              <option value="">— Elegir —</option>
                              {[...ingredients].sort((a,b)=>a.name.localeCompare(b.name)).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                          </td>
                          <td><input type="number" min="0" step="0.01" value={line.qty} onChange={e=>updateLine(idx,"qty",e.target.value)} style={{ width:75 }}/></td>
                          <td><input type="text" value={line.unit||""} onChange={e=>updateLine(idx,"unit",e.target.value)} style={{ width:80 }} placeholder="kg"/></td>
                          <td><input type="number" min="0" step="0.01" value={line.totalPaid ?? ""} onChange={e=>updateLine(idx,"totalPaid",e.target.value)} style={{ width:100 }}/></td>
                          <td style={{ fontWeight:700, color:"var(--red)" }}>{$(effTotal)}</td>
                          <td>
                            {(form.ingredientLines||[]).length>1 && (
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>removeLine(idx)}><Ico n="trash" s={13} c="var(--red)"/></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ textAlign:"right", fontWeight:800, fontSize:"1.1em", color:"var(--red)", marginTop:8 }}>
                Total{form.withVat?" (con IVA)":""}: {$((form.ingredientLines||[]).reduce((a,l) => a + (form.withVat ? (Number(l.totalPaid)||0)*(1 + vatRate/100) : (Number(l.totalPaid)||0)), 0))}
              </div>
              <div style={{ background:"var(--bluel)", border:"1px solid var(--blueb)", borderRadius:8, padding:"8px 12px", marginTop:8, fontSize:".82em", color:"var(--blue)" }}>
                <Ico n="refresh" s={13}/> Al guardar se actualizará el costo unitario de cada ingrediente en las recetas.
              </div>
            </div>
          )}

          {form.category!=="Ingredientes" && form.unitPrice>0 && (
            <div style={{ background:"var(--bluel)", border:"1px solid var(--blueb)", borderRadius:8, padding:"8px 12px", marginTop:12, fontSize:".82em", color:"var(--blue)" }}>
              <Ico n="refresh" s={13}/> Al guardar, se actualizará el costo de "<strong>{form.concept}</strong>" en las recetas donde aparezca ese ingrediente.
            </div>
          )}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}

      {payModal && <CloseExpenseModal expense={payModal} onClose={()=>setPayModal(null)} onConfirm={closeExpense}/>}
    </div>
  );
}
