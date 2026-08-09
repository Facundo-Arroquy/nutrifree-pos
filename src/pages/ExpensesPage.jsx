/**
 * ExpensesPage — Registro y gestión de gastos.
 *
 * Soporta dos flujos según la categoría:
 *  - "Ingredientes": tabla de líneas donde se elige ingrediente del catálogo.
 *    Al guardar actualiza `ingredients.unit_cost` y `recipe_ingredients.cost` en DB.
 *  - Otras categorías: formulario simple con concepto, proveedor, cantidad y precio.
 *
 * Todo gasto con proveedor genera su cargo en la cuenta corriente del proveedor
 * (supplier_payments). El estado de pago —pendiente / parcial / pagado— se DERIVA
 * de los pagos imputados a ese gasto, así que un mismo gasto puede estar pagado a
 * medias. La deuda se puede saldar desde acá ("Cerrar") o desde Proveedores,
 * eligiendo varios gastos a la vez. Ver utils/supplierAccount.js.
 *
 * Props: expenses, setExpenses, expenseCategories, ingredients, setIngredients,
 *        recipes, setRecipes, suppliers, supplierPayments, setSupplierPayments,
 *        showToast, logAction
 */
import { useState } from "react";
import { Ico, Modal, $, fmtDate, uid, todayStr, PAY_LABELS, useSortable, SortableTh } from "../shared.jsx";
import { supabase, expenseToDb, supplierPaymentToDb } from "../supabase.js";
import {
  planExpenseLedger, expenseStatus, expenseRemaining, expensePaidAmount, expensePaid, expenseChargeAmount,
} from "../utils/supplierAccount.js";

const EXPENSE_UNITS = ["unidades", "kg", "g", "litros", "porciones"];

// Factor máximo de desvío tolerado entre el costo unitario resultante de la línea
// y el costo actual del ingrediente. Si el nuevo costo es >5× o <1/5 del actual,
// probablemente hay un error de carga (típicamente la cantidad tipeada en otra
// unidad, p.ej. gramos en un ingrediente medido en kg → costo ÷1000).
const COST_ANOMALY_FACTOR = 5;

// Devuelve datos de anomalía para una línea, o null si no aplica / no es anómala.
function lineCostAnomaly(line, ingredient, withVat, vatRate) {
  const qty = Number(line.qty || 0);
  const totalPaid = Number(line.totalPaid || 0);
  if (!ingredient || qty <= 0 || totalPaid <= 0) return null;
  const oldCost = Number(ingredient.unitCost || 0);
  if (oldCost <= 0) return null; // sin costo previo no hay con qué comparar
  const effTotal = withVat ? totalPaid * (1 + vatRate / 100) : totalPaid;
  const newCost = effTotal / qty;
  const ratio = newCost / oldCost;
  if (ratio >= COST_ANOMALY_FACTOR || ratio <= 1 / COST_ANOMALY_FACTOR) {
    return { newCost, oldCost, ratio, unit: ingredient.unit || "" };
  }
  return null;
}

