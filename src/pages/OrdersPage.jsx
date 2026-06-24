/**
 * OrdersPage — Gestión de pedidos.
 *
 * Filtra por estado y método de pago. Permite cambiar estado, cambiar método
 * de pago, cerrar pedidos y cancelar (devuelve stock automáticamente).
 * Cerrar un pedido "account" registra el cargo en cuenta corriente del cliente.
 *
 * Props: sales, setSales, products, setProducts, customers, setCustomers,
 *        accountPayments, setAccountPayments, setStockMovements, showToast
 */
import { useState } from "react";
import { Ico, Modal, $, fmtDT, STATUS_LABELS, STATUS_COLORS, PAY_LABELS, PAY_ORDER_LABELS, todayStr, useSortable, SortableTh } from "../shared.jsx";
import { supabase, accountPaymentToDb } from "../supabase.js";

export default function OrdersPage({ sales, setSales, products, setProducts, customers, setCustomers, accountPayments, setAccountPayments, setStockMovements, showToast }) {
  const [filter, setFilter] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const statuses = ["all","open","preparing","ready","delivered","closed","cancelled"];

  const isPendingPayment = (s) => {
    if (s.status === "cancelled") return false;
    if (s.status !== "closed") return true;
    if (s.paymentMethod !== "account") return false;
    // Cerrado en cuenta: pendiente si el saldo restante es mayor a 0
    const charge = accountPayments.find(p => p.saleId === s.id && p.type === "charge");
    if (!charge) return false;
    const paid = accountPayments
      .filter(p => p.saleId === s.id && p.type === "payment")
      .reduce((sum, p) => sum + p.amount, 0);
    return paid < charge.amount;
  };
  const { sortBy, sortDir, toggleSort } = useSortable("createdAt", "desc");

  const SORT_ACCESSORS = {
    id:            s => s.id,
    customerName:  s => s.customerName ?? "",
    total:         s => s.total ?? 0,
    paymentMethod: s => s.paymentMethod ?? "",
    status:        s => s.status ?? "",
    createdAt:     s => new Date(s.createdAt).getTime(),
  };

  const filtered = sales
    .filter(s => filter==="all" || s.status===filter)
    .filter(s => filterPay==="all" || s.paymentMethod===filterPay)
    .sort((a,b) => {
      const acc = SORT_ACCESSORS[sortBy] || SORT_ACCESSORS.createdAt;
      const av = acc(a), bv = acc(b);
      let v = typeof av === "string" ? av.localeCompare(bv, undefined, { sensitivity:"base" }) : (av - bv);
      return sortDir === "asc" ? v : -v;
    });

  const changeStatus = async (id, status) => {
    if (status === "closed") { console.error("[OrdersPage] Usar closeOrder() para cerrar ventas en cuenta, no changeStatus()"); return; }
    const { error } = await supabase.from("sales").update({ status }).eq("id", id);
    if (error) { showToast("Error al actualizar estado: " + error.message, "error"); return; }
    setSales(prev => prev.map(s => s.id===id ? {...s,status} : s));
    if (selected?.id===id) setSelected(prev => ({...prev,status}));
    showToast("Estado actualizado");
  };

  const changePayment = async (id, paymentMethod) => {
    const { error } = await supabase.from("sales").update({ payment_method: paymentMethod }).eq("id", id);
    if (error) { showToast("Error al actualizar método: " + error.message, "error"); return; }
    setSales(prev => prev.map(s => s.id===id ? {...s,paymentMethod} : s));
    if (selected?.id===id) setSelected(prev => ({...prev,paymentMethod}));
    showToast("Método de pago actualizado");
  };

  const closeOrder = async (sale) => {
    if (submitting) return;
    if (!sale.paymentMethod) { showToast("Seleccioná un método de pago", "error"); return; }
    setSubmitting(true);
    try {
      // Registrar movimientos de cuenta corriente ANTES de cerrar la venta.
      // Así, si los pagos fallan, la venta queda abierta y se puede reintentar sin inconsistencias.
      if (sale.paymentMethod === "account" && sale.customerId) {
        const newPayments = [];

        const alreadyCharged = accountPayments.some(p => p.saleId === sale.id && p.type === "charge");
        if (alreadyCharged) { showToast("Este pedido ya tiene un cargo registrado", "error"); return; }

        const charge = { id: crypto.randomUUID(), customerId: sale.customerId, saleId: sale.id,
          amount: sale.total, type: "charge", paymentMethod: null, date: todayStr(), notes: "" };
        const { error: payErr } = await supabase.from("account_payments").insert(accountPaymentToDb(charge));
        if (payErr) { showToast("Error al registrar movimiento: " + payErr.message, "error"); return; }
        newPayments.push(charge);

        // Auto-aplicar saldo a favor si existe
        const availableCredit = accountPayments
          .filter(p => p.customerId === sale.customerId)
          .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);
        if (availableCredit > 0) {
          const creditToApply = Math.min(availableCredit, sale.total);
          const creditPayment = { id: crypto.randomUUID(), customerId: sale.customerId, saleId: sale.id,
            amount: creditToApply, type: "payment", paymentMethod: "balance",
            date: todayStr(), notes: "Saldo a favor aplicado automáticamente" };
          const { error: cpErr } = await supabase.from("account_payments").insert(accountPaymentToDb(creditPayment));
          if (cpErr) { showToast("Error al aplicar crédito: " + cpErr.message, "error"); return; }
          newPayments.push(creditPayment);

          const creditConsumption = { id: crypto.randomUUID(), customerId: sale.customerId, saleId: null,
            amount: creditToApply, type: "charge", paymentMethod: "balance",
            date: todayStr(), notes: "Crédito consumido" };
          const { error: ccErr } = await supabase.from("account_payments").insert(accountPaymentToDb(creditConsumption));
          if (ccErr) { showToast("Error al consumir crédito: " + ccErr.message, "error"); return; }
          newPayments.push(creditConsumption);
        }

        setAccountPayments(prev => {
          const ids = new Set(prev.map(p => p.id));
          return [...prev, ...newPayments.filter(p => !ids.has(p.id))];
        });
      }

      // Cerrar la venta después de registrar los pagos
      const { error: saleErr } = await supabase.from("sales").update({ status: "closed" }).eq("id", sale.id);
      if (saleErr) { showToast("Error al cerrar: " + saleErr.message, "error"); return; }
      setSales(prev => prev.map(s => s.id===sale.id ? {...s, status:"closed"} : s));
      setSelected(prev => prev ? {...prev, status:"closed"} : prev);
      showToast("Pedido cerrado");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (sale) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // restore stock — build map of productId → qty to restore
      const restoreMap = {};
      for (const item of sale.items) {
        if (item.kitItems?.length) {
          for (const comp of item.kitItems) {
            restoreMap[comp.productId] = (restoreMap[comp.productId] || 0) + comp.qty * item.qty;
          }
        } else {
          restoreMap[item.productId] = (restoreMap[item.productId] || 0) + item.qty;
        }
      }
      const restoreDeltas = Object.entries(restoreMap).map(([productId, qty]) => ({
        id: productId,
        delta: qty,
        name: products.find(x => x.id === productId)?.name || productId,
      }));
      const { data: stockResults, error: stockErr } = await supabase.rpc("cancel_order_stocks", {
        p_restore_deltas: restoreDeltas,
        p_sale_id: sale.id,
      });
      if (stockErr) { showToast("Error al restaurar stock: " + stockErr.message, "error"); return; }
      setProducts(prev => prev.map(p => {
        const upd = (stockResults || []).find(r => r.id === p.id);
        return upd ? { ...p, stock: upd.stock } : p;
      }));
      setStockMovements(prev => [
        ...restoreDeltas.map(d => ({
          id: crypto.randomUUID(), productId: d.id, productName: d.name,
          qty: d.delta, type: "cancelación", notes: `Pedido ${sale.id}`,
          createdAt: new Date().toISOString(),
        })),
        ...prev,
      ]);
      // reverse charge if was closed with account
      if (sale.status === "closed" && sale.paymentMethod === "account" && sale.customerId) {
        const reversal = { id: crypto.randomUUID(), customerId: sale.customerId, saleId: sale.id,
          amount: sale.total, type: "payment", paymentMethod: null, date: todayStr(), notes: "Reverso por cancelación" };
        const { error: payErr } = await supabase.from("account_payments").insert(accountPaymentToDb(reversal));
        if (payErr) { showToast("Error al registrar reverso: " + payErr.message, "error"); return; }
        setAccountPayments(prev => [...prev, reversal]);
      }
      await supabase.from("sales").update({ status: "cancelled" }).eq("id", sale.id);
      setSales(prev => prev.map(s => s.id===sale.id ? {...s,status:"cancelled"} : s));
      if (selected?.id===sale.id) setSelected(prev=>({...prev,status:"cancelled"}));
      showToast("Pedido cancelado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Pedidos</div><div className="page-sub">{filtered.length} registros</div></div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        {statuses.map(s => (
          <button key={s} className={`btn btn-sm ${filter===s?"btn-primary":"btn-secondary"}`}
            onClick={()=>setFilter(s)}>
            {s==="all"?"Todos":STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
        <span style={{ fontSize:".74em", fontWeight:700, color:"var(--t4)", textTransform:"uppercase", letterSpacing:".5px" }}>Pago:</span>
        <button className={`btn btn-sm ${filterPay==="all"?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterPay("all")}>Todos</button>
        {Object.entries(PAY_ORDER_LABELS).map(([k,v]) => (
          <button key={k} className={`btn btn-sm ${filterPay===k?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterPay(k)}>{v}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <SortableTh col="id" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>#</SortableTh>
            <SortableTh col="customerName" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Cliente</SortableTh>
            <th>Productos</th>
            <SortableTh col="total" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Total</SortableTh>
            <SortableTh col="paymentMethod" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Pago</SortableTh>
            <SortableTh col="status" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Estado</SortableTh>
            <SortableTh col="createdAt" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Fecha</SortableTh>
            <th></th>
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="tr-click" onClick={()=>setSelected(s)}>
                <td data-label="#" style={{ color:"var(--t3)", fontSize:".8em" }}>{s.id.toUpperCase()}</td>
                <td data-label="Cliente" style={{ fontWeight:600 }}>{s.customerName}</td>
                <td data-label="Productos" style={{ color:"var(--t2)" }}>{s.items.length} ítem{s.items.length!==1?"s":""}</td>
                <td data-label="Total" style={{ fontWeight:700, color:"var(--green)" }}>{$(s.total)}</td>
                <td data-label="Pago" style={{ color:"var(--t3)" }}>{PAY_LABELS[s.paymentMethod]||s.paymentMethod}</td>
                <td data-label="Estado">
                  <span className={`badge ${STATUS_COLORS[s.status]||"badge-gray"}`}>{STATUS_LABELS[s.status]||s.status}</span>
                  {isPendingPayment(s) && <span className="badge badge-amber" style={{ marginLeft:4 }}>Pend. pago</span>}
                </td>
                <td data-label="Fecha" style={{ color:"var(--t3)", fontSize:".82em" }}>{fmtDT(s.createdAt)}</td>
                <td data-label="">
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={e=>{e.stopPropagation();setSelected(s);}}><Ico n="eye" s={14}/></button>
                </td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">📋</div><h3>Sin pedidos</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={`Pedido #${selected.id.toUpperCase()}`} onClose={()=>setSelected(null)} lg>
          <div className="resp-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
            <div><label className="lbl">Cliente</label><div style={{ marginTop:4 }}>{selected.customerName}</div></div>
            <div><label className="lbl">Estado</label><div style={{ marginTop:4 }}><span className={`badge ${STATUS_COLORS[selected.status]}`}>{STATUS_LABELS[selected.status]}</span></div></div>
            <div><label className="lbl">Fecha</label><div style={{ marginTop:4, fontSize:".88em" }}>{fmtDT(selected.createdAt)}</div></div>
            <div style={{ gridColumn:"1/-1" }}>
              <label className="lbl">Método de pago</label>
              {selected.status!=="closed" && selected.status!=="cancelled" ? (
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
                  {Object.entries(PAY_ORDER_LABELS).map(([k,v]) => (
                    (k !== "account" || selected.customerId) && (
                      <button key={k}
                        className={`btn btn-sm ${selected.paymentMethod===k?"btn-primary":"btn-secondary"}`}
                        onClick={()=>changePayment(selected.id, k)}>
                        {selected.paymentMethod===k && <Ico n="check" s={12}/>}{v}
                      </button>
                    )
                  ))}
                </div>
              ) : (
                <div style={{ marginTop:4, fontWeight:600 }}>{PAY_ORDER_LABELS[selected.paymentMethod]||PAY_LABELS[selected.paymentMethod]||selected.paymentMethod}</div>
              )}
            </div>
          </div>
          {selected.notes && <div style={{ background:"var(--amberl)", border:"1px solid var(--amberlb)", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:".84em" }}>📝 {selected.notes}</div>}
          <div className="section-title">Items</div>
          <div className="table-wrap" style={{ marginBottom:16, maxHeight:260, overflowY:"auto" }}>
            <table>
              <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
              <tbody>
                {selected.items.map((i,idx)=>(
                  <tr key={idx}><td data-label="Producto">{i.name}</td><td data-label="Cant.">{i.qty}</td><td data-label="P. Unit.">{$(i.price)}</td><td data-label="Subtotal" style={{ fontWeight:700 }}>{$(i.subtotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tot-row total"><span>TOTAL</span><span style={{ color:"var(--green)" }}>{$(selected.total)}</span></div>

          {selected.status !== "closed" && selected.status !== "cancelled" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:16 }}>
              {selected.status==="open" && <button className="btn btn-blue" onClick={()=>changeStatus(selected.id,"ready")}><Ico n="box" s={13}/>Listo</button>}
              {selected.status==="ready" && <button className="btn btn-primary" onClick={()=>changeStatus(selected.id,"delivered")}><Ico n="check" s={13}/>Entregado</button>}
              <button className="btn btn-secondary" onClick={()=>closeOrder(selected)} disabled={submitting}>
                <Ico n="check" s={13}/>{submitting ? "Guardando..." : "Cerrar"}
              </button>
              <button className="btn btn-danger" onClick={()=>cancelOrder(selected)} disabled={submitting}>
                <Ico n="x" s={13}/>{submitting ? "Cancelando..." : "Cancelar"}
              </button>
            </div>
          )}
          {selected.status === "closed" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:16 }}>
              <button className="btn btn-danger" onClick={()=>cancelOrder(selected)} disabled={submitting}>
                <Ico n="x" s={13}/>{submitting ? "Cancelando..." : "Cancelar pedido"}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
