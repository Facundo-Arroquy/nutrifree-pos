/**
 * CustomersPage — CRUD de clientes y cuenta corriente.
 *
 * Lista clientes con su saldo calculado en tiempo real a partir de
 * account_payments (charges - payments). Permite registrar pagos manuales
 * vinculados a pedidos específicos o como pago genérico.
 *
 * Props: customers, setCustomers, sales, accountPayments, setAccountPayments, showToast, logAction
 */
import { useState, useEffect } from "react";
import { Ico, Modal, $, fmtDate, uid, PAY_LABELS, STATUS_LABELS, STATUS_COLORS, todayStr, useSortable, SortableTh } from "../shared.jsx";
import { supabase, customerToDb, accountPaymentToDb, dbToAccountPayment } from "../supabase.js";

export default function CustomersPage({ customers, setCustomers, sales, accountPayments, setAccountPayments, showToast, logAction }) {
  // Sincronizar account_payments al abrir la página, para no depender sólo del realtime
  useEffect(() => {
    const fetchAll = async () => {
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from("account_payments")
          .select("*").order("created_at", { ascending: false })
          .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < 1000) break;
        from += 1000;
      }
      if (all.length > 0) setAccountPayments(all.map(dbToAccountPayment));
    };
    fetchAll();
  }, []);
  const custBal = (id) =>
    accountPayments.filter(p => p.customerId === id)
      .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);

  // Saldo pendiente de un pedido: lo que queda por pagar (charge - sum de payments parciales)
  const getOrderBalance = (saleId) => {
    const charge = accountPayments.find(p => p.saleId === saleId && p.type === "charge");
    if (!charge) return 0;
    const paid = accountPayments
      .filter(p => p.saleId === saleId && p.type === "payment")
      .reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, charge.amount - paid);
  };

  // Pedidos en cuenta con saldo pendiente > 0 (incluye parcialmente pagados)
  const getUnpaidOrders = (customerId) =>
    sales
      .filter(s =>
        s.customerId === customerId &&
        s.paymentMethod === "account" &&
        s.status === "closed" &&
        getOrderBalance(s.id) > 0
      )
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Calcula cómo se aplica el crédito disponible a cada pedido pendiente (de más antiguo a más nuevo).
  // Usa solo movimientos SIN saleId para calcular la deuda/crédito "desvinculada" (apertura, pagos manuales).
  // Los pedidos vinculados se muestran por separado mediante getUnpaidOrders — evita contarlos dos veces.
  const computeAllocations = (customerId) => {
    const totalBalance = accountPayments
      .filter(p => p.customerId === customerId && !p.saleId)
      .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);
    const initialDebt = Math.max(0, -totalBalance);
    let creditLeft = Math.max(0, totalBalance);
    const result = [];
    if (initialDebt > 0) {
      const creditApplied = Math.min(creditLeft, initialDebt);
      creditLeft -= creditApplied;
      result.push({ isInitialDebt: true, sale: { id: "__initial__" }, orderBal: initialDebt, creditApplied, remaining: initialDebt - creditApplied });
    }
    const unpaid = getUnpaidOrders(customerId);
    for (const sale of unpaid) {
      const orderBal = getOrderBalance(sale.id);
      const creditApplied = Math.min(creditLeft, orderBal);
      creditLeft -= creditApplied;
      result.push({ isInitialDebt: false, sale, orderBal, creditApplied, remaining: orderBal - creditApplied });
    }
    return result;
  };

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | customer
  const [form, setForm] = useState({ name:"", phone:"", address:"", notes:"", priceList:"retail", discountPct:0, email:"", cuit:"", defaultBilling:false });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const [payModal, setPayModal] = useState(null); // customer object
  const [payForm, setPayForm] = useState({ amount:"", paymentMethod:"cash", notes:"" });
  const [cashSelectedIds, setCashSelectedIds] = useState(new Set()); // pedidos seleccionados para pago adicional en cash
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [listExpandedSaleId, setListExpandedSaleId] = useState(null);
  const [expandedMovId, setExpandedMovId] = useState(null);

  const toggleCustomer = (id) => {
    setExpandedCustomerId(prev => prev === id ? null : id);
    setListExpandedSaleId(null);
  };

  const openPayModal = (customer) => {
    const allocations = computeAllocations(customer.id);
    const withRemaining = allocations.filter(a => a.remaining > 0);
    setCashSelectedIds(new Set(withRemaining.map(a => a.sale.id)));
    const cashTotal = withRemaining.reduce((sum, a) => sum + a.remaining, 0);
    setPayForm({ amount: cashTotal > 0 ? String(cashTotal) : "", paymentMethod: "cash", notes: "" });
    setPayModal(customer);
  };

  const toggleCashSelection = (saleId, remaining) => {
    const next = new Set(cashSelectedIds);
    if (next.has(saleId)) next.delete(saleId);
    else next.add(saleId);
    setCashSelectedIds(next);
    // Recalcular monto sugerido con los seleccionados
    const allocations = computeAllocations(payModal.id);
    const newTotal = allocations
      .filter(a => a.remaining > 0 && next.has(a.sale.id))
      .reduce((sum, a) => sum + a.remaining, 0);
    setPayForm(p => ({ ...p, amount: newTotal > 0 ? String(newTotal) : "" }));
  };

  const { sortBy, sortDir, toggleSort } = useSortable("name", "asc");

  const filtered = customers
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    .sort((a, b) => {
      let av, bv;
      if (sortBy === "balance")      { av = custBal(a.id); bv = custBal(b.id); }
      else if (sortBy === "name")    { av = a.name ?? ""; bv = b.name ?? ""; }
      else if (sortBy === "phone")   { av = a.phone ?? ""; bv = b.phone ?? ""; }
      else if (sortBy === "priceList") { av = a.priceList ?? ""; bv = b.priceList ?? ""; }
      else if (sortBy === "discountPct") { av = a.discountPct ?? 0; bv = b.discountPct ?? 0; }
      else                           { av = a.name ?? ""; bv = b.name ?? ""; }
      let v = typeof av === "string" ? av.localeCompare(bv, undefined, { sensitivity:"base" }) : (av - bv);
      return sortDir === "asc" ? v : -v;
    });

  const totalDebt = customers.reduce((sum, c) => {
    const b = custBal(c.id);
    return b < 0 ? sum + Math.abs(b) : sum;
  }, 0);
  const debtorsCount = customers.filter(c => custBal(c.id) < 0).length;

  const openNew = () => { setForm({ name:"", phone:"", address:"", notes:"", priceList:"retail", balance:0, discountPct:0, email:"", cuit:"", defaultBilling:false }); setExpandedSaleId(null); setModal("new"); };
  const openEdit = c => { setForm({...c}); setExpandedSaleId(null); setModal(c); };

  const save = async () => {
    if (saving) return;
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    setSaving(true);
    try {
      if (modal==="new") {
        const newCustomer = {...form, id:uid()};
        const { error } = await supabase.from("customers").insert(customerToDb(newCustomer));
        if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
        setCustomers(p => [...p, newCustomer]);
        logAction?.("crear", "cliente", `Creó "${newCustomer.name}" — lista ${newCustomer.priceList}`);
      } else {
        const updated = {...form};
        const { error } = await supabase.from("customers").update(customerToDb(updated)).eq("id", modal.id);
        if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
        setCustomers(p => p.map(c => c.id===modal.id ? {...c,...updated} : c));
        logAction?.("editar", "cliente", `Editó "${updated.name}"`);
      }
      setModal(null);
      showToast("Cliente guardado");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    const customer = customers.find(c => c.id === id);
    const hasPayments = accountPayments.some(p => p.customerId === id);
    const msg = hasPayments
      ? "Este cliente tiene movimientos en cuenta corriente. ¿Eliminar cliente y todos sus movimientos?"
      : "¿Eliminar cliente?";
    if (confirm(msg)) {
      if (hasPayments) {
        const { error } = await supabase.from("account_payments").delete().eq("customer_id", id);
        if (error) { showToast("Error al eliminar movimientos: " + error.message, "error"); return; }
        setAccountPayments(p => p.filter(x => x.customerId !== id));
      }
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setCustomers(p=>p.filter(c=>c.id!==id));
      logAction?.("eliminar", "cliente", `Eliminó "${customer?.name}"`);
      showToast("Eliminado");
    }
  };


  const registerPayment = async () => {
    if (paying) return;
    const allocations = computeAllocations(payModal.id);

    const initialDebtAlloc = allocations.find(a => a.isInitialDebt);
    const creditForOrders = allocations.filter(a => !a.isInitialDebt && a.creditApplied > 0);
    const creditForInitial = initialDebtAlloc?.creditApplied ?? 0;
    const totalCreditUsed = creditForOrders.reduce((sum, a) => sum + a.creditApplied, 0) + creditForInitial;

    // Sanear formato argentino: "10.000,50" → 10000.50
    const cashAmount = Number(String(payForm.amount).replace(/\./g, "").replace(",", ".")) || 0;
    const cashSelected = allocations.filter(a => a.remaining > 0 && cashSelectedIds.has(a.sale.id));

    if (totalCreditUsed === 0 && cashAmount === 0) {
      showToast("No hay saldo a favor ni monto ingresado", "error"); return;
    }
    setPaying(true);
    try {

    const allNewPayments = [];

    // 1. Crédito → pedidos: crear AP payment por pedido + cargo de consumo de crédito (sin saleId).
    // El payment marca el pedido como pagado; el charge consume el crédito desvinculado.
    // Efecto neto en custBal: 0 (se cancelan). Solo cambia el crédito disponible no vinculado.
    for (const { sale, creditApplied } of creditForOrders) {
      const p = {
        id: crypto.randomUUID(), customerId: payModal.id, saleId: sale.id,
        amount: creditApplied, type: "payment", paymentMethod: "balance",
        date: todayStr(), notes: "Saldo a favor aplicado",
      };
      const { error } = await supabase.from("account_payments").insert(accountPaymentToDb(p));
      if (error) { showToast("Error al registrar pago con saldo: " + error.message, "error"); return; }
      allNewPayments.push(p);

      const consumption = {
        id: crypto.randomUUID(), customerId: payModal.id, saleId: null,
        amount: creditApplied, type: "charge", paymentMethod: "balance",
        date: todayStr(), notes: "Crédito consumido",
      };
      const { error: ce } = await supabase.from("account_payments").insert(accountPaymentToDb(consumption));
      if (ce) { showToast("Error al consumir crédito: " + ce.message, "error"); return; }
      allNewPayments.push(consumption);
    }

    // 2. Crédito → deuda inicial: crear AP charge para consumir el excedente AP, reduce la deuda
    if (creditForInitial > 0) {
      const p = {
        id: crypto.randomUUID(), customerId: payModal.id, saleId: null,
        amount: creditForInitial, type: "charge", paymentMethod: "balance",
        date: todayStr(), notes: "Deuda inicial cubierta con crédito",
      };
      const { error } = await supabase.from("account_payments").insert(accountPaymentToDb(p));
      if (error) { showToast("Error al aplicar crédito a deuda inicial: " + error.message, "error"); return; }
      allNewPayments.push(p);
    }

    // 3. Efectivo/transferencia por cada ítem seleccionado
    let cashLeft = cashAmount;
    for (const { isInitialDebt, sale, remaining } of cashSelected) {
      const applied = Math.min(cashLeft, remaining);
      if (applied <= 0) break;
      cashLeft -= applied;
      if (isInitialDebt) {
        // La deuda ya está registrada en AP (como charge sin saleId, ej. "Saldo apertura").
        // Solo registrar el pago; no crear un charge adicional para evitar duplicar la deuda.
        const payRecord = {
          id: crypto.randomUUID(), customerId: payModal.id, saleId: null,
          amount: applied, type: "payment", paymentMethod: payForm.paymentMethod,
          date: todayStr(), notes: payForm.notes || "Pago de saldo previo",
        };
        const { error: pe } = await supabase.from("account_payments").insert(accountPaymentToDb(payRecord));
        if (pe) { showToast("Error al registrar pago: " + pe.message, "error"); return; }
        allNewPayments.push(payRecord);
      } else {
        const p = {
          id: crypto.randomUUID(), customerId: payModal.id, saleId: sale.id,
          amount: applied, type: "payment", paymentMethod: payForm.paymentMethod,
          date: todayStr(), notes: payForm.notes,
        };
        const { error } = await supabase.from("account_payments").insert(accountPaymentToDb(p));
        if (error) { showToast("Error al registrar pago: " + error.message, "error"); return; }
        allNewPayments.push(p);
      }
    }

    // Excedente de efectivo → crédito genérico sin saleId
    if (cashLeft > 0) {
      const p = {
        id: crypto.randomUUID(), customerId: payModal.id, saleId: null,
        amount: cashLeft, type: "payment", paymentMethod: payForm.paymentMethod,
        date: todayStr(), notes: payForm.notes,
      };
      const { error } = await supabase.from("account_payments").insert(accountPaymentToDb(p));
      if (error) { showToast("Error al registrar excedente: " + error.message, "error"); return; }
      allNewPayments.push(p);
    }

    if (allNewPayments.length > 0) setAccountPayments(prev => {
      const ids = new Set(prev.map(p => p.id));
      return [...prev, ...allNewPayments.filter(p => !ids.has(p.id))];
    });

    const desc = [
      totalCreditUsed > 0 ? `saldo $${totalCreditUsed}` : "",
      cashAmount > 0 ? `${PAY_LABELS[payForm.paymentMethod]||""} $${cashAmount}` : "",
    ].filter(Boolean).join(" + ");
      logAction?.("pago", "cuenta_corriente", `"${payModal.name}" — ${desc}`);
      setPayModal(null);
      showToast("Pago registrado");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Clientes</div><div className="page-sub">{customers.length} registrados</div></div>
        <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo cliente</button>
      </div>

      {totalDebt > 0 && (
        <div className="card" style={{ marginBottom:16, display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Ico n="alert" s={16} c="var(--red)"/>
            <span style={{ fontSize:".84em", color:"var(--t2)" }}>Total adeudado en cuentas corrientes</span>
          </div>
          <div style={{ fontWeight:700, fontSize:"1.2em", color:"var(--red)" }}>{$(totalDebt)}</div>
          <div style={{ fontSize:".8em", color:"var(--t3)", marginLeft:"auto" }}>{debtorsCount} cliente{debtorsCount!==1?"s":""} con deuda</div>
        </div>
      )}

      <div className="search-wrap" style={{ marginBottom:16, maxWidth:320 }}>
        <div className="search-ico"><Ico n="search" s={14}/></div>
        <input placeholder="Buscar por nombre o teléfono..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th></th>
            <SortableTh col="name" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Nombre</SortableTh>
            <SortableTh col="phone" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Teléfono</SortableTh>
            <SortableTh col="priceList" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Lista</SortableTh>
            <SortableTh col="discountPct" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Descuento</SortableTh>
            <th>Factura</th>
            <SortableTh col="balance" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Saldo</SortableTh>
            <th>Notas</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(c => {
              const custSalesAll = sales.filter(s=>s.customerId===c.id);
              const isExpanded = expandedCustomerId === c.id;
              return (
                <>
                  <tr key={c.id} className="tr-click" onClick={()=>toggleCustomer(c.id)}>
                    <td style={{ width:32, textAlign:"center" }}>
                      <span style={{ display:"inline-block", transition:"transform .15s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                        <Ico n="chevron" s={13} c="var(--t3)"/>
                      </span>
                    </td>
                    <td data-label="Nombre">
                      <div style={{ fontWeight:600 }}>{c.name}</div>
                      <div style={{ fontSize:".76em", color:"var(--t3)" }}>{custSalesAll.length} compra{custSalesAll.length!==1?"s":""}</div>
                    </td>
                    <td data-label="Teléfono" style={{ color:"var(--t2)" }}>{c.phone||"—"}</td>
                    <td data-label="Lista"><span className={`badge ${c.priceList==="wholesale"?"badge-blue":"badge-green"}`}>{c.priceList==="wholesale"?"Mayorista":"Minorista"}</span></td>
                    <td data-label="Descuento">{(c.discountPct||0)>0 ? <span className="badge badge-amber">{c.discountPct}%</span> : <span style={{color:"var(--t4)"}}>—</span>}</td>
                    <td data-label="Factura">{c.defaultBilling ? <span className="badge badge-green" title="Facturación activa por defecto">🧾 Sí</span> : <span style={{color:"var(--t4)"}}>—</span>}</td>
                    <td data-label="Saldo">{(() => { const b = custBal(c.id); return <span className={b>0?"balance-pos":b<0?"balance-neg":"balance-zero"}>{$(b)}</span>; })()}</td>
                    <td data-label="Notas" style={{ color:"var(--t3)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.notes||"—"}</td>
                    <td data-label="" style={{ whiteSpace:"nowrap" }}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={e=>{e.stopPropagation();openEdit(c);}}><Ico n="edit" s={13}/></button>
                      <button className="btn btn-amber btn-sm" style={{ marginLeft:4 }} onClick={e=>{e.stopPropagation();openPayModal(c);}}>Pago</button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft:4 }} onClick={e=>{e.stopPropagation();del(c.id);}}><Ico n="trash" s={13} c="var(--red)"/></button>
                    </td>
                  </tr>
                  {isExpanded && (() => {
                    const custMovs = accountPayments
                      .filter(p => p.customerId === c.id)
                      .sort((a,b) => new Date(b.createdAt||b.date) - new Date(a.createdAt||a.date));
                    const custSales = sales
                      .filter(s => s.customerId === c.id)
                      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
                    const payStatus = (s) => {
                      if (s.status === "cancelled") return null;
                      if (s.status !== "closed") return { label:"Sin cobrar", cls:"badge-gray" };
                      if (s.paymentMethod !== "account") return { label:"Pagado", cls:"badge-green" };
                      const charge = accountPayments.find(p => p.saleId === s.id && p.type === "charge");
                      if (!charge) return { label:"Pagado", cls:"badge-green" };
                      const paid = accountPayments.filter(p => p.saleId === s.id && p.type === "payment").reduce((sum,p) => sum + p.amount, 0);
                      if (paid >= charge.amount) return { label:"Pagado", cls:"badge-green" };
                      if (paid > 0) return { label:`Parcial — debe ${$(charge.amount - paid)}`, cls:"badge-amber" };
                      return { label:`Pendiente ${$(charge.amount)}`, cls:"badge-red" };
                    };
                    const bal = custBal(c.id);
                    return (
                      <tr key={c.id+"-expand"}>
                        <td colSpan={8} style={{ padding:0, background:"var(--bg2)", borderBottom:"2px solid var(--border)" }}>
                          <div style={{ padding:"12px 16px" }}>

                            {/* Saldo actual */}
                            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                              <span style={{ fontSize:".8em", fontWeight:600, color:"var(--t2)", textTransform:"uppercase", letterSpacing:".05em" }}>Saldo actual:</span>
                              <span className={bal > 0 ? "balance-pos" : bal < 0 ? "balance-neg" : "balance-zero"} style={{ fontWeight:700 }}>{$(bal)}</span>
                            </div>

                            {/* Historial cuenta corriente */}
                            <div style={{ fontSize:".8em", fontWeight:600, color:"var(--t2)", marginBottom:8, textTransform:"uppercase", letterSpacing:".05em" }}>
                              Historial cuenta corriente
                            </div>
                            {custMovs.length === 0 ? (
                              <div style={{ fontSize:".85em", color:"var(--t4)", padding:"8px 0", marginBottom:14 }}>Sin movimientos registrados.</div>
                            ) : (
                              <table style={{ width:"100%", fontSize:".85em", marginBottom:16 }}>
                                <thead>
                                  <tr style={{ color:"var(--t3)" }}>
                                    <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Fecha</th>
                                    <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Tipo</th>
                                    <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Método</th>
                                    <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Notas</th>
                                    <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"right" }}>Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {custMovs.map(p => {
                                    const isInternal = p.paymentMethod === "balance";
                                    return (
                                    <tr key={p.id} style={{ borderTop:"1px solid var(--border)", opacity: isInternal ? 0.55 : 1 }}>
                                      <td style={{ padding:"6px 8px", color:"var(--t3)", whiteSpace:"nowrap" }}>{fmtDate(p.date)}</td>
                                      <td style={{ padding:"6px 8px" }}>
                                        {isInternal
                                          ? <span className="badge badge-gray">Mov. crédito</span>
                                          : <span className={`badge ${p.type==="charge"?"badge-red":"badge-green"}`}>{p.type==="charge"?"Cargo":"Pago"}</span>
                                        }
                                      </td>
                                      <td style={{ padding:"6px 8px" }}>{PAY_LABELS[p.paymentMethod]||"—"}</td>
                                      <td style={{ padding:"6px 8px", color:"var(--t3)", fontSize:".82em" }}>{p.notes||"—"}</td>
                                      <td style={{ padding:"6px 8px", fontWeight:700, textAlign:"right", color: isInternal ? "var(--t4)" : p.type==="charge"?"var(--red)":"var(--green)" }}>
                                        {p.type==="charge"?"-":"+"}{$(p.amount)}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}

                            {/* Historial de pedidos */}
                            {custSales.length > 0 && (
                              <>
                                <div style={{ fontSize:".8em", fontWeight:600, color:"var(--t2)", marginBottom:8, textTransform:"uppercase", letterSpacing:".05em" }}>
                                  Historial de pedidos
                                </div>
                                <table style={{ width:"100%", fontSize:".85em" }}>
                                  <thead>
                                    <tr style={{ color:"var(--t3)" }}>
                                      <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Fecha</th>
                                      <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Estado</th>
                                      <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Total</th>
                                      <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Método</th>
                                      <th style={{ padding:"4px 8px", fontWeight:500, textAlign:"left" }}>Pago</th>
                                      <th style={{ width:24 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {custSales.map(s => {
                                      const ps = payStatus(s);
                                      const isOpen = listExpandedSaleId === s.id;
                                      return (
                                        <>
                                          <tr key={s.id} className="tr-click" style={{ borderTop:"1px solid var(--border)" }}
                                              onClick={() => setListExpandedSaleId(isOpen ? null : s.id)}>
                                            <td style={{ padding:"6px 8px", color:"var(--t3)", whiteSpace:"nowrap", fontSize:".9em" }}>{fmtDate(s.createdAt)}</td>
                                            <td style={{ padding:"6px 8px" }}><span className={`badge ${STATUS_COLORS[s.status]||"badge-gray"}`}>{STATUS_LABELS[s.status]||s.status}</span></td>
                                            <td style={{ padding:"6px 8px", fontWeight:700 }}>{$(s.total)}</td>
                                            <td style={{ padding:"6px 8px", fontSize:".84em" }}>{PAY_LABELS[s.paymentMethod]||"—"}</td>
                                            <td style={{ padding:"6px 8px" }}>{ps ? <span className={`badge ${ps.cls}`}>{ps.label}</span> : <span style={{ color:"var(--t4)" }}>—</span>}</td>
                                            <td style={{ padding:"6px 8px", textAlign:"center" }}>
                                              <span style={{ display:"inline-block", transition:"transform .15s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                                                <Ico n="chevron" s={12} c="var(--t3)"/>
                                              </span>
                                            </td>
                                          </tr>
                                          {isOpen && (
                                            <tr key={s.id+"-det"}>
                                              <td colSpan={6} style={{ padding:"0 8px 10px 8px", background:"var(--bg3, var(--bg2))" }}>
                                                <div style={{ padding:"8px 4px", fontSize:".85em" }}>
                                                  {s.items.map((item, i) => (
                                                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 8px", borderBottom:"1px solid var(--border)", gap:8 }}>
                                                      <span style={{ color:"var(--t1)", flex:1 }}>{item.name}</span>
                                                      <span style={{ color:"var(--t3)", minWidth:60, textAlign:"center" }}>x{item.qty}</span>
                                                      <span style={{ fontWeight:600, minWidth:80, textAlign:"right" }}>{$(item.subtotal)}</span>
                                                    </div>
                                                  ))}
                                                  <div style={{ display:"flex", justifyContent:"flex-end", padding:"6px 8px 0", fontWeight:700, fontSize:"1em" }}>
                                                    Total: {$(s.total)}
                                                  </div>
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                </>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">👥</div><h3>Sin clientes</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Historial global de movimientos C/C */}
      {accountPayments.length > 0 && (() => {
        const allMovs = [...accountPayments].sort((a,b) => new Date(b.createdAt||b.date) - new Date(a.createdAt||a.date));
        return (
          <div className="card" style={{ marginTop:24 }}>
            <div style={{ fontSize:".95em", fontWeight:700, marginBottom:14 }}>Historial de movimientos C/C</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width:32 }}></th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Método</th>
                    <th style={{ textAlign:"right" }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {allMovs.map(p => {
                    const cust = customers.find(c => c.id === p.customerId);
                    const linkedSale = p.saleId ? sales.find(s => s.id === p.saleId) : null;
                    const isOpen = expandedMovId === p.id;
                    return (
                      <>
                        <tr key={p.id} className="tr-click" onClick={() => setExpandedMovId(isOpen ? null : p.id)}>
                          <td style={{ textAlign:"center" }}>
                            <span style={{ display:"inline-block", transition:"transform .15s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                              <Ico n="chevron" s={13} c="var(--t3)"/>
                            </span>
                          </td>
                          <td style={{ color:"var(--t3)", fontSize:".88em", whiteSpace:"nowrap" }}>{fmtDate(p.date)}</td>
                          <td style={{ fontWeight:600 }}>{cust?.name || "—"}</td>
                          <td>
                            {p.paymentMethod === "balance"
                              ? <span className="badge badge-gray">Mov. crédito</span>
                              : <span className={`badge ${p.type==="charge"?"badge-red":"badge-green"}`}>{p.type==="charge"?"Cargo":"Pago"}</span>
                            }
                          </td>
                          <td style={{ fontSize:".88em" }}>{PAY_LABELS[p.paymentMethod]||"—"}</td>
                          <td style={{ fontWeight:700, textAlign:"right", color: p.paymentMethod==="balance" ? "var(--t4)" : p.type==="charge"?"var(--red)":"var(--green)" }}>
                            {p.type==="charge"?"-":"+"}{$(p.amount)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={p.id+"-detail"}>
                            <td colSpan={6} style={{ padding:"0 16px 12px 48px", background:"var(--bg2)" }}>
                              <div style={{ display:"flex", gap:32, flexWrap:"wrap", paddingTop:10, fontSize:".87em" }}>
                                {p.notes && (
                                  <div>
                                    <div style={{ color:"var(--t3)", marginBottom:2, fontSize:".82em", textTransform:"uppercase", fontWeight:600 }}>Notas</div>
                                    <div>{p.notes}</div>
                                  </div>
                                )}
                                {linkedSale && (
                                  <div style={{ flex:1, minWidth:200 }}>
                                    <div style={{ color:"var(--t3)", marginBottom:6, fontSize:".82em", textTransform:"uppercase", fontWeight:600 }}>
                                      Pedido vinculado — {fmtDate(linkedSale.createdAt)} — {$(linkedSale.total)}
                                    </div>
                                    {linkedSale.items.map((item, i) => (
                                      <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"3px 0", borderBottom:"1px solid var(--border)" }}>
                                        <span style={{ color:"var(--t1)", flex:1 }}>{item.name}</span>
                                        <span style={{ color:"var(--t3)" }}>×{item.qty}</span>
                                        <span style={{ fontWeight:600 }}>{$(item.subtotal)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {!p.notes && !linkedSale && (
                                  <div style={{ color:"var(--t4)" }}>Sin detalles adicionales.</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {modal && (
        <Modal title={modal==="new"?"Nuevo cliente":form.name} onClose={()=>setModal(null)}>
          <div className="form-grid" style={{ marginBottom:14 }}>
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>set("name",e.target.value)} autoFocus/></div>
            <div className="form-group"><label className="lbl">Teléfono</label><input value={form.phone} onChange={e=>set("phone",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Email</label><input type="email" value={form.email||""} onChange={e=>set("email",e.target.value)} placeholder="correo@ejemplo.com"/></div>
            <div className="form-group"><label className="lbl">CUIT / CUIL</label><input value={form.cuit||""} onChange={e=>set("cuit",e.target.value)} placeholder="20-12345678-9"/></div>
            <div className="form-group"><label className="lbl">Lista de precios</label>
              <select value={form.priceList} onChange={e=>set("priceList",e.target.value)}>
                <option value="retail">Minorista</option>
                <option value="wholesale">Mayorista</option>
              </select>
            </div>
            <div className="form-group full"><label className="lbl">Dirección</label><input value={form.address} onChange={e=>set("address",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Descuento por defecto (%)</label><input type="number" min="0" max="100" value={form.discountPct||0} onChange={e=>set("discountPct",e.target.value)}/></div>
            <div className="form-group">
              <label className="lbl">Facturación por defecto</label>
              <button type="button"
                onClick={()=>set("defaultBilling",!form.defaultBilling)}
                style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"8px 12px", borderRadius:7, cursor:"pointer",
                  fontWeight:600, fontSize:".86em", width:"100%",
                  border:`1.5px solid ${form.defaultBilling?"var(--green)":"var(--border)"}`,
                  background: form.defaultBilling?"var(--greenl)":"var(--s1)",
                  color: form.defaultBilling?"var(--green)":"var(--t3)",
                  transition:"all .15s",
                }}>
                <span>🧾 Generar factura siempre</span>
                <span style={{ fontSize:".82em", fontWeight:700 }}>{form.defaultBilling?"Sí":"No"}</span>
              </button>
            </div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>set("notes",e.target.value)}/></div>
          </div>
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
                          <td data-label="Fecha" style={{ fontSize:".82em", color:"var(--t3)" }}>{fmtDate(p.date)}</td>
                          <td data-label="Tipo">
                            {p.paymentMethod === "balance"
                              ? <span className="badge badge-gray">Mov. crédito</span>
                              : <span className={`badge ${p.type==="charge"?"badge-red":"badge-green"}`}>{p.type==="charge"?"Cargo":"Pago"}</span>
                            }
                          </td>
                          <td data-label="Monto" style={{ fontWeight:700, color: p.paymentMethod==="balance" ? "var(--t4)" : p.type==="charge"?"var(--red)":"var(--green)" }}>
                            {p.type==="charge"?"-":"+"}{$(p.amount)}
                          </td>
                          <td data-label="Método" style={{ fontSize:".84em" }}>{PAY_LABELS[p.paymentMethod]||"—"}</td>
                          <td data-label="Notas" style={{ fontSize:".82em", color:"var(--t3)" }}>{p.notes||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          {modal!=="new" && (() => {
            const custSales = sales
              .filter(s => s.customerId === modal.id)
              .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (!custSales.length) return null;

            const payStatus = (s) => {
              if (s.status === "cancelled") return null;
              if (s.status !== "closed") return { label: "Sin cobrar", cls: "badge-gray" };
              if (s.paymentMethod !== "account") return { label: "Pagado", cls: "badge-green" };
              const charge = accountPayments.find(p => p.saleId === s.id && p.type === "charge");
              if (!charge) return { label: "Pagado", cls: "badge-green" };
              const paid = accountPayments.filter(p => p.saleId === s.id && p.type === "payment").reduce((sum, p) => sum + p.amount, 0);
              if (paid >= charge.amount) return { label: "Pagado", cls: "badge-green" };
              if (paid > 0) return { label: `Parcial — debe ${$(charge.amount - paid)}`, cls: "badge-amber" };
              return { label: `Pendiente ${$(charge.amount)}`, cls: "badge-red" };
            };

            return (
              <div style={{ marginBottom:14 }}>
                <div className="section-title">Historial de pedidos</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Fecha</th><th>Estado</th><th>Total</th><th>Método</th><th>Pago</th><th></th></tr>
                    </thead>
                    <tbody>
                      {custSales.map(s => {
                        const ps = payStatus(s);
                        return (
                        <>
                          <tr key={s.id} className="tr-click" onClick={() => setExpandedSaleId(expandedSaleId === s.id ? null : s.id)}>
                            <td data-label="Fecha" style={{ fontSize:".82em", color:"var(--t3)" }}>{fmtDate(s.createdAt)}</td>
                            <td data-label="Estado"><span className={`badge ${STATUS_COLORS[s.status]||"badge-gray"}`}>{STATUS_LABELS[s.status]||s.status}</span></td>
                            <td data-label="Total" style={{ fontWeight:700 }}>{$(s.total)}</td>
                            <td data-label="Método" style={{ fontSize:".84em" }}>{PAY_LABELS[s.paymentMethod]||"—"}</td>
                            <td data-label="Pago">{ps ? <span className={`badge ${ps.cls}`}>{ps.label}</span> : <span style={{ color:"var(--t4)" }}>—</span>}</td>
                            <td data-label="" style={{ textAlign:"center" }}>
                              <span style={{ display:"inline-block", transition:"transform .15s", transform: expandedSaleId===s.id ? "rotate(180deg)" : "rotate(0deg)" }}>
                                <Ico n="chevron" s={13} c="var(--t3)"/>
                              </span>
                            </td>
                          </tr>
                          {expandedSaleId === s.id && (
                            <tr key={s.id+"-detail"}>
                              <td data-label="" colSpan={6} style={{ padding:"0 8px 10px 8px", background:"var(--bg2)" }}>
                                <div style={{ padding:"8px 4px", fontSize:".85em" }}>
                                  {s.items.map((item, i) => (
                                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 8px", borderBottom:"1px solid var(--border)", gap:8 }}>
                                      <span style={{ color:"var(--t1)", flex:1 }}>{item.name}</span>
                                      <span style={{ color:"var(--t3)", minWidth:60, textAlign:"center" }}>x{item.qty}</span>
                                      <span style={{ color:"var(--t2)", minWidth:70, textAlign:"right" }}>{$(item.price)} c/u</span>
                                      <span style={{ fontWeight:600, minWidth:80, textAlign:"right" }}>{$(item.subtotal)}</span>
                                    </div>
                                  ))}
                                  {(s.discountAmount > 0) && (
                                    <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 8px", color:"var(--amber)", fontSize:".9em" }}>
                                      <span>Descuento</span>
                                      <span>-{$(s.discountAmount)}</span>
                                    </div>
                                  )}
                                  <div style={{ display:"flex", justifyContent:"flex-end", padding:"6px 8px 0", fontWeight:700, fontSize:"1em" }}>
                                    Total: {$(s.total)}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <Ico n="check" s={13}/>{saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </Modal>
      )}

      {payModal && (() => {
        const bal = custBal(payModal.id);
        const allocations = computeAllocations(payModal.id);
        const totalCreditUsed = allocations.reduce((sum, a) => sum + a.creditApplied, 0);
        const ordersWithRemaining = allocations.filter(a => a.remaining > 0);
        const cashSelectedOrders = ordersWithRemaining.filter(a => cashSelectedIds.has(a.sale.id));
        const cashTotal = cashSelectedOrders.reduce((sum, a) => sum + a.remaining, 0);
        const enteredAmount = Number(payForm.amount) || 0;
        // La aplicación de crédito tiene efecto neto 0 en custBal (el ajuste de balance lo cancela),
        // así que finalBal solo cambia por el monto en efectivo/transferencia ingresado.
        const finalBal = bal + enteredAmount;
        const hasOrders = allocations.length > 0;
        return (
          <Modal title={`Registrar pago — ${payModal.name}`} onClose={()=>setPayModal(null)} lg>
            {/* Saldos */}
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16 }}>
              <div style={{ background: bal < 0 ? "var(--redl)" : bal > 0 ? "var(--greenl)" : "var(--s1)", border:`1px solid ${bal < 0 ? "var(--redlb)" : bal > 0 ? "var(--greenlb)" : "var(--border)"}`, borderRadius:8, padding:"10px 16px", flex:1, minWidth:140, fontSize:".88em" }}>
                <div style={{ color:"var(--t3)", marginBottom:2 }}>Saldo actual</div>
                <div style={{ fontWeight:700, fontSize:"1.1em" }}>
                  <span className={bal > 0 ? "balance-pos" : bal < 0 ? "balance-neg" : "balance-zero"}>{$(bal)}</span>
                </div>
              </div>
              {(totalCreditUsed > 0 || enteredAmount > 0) && (
                <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 16px", flex:1, minWidth:140, fontSize:".88em" }}>
                  <div style={{ color:"var(--t3)", marginBottom:2 }}>Saldo resultante</div>
                  <div style={{ fontWeight:700, fontSize:"1.1em" }}>
                    <span className={finalBal > 0 ? "balance-pos" : finalBal < 0 ? "balance-neg" : "balance-zero"}>{$(finalBal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sin pedidos pendientes */}
            {!hasOrders && (
              <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 16px", marginBottom:16, fontSize:".87em", color:"var(--t3)" }}>
                No hay pedidos en cuenta pendientes. Podés ingresar un monto como crédito a favor.
              </div>
            )}

            {/* Lista unificada de deudas */}
            {hasOrders && (
              <div style={{ marginBottom:16 }}>
                <div className="section-title" style={{ marginBottom:8 }}>Deudas pendientes</div>
                <div style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                  {allocations.map(({ isInitialDebt, sale, orderBal, creditApplied, remaining }, i) => {
                    const fullyCovered = remaining === 0 && creditApplied > 0;
                    const checked = cashSelectedIds.has(sale.id);
                    return (
                      <div key={sale.id}
                        onClick={!fullyCovered ? () => toggleCashSelection(sale.id, remaining) : undefined}
                        style={{
                          display:"flex", alignItems:"center", gap:12,
                          padding: checked ? "10px 14px 10px 11px" : "10px 14px",
                          cursor: fullyCovered ? "default" : "pointer",
                          borderBottom: i < allocations.length - 1 ? "1px solid var(--border)" : "none",
                          borderLeft: checked ? "4px solid var(--t3)" : fullyCovered ? "4px solid var(--green)" : "4px solid transparent",
                          background: fullyCovered ? "var(--greenl)" : checked ? "var(--s2, #e5e7eb)" : "var(--s0)",
                          transition:"background .15s, border-left-color .15s",
                        }}>
                        {/* Checkbox o check icono */}
                        {fullyCovered
                          ? <div style={{ width:18, height:18, borderRadius:4, background:"var(--green)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <Ico n="check" s={11} c="white"/>
                            </div>
                          : <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${checked ? "var(--t2)" : "var(--border)"}`, background: checked ? "var(--t2)" : "var(--s0)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background .13s, border-color .13s" }}>
                              {checked && <Ico n="check" s={11} c="white"/>}
                            </div>
                        }
                        {/* Info del ítem */}
                        <div style={{ flex:1, minWidth:0 }}>
                          {isInitialDebt ? (
                            <div style={{ fontWeight:600, fontSize:".88em" }}>Deuda inicial</div>
                          ) : (
                            <>
                              <div style={{ fontWeight:600, fontSize:".88em" }}>
                                {fmtDate(sale.createdAt)}
                                <span style={{ marginLeft:8, fontWeight:400, color:"var(--t3)", fontSize:".9em" }}>
                                  {sale.items.length} ítem{sale.items.length!==1?"s":""}
                                </span>
                              </div>
                              <div style={{ fontSize:".75em", color:"var(--t3)", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {sale.items.map(it => it.name).join(", ")}
                              </div>
                            </>
                          )}
                          {creditApplied > 0 && (
                            <div style={{ fontSize:".75em", color:"var(--green)", marginTop:2, fontWeight:600 }}>
                              Crédito aplicado: {$(creditApplied)}
                              {orderBal > creditApplied ? ` (total: ${$(orderBal)})` : ""}
                            </div>
                          )}
                        </div>
                        {/* Monto principal: lo que falta pagar */}
                        <div style={{ textAlign:"right", minWidth:70 }}>
                          {fullyCovered
                            ? <div style={{ fontWeight:700, fontSize:".9em", color:"var(--green)" }}>Cubierto</div>
                            : <div style={{ fontWeight:700, fontSize:".95em", color:"var(--t1)" }}>{$(remaining)}</div>
                          }
                          {!fullyCovered && creditApplied === 0 && (
                            <div style={{ fontSize:".72em", color:"var(--t3)" }}>Total: {$(orderBal)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {totalCreditUsed > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px", background:"var(--greenlb)", fontSize:".83em", fontWeight:700 }}>
                      <span style={{ color:"var(--green)" }}>💰 Saldo a favor aplicado automáticamente</span>
                      <span style={{ color:"var(--green)" }}>{$(totalCreditUsed)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Método y monto (si hay pedidos con restante o sin pedidos) */}
            {(ordersWithRemaining.length > 0 || !hasOrders) && (
              <div className="form-grid" style={{ marginBottom:14 }}>
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
                <div className="form-group full">
                  <label className="lbl">{ordersWithRemaining.length > 0 ? "Monto a pagar ($)" : "Monto ($) *"}</label>
                  <input type="number" min="0" value={payForm.amount}
                    onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))}
                    autoFocus={!hasOrders} placeholder="0"/>
                  {enteredAmount > cashTotal && cashTotal > 0 && (
                    <div style={{ fontSize:".78em", color:"var(--t3)", marginTop:4 }}>
                      El excedente de {$(enteredAmount - cashTotal)} quedará como crédito a favor.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="form-group full" style={{ marginBottom:14 }}>
              <label className="lbl">Notas</label>
              <textarea value={payForm.notes} onChange={e=>setPayForm(p=>({...p,notes:e.target.value}))} placeholder="Observaciones opcionales..."/>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setPayModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={registerPayment} disabled={paying}>
                <Ico n="check" s={13}/>{paying ? "Registrando..." : "Confirmar pago"}
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