function IngredientLinesTable({ lines, ingredients, withVat, vatRate, lineSubcats, updateLine, removeLine, $ }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Total pagado</th>
            <th>Subtotal{withVat ? ` (+${vatRate}% IVA)` : ""}</th>
            {lineSubcats.length > 0 && <th>Subcategoría</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const effTotal = withVat ? (Number(line.totalPaid)||0) * (1 + vatRate / 100) : (Number(line.totalPaid)||0);
            const ing = ingredients.find(i => i.id === line.ingredientId);
            const anomaly = lineCostAnomaly(line, ing, withVat, vatRate);
            return (
              <tr key={idx} style={anomaly ? { background:"var(--amberl, rgba(245,158,11,.08))" } : undefined}>
                <td>
                  <select value={line.ingredientId} onChange={e=>updateLine(idx,"ingredientId",e.target.value)} style={{ minWidth:150 }}>
                    <option value="">— Elegir —</option>
                    {[...ingredients].sort((a,b)=>a.name.localeCompare(b.name)).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </td>
                <td><input type="number" min="0" step="0.01" value={line.qty} onChange={e=>updateLine(idx,"qty",e.target.value)} style={{ width:75 }}/></td>
                <td>
                  {/* Unidad fija = la del ingrediente. El stock y el costo se calculan en esta unidad,
                      por eso no es editable: cargar otra unidad descuadraría stock/costo. */}
                  <span style={{ display:"inline-block", minWidth:60, color: line.unit ? "var(--t2)" : "var(--t4)", fontSize:".9em" }}>
                    {line.unit || "—"}
                  </span>
                </td>
                <td><input type="number" min="0" step="0.01" value={line.totalPaid ?? ""} onChange={e=>updateLine(idx,"totalPaid",e.target.value)} style={{ width:100 }}/></td>
                <td style={{ fontWeight:700, color:"var(--red)" }}>
                  {$(effTotal)}
                  {anomaly && (
                    <div style={{ fontWeight:600, fontSize:".72em", color:"var(--amber, #b45309)", marginTop:2, whiteSpace:"normal", maxWidth:170 }}>
                      <Ico n="alert" s={11}/> Costo ${anomaly.newCost.toFixed(2)}/{anomaly.unit} vs. actual ${anomaly.oldCost.toFixed(2)}. ¿Cantidad en {anomaly.unit}?
                    </div>
                  )}
                </td>
                {lineSubcats.length > 0 && (
                  <td>
                    <select value={line.subcategory||""} onChange={e=>updateLine(idx,"subcategory",e.target.value)} style={{ minWidth:120 }}>
                      <option value="">— Sin subcat. —</option>
                      {lineSubcats.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  {lines.length > 1 && (
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>removeLine(idx)}><Ico n="trash" s={13} c="var(--red)"/></button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CloseExpenseModal({ expense, remaining, onClose, onConfirm }) {
  const [payMethod, setPayMethod] = useState(expense.paymentMethod||"cash");
  const [submitting, setSubmitting] = useState(false);
  const parcial = remaining < expense.total;
  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await onConfirm(expense, payMethod); } finally { setSubmitting(false); }
  };
  return (
    <Modal title="Cerrar gasto" onClose={onClose}>
      <div style={{ background:"var(--s2)", borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
        <div style={{ fontWeight:700 }}>{expense.concept}</div>
        <div style={{ fontSize:".83em", color:"var(--t3)", marginTop:2 }}>{expense.supplier||"Sin proveedor"} · {fmtDate(expense.date)}</div>
        <div style={{ fontWeight:800, color:"var(--red)", fontSize:"1.15em", marginTop:6 }}>
          {parcial
            ? <><span style={{ textDecoration:"line-through", color:"var(--t4)", fontWeight:500 }}>{$(expense.total)}</span> {$(remaining)}</>
            : $(expense.total)}
        </div>
        {parcial && <div style={{ fontSize:".8em", color:"var(--t3)", marginTop:2 }}>Ya se pagaron {$(expense.total - remaining)}. Se registra el resto.</div>}
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
        <button className="btn btn-primary" onClick={handleConfirm} disabled={submitting}>
          <Ico n="check" s={14}/>{submitting ? "Guardando..." : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}

export default function ExpensesPage({ expenses, setExpenses, expenseCategories, expenseSubcategories = [], ingredients, setIngredients, recipes, setRecipes, suppliers, supplierPayments, setSupplierPayments, showToast, logAction, vatRate = 21 }) {
  const emptyLine = (subcategory = "") => ({ ingredientId: "", qty: 1, unit: "", totalPaid: "", subcategory });
  const emptyForm = { date:todayStr(), supplier:"", supplierId:null, concept:"", quantity:1, unit:"unidades", unitPrice:0, total:0, paymentMethod:"", paymentStatus:"pending", category:"Ingredientes", subcategory:"", notes:"", ingredientLines:[emptyLine()], withVat:false };
  const [modal, setModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat] = useState("Todos");
  const [filterSubcat, setFilterSubcat] = useState("Todos");
  const [filterSupplier, setFilterSupplier] = useState("Todos");
  const today = todayStr();
  const [dateFrom, setDateFrom] = useState(today.slice(0,7) + "-01");
  const [dateTo,   setDateTo]   = useState(today);

  const set = (k, v) => setForm(p => {
    const np = {...p, [k]:v};
    if (k==="quantity" || k==="unitPrice") np.total = Number(np.quantity||0) * Number(np.unitPrice||0);
    if (k==="category" && v==="Ingredientes" && (!np.ingredientLines || np.ingredientLines.length===0)) {
      np.ingredientLines = [emptyLine(np.subcategory||"")];
    }
    // Al cambiar categoría, resetear subcategoría
    if (k==="category") np.subcategory = "";
    // Al cambiar subcategoría global en Ingredientes, propagar a todas las líneas que no tienen una propia diferente
    if (k==="subcategory" && np.category==="Ingredientes") {
      np.ingredientLines = (np.ingredientLines||[]).map(l => ({ ...l, subcategory: v }));
    }
    return np;
  });

  const addLine = () => setForm(p => ({ ...p, ingredientLines: [...(p.ingredientLines||[]), emptyLine(p.subcategory||"")] }));
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

  const { sortBy, sortDir, toggleSort } = useSortable("date", "desc");

  // Estado real del gasto: si tiene cuenta corriente se deriva de los pagos
  // imputados; si no (sin proveedor o histórico sin cargo), vale `paymentStatus`.
  const statusOf    = e => expenseStatus(e, supplierPayments);
  const paidOf      = e => expensePaidAmount(e, supplierPayments);
  const remainingOf = e => expenseRemaining(e, supplierPayments);

  const dateFiltered = expenses.filter(inRange);
  const cats = ["Todos", ...expenseCategories];

  // Subcategorías visibles según la categoría seleccionada en el filtro
  const subcatsForFilter = filterCat === "Todos"
    ? expenseSubcategories
    : expenseSubcategories.filter(s => s.categoryName === filterCat);

  const filtered = dateFiltered
    .filter(e => filterStatus==="all" || (filterStatus==="unpaid" ? statusOf(e)!=="paid" : statusOf(e)===filterStatus))
    .filter(e => filterCat==="Todos" || e.category===filterCat)
    .filter(e => {
      if (filterSubcat === "Todos") return true;
      if (e.category === "Ingredientes") {
        return (e.ingredientLines||[]).some(l => l.subcategory === filterSubcat);
      }
      return e.subcategory === filterSubcat;
    })
    .filter(e => filterSupplier==="Todos" || (filterSupplier==="_none" ? !e.supplierId : e.supplierId===filterSupplier))
    .sort((a, b) => {
      let av, bv;
      if      (sortBy === "date")          { av = a.date ?? ""; bv = b.date ?? ""; }
      else if (sortBy === "supplier")      { av = a.supplier ?? ""; bv = b.supplier ?? ""; }
      else if (sortBy === "concept")       { av = a.concept ?? ""; bv = b.concept ?? ""; }
      else if (sortBy === "total")         { av = a.total ?? 0; bv = b.total ?? 0; }
      else if (sortBy === "category")      { av = a.category ?? ""; bv = b.category ?? ""; }
      else if (sortBy === "paymentMethod") { av = a.paymentMethod ?? ""; bv = b.paymentMethod ?? ""; }
      else if (sortBy === "paymentStatus") { av = statusOf(a); bv = statusOf(b); }
      else                                 { av = a.date ?? ""; bv = b.date ?? ""; }
      let v = typeof av === "string" ? av.localeCompare(bv, undefined, { sensitivity:"base" }) : (av - bv);
      return sortDir === "asc" ? v : -v;
    });

  // Se suma lo efectivamente pagado y lo que falta, no el total de gastos según
  // su estado: con pagos parciales un mismo gasto aporta a las dos columnas.
  const totalPaid    = dateFiltered.reduce((a,e)=>a+paidOf(e),0);
  const totalPending = dateFiltered.reduce((a,e)=>a+remainingOf(e),0);

  const openNew  = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = e  => {
    const lines = e.ingredientLines?.length
      ? e.ingredientLines.map(l => ({ ...l, totalPaid: l.totalPaid ?? (Number(l.unitPrice||0) * Number(l.qty||0)), subcategory: l.subcategory || "" }))
      : [emptyLine(e.subcategory || "")];
    setForm({...e, ingredientLines: lines, withVat: e.withVat || false, subcategory: e.subcategory || ""});
    setModal(e);
  };

  // Mapeo de los cambios del plan (camelCase) a columnas de la DB.
  const MOVEMENT_COLUMNS = { supplierId:"supplier_id", amount:"amount", date:"date", notes:"notes", paymentMethod:"payment_method" };

  /**
   * Deja la cuenta corriente del proveedor consistente con el gasto: crea o
   * ajusta el cargo, completa el pago si se marcó como pagado y arrastra los
   * movimientos si cambió de proveedor. Devuelve el estado de pago derivado.
   */
  const syncExpenseLedger = async (expense) => {
    const plan = planExpenseLedger({ expense, movements: supplierPayments });
    let movements = supplierPayments;

    if (plan.remove.length > 0) {
      const { error } = await supabase.from("supplier_payments").delete().in("id", plan.remove);
      if (error) showToast("Error al limpiar la cuenta del proveedor: " + error.message, "error");
      else movements = movements.filter(m => !plan.remove.includes(m.id));
    }
    for (const { id, changes } of plan.update) {
      const patch = Object.fromEntries(Object.entries(changes).map(([k, v]) => [MOVEMENT_COLUMNS[k], v]));
      const { error } = await supabase.from("supplier_payments").update(patch).eq("id", id);
      if (error) showToast("Error al actualizar la cuenta del proveedor: " + error.message, "error");
      else movements = movements.map(m => m.id === id ? { ...m, ...changes } : m);
    }
    if (plan.insert.length > 0) {
      const { error } = await supabase.from("supplier_payments").insert(plan.insert.map(supplierPaymentToDb));
      if (error) showToast("Error al registrar en la cuenta del proveedor: " + error.message, "error");
      else movements = [...movements, ...plan.insert];
    }
    if (movements !== supplierPayments) setSupplierPayments(movements);
    return plan.paymentStatus;
  };

  /**
   * Guarda el gasto y sincroniza la cuenta del proveedor en un solo paso.
   * Si el estado derivado no coincide con el del formulario (p. ej. el gasto ya
   * tenía pagos parciales), manda el derivado y se corrige la fila del gasto.
   */
  const persistExpense = async (data, isNew) => {
    const expense = isNew ? { ...data, id: uid() } : { ...data, id: modal.id };
    const table = supabase.from("expenses");
    const { error } = isNew ? await table.insert(expenseToDb(expense)) : await table.update(expenseToDb(expense)).eq("id", expense.id);
    if (error) { showToast(`Error al ${isNew ? "guardar" : "actualizar"}: ` + error.message, "error"); return null; }

    const derived = await syncExpenseLedger(expense);
    if (derived !== expense.paymentStatus) {
      await supabase.from("expenses").update({ payment_status: derived }).eq("id", expense.id);
      expense.paymentStatus = derived;
    }
    setExpenses(p => isNew
      ? (p.some(x => x.id === expense.id) ? p : [expense, ...p])
      : p.map(e => e.id === expense.id ? { ...e, ...expense } : e));
    return expense;
  };

  const save = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
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
      // Guardrail: si el costo unitario de alguna línea se desvía mucho del actual
      // (típico error de cargar la cantidad en otra unidad), pedir confirmación.
      const anomalies = rawLines
        .map(l => {
          const ing = ingredients.find(i => i.id === l.ingredientId);
          const a = lineCostAnomaly(l, ing, form.withVat, vatRate);
          return a ? { name: ing?.name || "?", ...a } : null;
        })
        .filter(Boolean);
      if (anomalies.length > 0) {
        const detalle = anomalies
          .map(a => `• ${a.name}: nuevo costo $${a.newCost.toFixed(2)}/${a.unit} vs. actual $${a.oldCost.toFixed(2)}/${a.unit}`)
          .join("\n");
        const ok = confirm(
          `El costo de estos ingredientes cambia mucho respecto al actual:\n\n${detalle}\n\n` +
          `Suele pasar cuando la cantidad se carga en otra unidad (ej. gramos en un ingrediente medido en kg).\n\n` +
          `¿Guardar de todas formas?`
        );
        if (!ok) return;
      }
      const concept = validLines.map(l => ingredients.find(i=>i.id===l.ingredientId)?.name||"").filter(Boolean).join(", ");
      const total   = validLines.reduce((a,b)=>a+b.subtotal, 0);
      const data = { ...form, concept, quantity: validLines.reduce((a,b)=>a+Number(b.qty||0),0), unitPrice:0, total, paymentMethod:form.paymentMethod||null };
      if (!await persistExpense(data, modal === "new")) return;
      // Actualizar stock (relativo+atómico) y unit_cost de cada ingrediente
      const isNew = modal === "new";
      const prevLines = isNew ? [] : (modal.ingredientLines || []);

      for (const line of validLines) {
        const price    = Number(line.unitPrice);
        const qty      = Number(line.qty || 0);
        const prevLine = prevLines.find(l => l.ingredientId === line.ingredientId);
        const prevQty  = prevLine ? Number(prevLine.qty || 0) : 0;
        const delta    = isNew ? qty : qty - prevQty;

        // Si no hay cambio de stock ni de precio, no tocar nada
        if (delta === 0 && !price) continue;

        const { data: newStock, error: stockErr } = await supabase.rpc("adjust_ingredient_stock", {
          p_id:        line.ingredientId,
          p_delta:     delta,
          p_unit_cost: price || null,
        });
        if (stockErr) showToast("Error al actualizar stock: " + stockErr.message, "error");
        setIngredients(prev => prev.map(i => i.id === line.ingredientId
          ? { ...i, unitCost: price || i.unitCost, stock: newStock ?? (i.stock + delta) }
          : i
        ));
        if (price) await supabase.from("recipe_ingredients").update({ cost: price }).eq("ingredient_id", line.ingredientId);
      }

      // Revertir stock de ingredientes que fueron eliminados de las líneas (solo al editar)
      if (!isNew) {
        for (const prevLine of prevLines) {
          const stillExists = validLines.find(l => l.ingredientId === prevLine.ingredientId);
          if (!stillExists && Number(prevLine.qty || 0) > 0) {
            const delta = -Number(prevLine.qty);
            const { data: newStock, error: stockErr } = await supabase.rpc("adjust_ingredient_stock", {
              p_id: prevLine.ingredientId, p_delta: delta, p_unit_cost: null,
            });
            if (stockErr) showToast("Error al revertir stock: " + stockErr.message, "error");
            setIngredients(prev => prev.map(i => i.id === prevLine.ingredientId
              ? { ...i, stock: newStock ?? (i.stock + delta) } : i
            ));
          }
        }
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
    if (!await persistExpense(data, modal === "new")) return;
    logAction?.(modal==="new" ? "crear" : "editar", "gasto", `"${data.concept}" — $${data.total} (${data.category})`);
    showToast("Gasto guardado");
    setModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (id) => {
    const expense = expenses.find(e => e.id === id);
    if (confirm("¿Eliminar gasto?")) {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setExpenses(p => p.filter(e => e.id!==id));
      // Limpiar movimientos de cuenta corriente asociados a este gasto
      await supabase.from("supplier_payments").delete().eq("expense_id", id);
      setSupplierPayments(prev => prev.filter(p => p.expenseId !== id));
      logAction?.("eliminar", "gasto", `Eliminó "${expense?.concept}" — $${expense?.total}`);
      showToast("Eliminado");
    }
  };

  /**
   * Cierra un gasto pagando lo que falte. Si tiene proveedor, el pago entra a su
   * cuenta corriente imputado a este gasto (respetando pagos parciales previos).
   */
  const closeExpense = async (expense, paymentMethod) => {
    if (statusOf(expense) === "paid") { showToast("Este gasto ya fue pagado", "error"); setPayModal(null); return; }
    const falta = expenseRemaining(expense, supplierPayments);

    const { error } = await supabase.from("expenses").update({ payment_method: paymentMethod, payment_status:"paid" }).eq("id", expense.id);
    if (error) { showToast("Error al cerrar gasto: " + error.message, "error"); return; }
    setExpenses(p => p.map(e => e.id===expense.id ? {...e, paymentMethod, paymentStatus:"paid"} : e));

    if (expense.supplierId) {
      const payment = { id:crypto.randomUUID(), supplierId:expense.supplierId, expenseId:expense.id, amount:falta, type:"payment", paymentMethod, date:todayStr(), notes:"Pago del gasto" };
      const { error: pe } = await supabase.from("supplier_payments").insert(supplierPaymentToDb(payment));
      if (pe) showToast("Error al registrar el pago al proveedor: " + pe.message, "error");
      else setSupplierPayments(prev => [...prev, payment]);
    }
    logAction?.("pagar", "gasto", `"${expense.concept}" — $${falta} — ${PAY_LABELS[paymentMethod]||paymentMethod}`);
    setPayModal(null);
    showToast("Gasto cerrado ✓");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Gastos</div><div className="page-sub">{dateFiltered.length} en el período</div></div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
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
        {[["all","Todos"],["unpaid","Con saldo"],["pending","Pendientes"],["partial","Parciales"],["paid","Pagados"]].map(([v,l]) => (
          <button key={v} className={`btn btn-sm ${filterStatus===v?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterStatus(v)}>{l}</button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8, alignItems:"center" }}>
        <span style={{ fontSize:".74em", fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:".5px" }}>Cat.:</span>
        {cats.map(c => (
          <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`} onClick={()=>{ setFilterCat(c); setFilterSubcat("Todos"); }}>{c}</button>
        ))}
      </div>
      {subcatsForFilter.length > 0 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8, alignItems:"center" }}>
          <span style={{ fontSize:".74em", fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:".5px" }}>Subcat.:</span>
          <button className={`btn btn-sm ${filterSubcat==="Todos"?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterSubcat("Todos")}>Todas</button>
          {subcatsForFilter.map(s => (
            <button key={s.id} className={`btn btn-sm ${filterSubcat===s.name?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterSubcat(s.name)}>{s.name}</button>
          ))}
        </div>
      )}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
        <span style={{ fontSize:".74em", fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:".5px" }}>Proveedor:</span>
        <select value={filterSupplier} onChange={e=>setFilterSupplier(e.target.value)} style={{ minWidth:180 }}>
          <option value="Todos">Todos</option>
          <option value="_none">Sin proveedor</option>
          {[...suppliers].sort((a,b)=>a.name.localeCompare(b.name)).map(s=>(
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <SortableTh col="date" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Fecha</SortableTh>
            <SortableTh col="supplier" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Proveedor</SortableTh>
            <SortableTh col="concept" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Concepto</SortableTh>
            <th>Cant.</th><th>P. Unit.</th>
            <SortableTh col="total" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Total</SortableTh>
            <SortableTh col="category" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Categoría</SortableTh>
            <th>Subcategoría</th>
            <SortableTh col="paymentMethod" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Método pago</SortableTh>
            <SortableTh col="paymentStatus" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Estado</SortableTh>
            <th></th>
          </tr></thead>
          <tbody>
            {filtered.map(e => {
              const status = statusOf(e);
              const falta  = remainingOf(e);
              return (
              <tr key={e.id} className="tr-click" onClick={()=>openEdit(e)}>
                <td data-label="Fecha" style={{ fontSize:".82em", color:"var(--t3)", whiteSpace:"nowrap" }}>{fmtDate(e.date)}</td>
                <td data-label="Proveedor" style={{ fontWeight:600 }}>{e.supplier||"—"}</td>
                <td data-label="Concepto">{e.concept}</td>
                <td data-label="Cant." style={{ color:"var(--t2)", whiteSpace:"nowrap" }}>{e.quantity} {e.unit}</td>
                <td data-label="P. Unit." style={{ color:"var(--t2)" }}>{$(e.unitPrice)}</td>
                <td data-label="Total" style={{ fontWeight:700, color:"var(--red)", whiteSpace:"nowrap" }}>
                  {/* En un gasto parcialmente pagado se tacha el importe original
                      y se muestra al lado lo que todavía se debe. */}
                  {status === "partial"
                    ? <><span style={{ textDecoration:"line-through", color:"var(--t4)", fontWeight:500 }}>{$(e.total)}</span> {$(falta)}</>
                    : $(e.total)}
                </td>
                <td data-label="Categoría"><span className="tag">{e.category}</span></td>
                <td data-label="Subcategoría" style={{ fontSize:".82em", color:"var(--t3)" }}>
                  {e.category === "Ingredientes"
                    ? (() => {
                        const subcats = [...new Set((e.ingredientLines||[]).map(l=>l.subcategory).filter(Boolean))];
                        return subcats.length > 0 ? subcats.map(s=><span key={s} className="tag" style={{ marginRight:3, fontSize:".78em" }}>{s}</span>) : <span style={{color:"var(--t4)"}}>—</span>;
                      })()
                    : e.subcategory ? <span className="tag" style={{ fontSize:".78em" }}>{e.subcategory}</span> : <span style={{color:"var(--t4)"}}>—</span>
                  }
                </td>
                <td data-label="Método" style={{ fontSize:".82em", color:"var(--t3)" }}>{e.paymentMethod ? PAY_LABELS[e.paymentMethod]||e.paymentMethod : <span style={{color:"var(--t4)"}}>—</span>}</td>
                <td data-label="Estado">
                  {status==="paid"
                    ? <span className="badge badge-green">Pagado</span>
                    : status==="partial"
                      ? <span className="badge badge-amber" style={{ fontWeight:700 }}>Parcial — debe {$(falta)}</span>
                      : <span className="badge badge-amber">Pendiente</span>}
                </td>
                <td data-label="" onClick={ev=>ev.stopPropagation()} style={{ whiteSpace:"nowrap" }}>
                  <div style={{ display:"flex", gap:4, alignItems:"center", justifyContent:"flex-end" }}>
                    {status!=="paid" && (
                      <button className="btn btn-sm btn-primary" style={{ fontSize:".76em", padding:"4px 9px" }} onClick={()=>setPayModal(e)}>
                        <Ico n="check" s={12}/>Cerrar
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(e.id)}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </div>
                </td>
              </tr>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={11}><div className="empty"><div className="empty-icon">💸</div><h3>Sin gastos</h3></div></td></tr>}
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
            {(() => {
              const subcats = expenseSubcategories.filter(s => s.categoryName === form.category);
              if (subcats.length === 0) return null;
              const label = form.category === "Ingredientes" ? "Subcategoría (por defecto para todas las líneas)" : "Subcategoría";
              return (
                <div className="form-group"><label className="lbl">{label}</label>
                  <select value={form.subcategory||""} onChange={e=>set("subcategory", e.target.value)}>
                    <option value="">— Sin subcategoría —</option>
                    {subcats.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              );
            })()}
            <div className="form-group"><label className="lbl">Método de pago</label>
              <select value={form.paymentMethod||""} onChange={e=>set("paymentMethod",e.target.value||null)}>
                <option value="">Pendiente</option>
                {Object.entries(PAY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {(() => {
              // Con pagos ya imputados el estado lo manda la cuenta corriente:
              // para revertir hay que borrar el movimiento desde Proveedores.
              const yaPagado = modal !== "new" && form.supplierId ? expensePaid(supplierPayments, modal.id) : 0;
              if (yaPagado > 0) {
                const falta = Math.max(0, expenseChargeAmount(modal, supplierPayments) - yaPagado);
                return (
                  <div className="form-group"><label className="lbl">Estado de pago</label>
                    <div style={{ padding:"9px 0" }}>
                      {falta > 0
                        ? <span className="badge badge-amber" style={{ fontWeight:700 }}>Parcial — debe {$(falta)}</span>
                        : <span className="badge badge-green">Pagado</span>}
                      <div style={{ fontSize:".76em", color:"var(--t3)", marginTop:4 }}>
                        Pagado {$(yaPagado)}. Se gestiona desde la cuenta del proveedor.
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div className="form-group"><label className="lbl">Estado de pago</label>
                  <select value={form.paymentStatus} onChange={e=>set("paymentStatus",e.target.value)}>
                    <option value="pending">Pendiente</option>
                    <option value="paid">Pagado</option>
                  </select>
                </div>
              );
            })()}
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
              <IngredientLinesTable
                lines={form.ingredientLines||[]}
                ingredients={ingredients}
                withVat={form.withVat}
                vatRate={vatRate}
                lineSubcats={expenseSubcategories.filter(s => s.categoryName === "Ingredientes")}
                updateLine={updateLine}
                removeLine={removeLine}
                $={$}
              />
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
            <button className="btn btn-primary" onClick={save} disabled={submitting}>
              <Ico n="check" s={13}/>{submitting ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </Modal>
      )}

      {payModal && <CloseExpenseModal expense={payModal} remaining={remainingOf(payModal)} onClose={()=>setPayModal(null)} onConfirm={closeExpense}/>}
    </div>
  );
}
