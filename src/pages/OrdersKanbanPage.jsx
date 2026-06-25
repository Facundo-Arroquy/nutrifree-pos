/**
 * OrdersKanbanPage — Calendario de Pedidos (vista Kanban).
 *
 * - Muestra todos los pedidos activos (open / preparing / ready) en 3 columnas.
 * - Arrastrá una tarjeta para cambiar su estado.
 * - Hacé click en una tarjeta para ver detalle, avanzar estado o cobrar.
 * - Botón "Nuevo Pedido" para crear pedidos sin pasar por el POS.
 *
 * Comparte la tabla `sales` con OrdersPage y POSPage.
 * Los pedidos abiertos desde Ventas en Mostrador aparecen aquí automáticamente.
 *
 * Props: sales, setSales, products, setProducts, customers,
 *        accountPayments, setAccountPayments, showToast
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { Ico, Modal, $, uid, PAY_ORDER_LABELS, todayStr } from "../shared.jsx";
import { supabase, saleToDb, accountPaymentToDb } from "../supabase.js";

const COLUMNS = [
  { id: "open",      label: "Pendiente",          icon: "📋" },
  { id: "preparing", label: "En preparación",     icon: "🍳" },
  { id: "ready",     label: "Listo para Retirar", icon: "✅" },
];

const deliveryBadge = (dateStr) => {
  if (!dateStr) return null;
  const today = todayStr();
  const d = new Date(); d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  if (dateStr < today)    return { label: "Vencida",  cls: "badge-red" };
  if (dateStr === today)  return { label: "Hoy",      cls: "badge-amber" };
  if (dateStr === tomorrow) return { label: "Mañana", cls: "badge-blue" };
  return { label: dateStr, cls: "badge-gray" };
};

export default function OrdersKanbanPage({
  sales, setSales, products, setProducts, customers,
  accountPayments, setAccountPayments, showToast,
}) {
  // ── Drag & drop ────────────────────────────────────────────────────────────
  const [draggingId, setDraggingId]   = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // ── Touch drag (tablets) ───────────────────────────────────────────────────
  // Usamos refs para evitar closures stale en los listeners de documento
  const touchRef  = useRef({ saleId: null, active: false, startX: 0, startY: 0, overCol: null });
  const salesRef        = useRef(sales);
  const discountStockRef = useRef(null);
  useEffect(() => { salesRef.current = sales; });

  const handleTouchStart = (e, sale) => {
    const t = e.touches[0];
    touchRef.current = { saleId: sale.id, active: false, startX: t.clientX, startY: t.clientY, overCol: null };
  };

  useEffect(() => {
    const onMove = (e) => {
      const { saleId, startX, startY } = touchRef.current;
      if (!saleId) return;
      const t = e.touches[0];
      if (!touchRef.current.active) {
        const dist = Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY);
        if (dist < 8) return;
        touchRef.current.active = true;
        setDraggingId(saleId);
      }
      e.preventDefault(); // evita scroll mientras arrastra
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const col = el?.closest("[data-col-id]")?.dataset.colId ?? null;
      touchRef.current.overCol = col;
      setDragOverCol(col);
    };

    const onEnd = async () => {
      const { active, saleId, overCol } = touchRef.current;
      touchRef.current = { saleId: null, active: false, startX: 0, startY: 0, overCol: null };
      setDraggingId(null);
      setDragOverCol(null);
      if (!active || !saleId || !overCol) return;
      const sale = salesRef.current.find(s => s.id === saleId);
      if (!sale || sale.status === overCol) return;
      try {
        if (overCol === "ready") await discountStockRef.current(sale);
        const { error } = await supabase.from("sales").update({ status: overCol }).eq("id", saleId);
        if (error) throw error;
        setSales(prev => prev.map(s => s.id === saleId ? { ...s, status: overCol } : s));
      } catch (err) {
        showToast("Error al actualizar: " + err.message, "error");
      }
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend",  onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Detalle / cobro ────────────────────────────────────────────────────────
  const [detail, setDetail]       = useState(null);
  const [payMethod, setPayMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  // ── Nuevo pedido ───────────────────────────────────────────────────────────
  const [showNew, setShowNew]               = useState(false);
  const [newCart, setNewCart]               = useState([]);
  const [newCustomer, setNewCustomer]       = useState(null);
  const [newCustSearch, setNewCustSearch]   = useState("");
  const [showCustDrop, setShowCustDrop]     = useState(false);
  const [newPriceList, setNewPriceList]     = useState("retail");
  const [newDeliveryDate, setNewDeliveryDate] = useState(todayStr());
  const [newNotes, setNewNotes]             = useState("");
  const [newProdSearch, setNewProdSearch]   = useState("");
  const [newFilterCat, setNewFilterCat]     = useState("Todos");
  const [saving, setSaving]                 = useState(false);

  // ── Datos ──────────────────────────────────────────────────────────────────
  const kanbanOrders = useMemo(() =>
    sales
      .filter(s => ["open", "preparing", "ready"].includes(s.status))
      .sort((a, b) => {
        const da = a.deliveryDate || "9999";
        const db2 = b.deliveryDate || "9999";
        if (da !== db2) return da.localeCompare(db2);
        return new Date(b.createdAt) - new Date(a.createdAt);
      }),
    [sales]
  );

  const colOrders = (colId) => kanbanOrders.filter(s => s.status === colId);

  // ── Helpers de stock ───────────────────────────────────────────────────────
  const buildStockDeltas = (items) => {
    const deltas = [];
    for (const ci of items.filter(c => !c.isKit)) {
      const ex = deltas.find(d => d.id === ci.productId);
      if (ex) ex.delta += ci.qty;
      else deltas.push({ id: ci.productId, delta: ci.qty, name: ci.name || "" });
    }
    for (const ci of items.filter(c => c.isKit)) {
      for (const comp of (ci.kitItems || [])) {
        const ex = deltas.find(d => d.id === comp.productId);
        if (ex) ex.delta += comp.qty * ci.qty;
        else deltas.push({ id: comp.productId, delta: comp.qty * ci.qty, name: comp.name || "" });
      }
    }
    return deltas;
  };

  const discountStockForSale = async (sale) => {
    const deltas = buildStockDeltas(sale.items);
    if (deltas.length === 0) return;
    const { data: stockResults, error: stockErr } = await supabase.rpc(
      "complete_sale_stocks", { p_stock_deltas: deltas }
    );
    if (stockErr) throw stockErr;
    setProducts(prev => prev.map(p => {
      const upd = (stockResults || []).find(r => r.id === p.id);
      return upd ? { ...p, stock: upd.stock } : p;
    }));
  };
  // Actualizar ref en cada render para que onEnd (closure estática) use la versión fresca
  discountStockRef.current = discountStockForSale;

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const handleDragStart = (e, sale) => {
    setDraggingId(sale.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("saleId", sale.id);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId);
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const saleId = e.dataTransfer.getData("saleId");
    const sale = sales.find(s => s.id === saleId);
    if (!sale || sale.status === newStatus) { setDraggingId(null); return; }
    try {
      if (newStatus === "ready") await discountStockForSale(sale);
      const { error } = await supabase.from("sales").update({ status: newStatus }).eq("id", saleId);
      if (error) throw error;
      setSales(prev => prev.map(s => s.id === saleId ? { ...s, status: newStatus } : s));
      if (detail?.id === saleId) setDetail(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      showToast("Error al actualizar: " + err.message, "error");
    }
    setDraggingId(null);
  };

  const handleDragEnd = () => { setDraggingId(null); setDragOverCol(null); };

  // ── Avanzar estado manualmente ─────────────────────────────────────────────
  const advanceStatus = async (sale) => {
    const next = { open: "preparing", preparing: "ready" }[sale.status];
    if (!next) return;
    try {
      if (next === "ready") await discountStockForSale(sale);
      const { error } = await supabase.from("sales").update({ status: next }).eq("id", sale.id);
      if (error) throw error;
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, status: next } : s));
      if (detail?.id === sale.id) setDetail(prev => ({ ...prev, status: next }));
      showToast("Estado actualizado");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  };

  // ── Marcar / desmarcar pedido para facturar ────────────────────────────────
  const toggleBilling = async (sale) => {
    const mark = !sale.needsBilling;
    const patch = mark
      ? { needsBilling: true, billingStatus: "pending" }
      : { needsBilling: false, billingStatus: null };
    const { error } = await supabase.from("sales")
      .update({ needs_billing: patch.needsBilling, billing_status: patch.billingStatus })
      .eq("id", sale.id);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setSales(prev => prev.map(s => s.id === sale.id ? { ...s, ...patch } : s));
    if (detail?.id === sale.id) setDetail(prev => ({ ...prev, ...patch }));
    showToast(mark ? "Pedido marcado para facturar" : "Pedido sacado de facturación");
  };

  // ── Cobrar pedido ──────────────────────────────────────────────────────────
  const closeOrder = async () => {
    if (!detail || submitting) return;
    if (!payMethod) { showToast("Seleccioná un método de pago", "error"); return; }
    setSubmitting(true);
    try {
      const paidAt = new Date().toISOString();
      const { error } = await supabase.from("sales")
        .update({ status: "closed", payment_method: payMethod, paid_at: paidAt })
        .eq("id", detail.id);
      if (error) throw error;
      setSales(prev => prev.map(s =>
        s.id === detail.id ? { ...s, status: "closed", paymentMethod: payMethod, paidAt } : s
      ));
      if (payMethod === "account" && detail.customerId) {
        const newPayments = [];

        const alreadyCharged = accountPayments.some(p => p.saleId === detail.id && p.type === "charge");
        if (alreadyCharged) { showToast("Este pedido ya tiene un cargo registrado", "error"); return; }

        const charge = {
          id: crypto.randomUUID(), customerId: detail.customerId, saleId: detail.id,
          amount: detail.total, type: "charge", paymentMethod: null, date: todayStr(), notes: "",
        };
        const { error: payErr } = await supabase.from("account_payments").insert(accountPaymentToDb(charge));
        if (payErr) throw payErr;
        newPayments.push(charge);

        // Auto-aplicar saldo a favor si existe
        const availableCredit = accountPayments
          .filter(p => p.customerId === detail.customerId)
          .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);
        if (availableCredit > 0) {
          const creditToApply = Math.min(availableCredit, detail.total);
          const creditPayment = {
            id: crypto.randomUUID(), customerId: detail.customerId, saleId: detail.id,
            amount: creditToApply, type: "payment", paymentMethod: "balance",
            date: todayStr(), notes: "Saldo a favor aplicado automáticamente",
          };
          const { error: cpErr } = await supabase.from("account_payments").insert(accountPaymentToDb(creditPayment));
          if (cpErr) throw cpErr;
          newPayments.push(creditPayment);

          const creditConsumption = {
            id: crypto.randomUUID(), customerId: detail.customerId, saleId: null,
            amount: creditToApply, type: "charge", paymentMethod: "balance",
            date: todayStr(), notes: "Crédito consumido",
          };
          const { error: ccErr } = await supabase.from("account_payments").insert(accountPaymentToDb(creditConsumption));
          if (ccErr) throw ccErr;
          newPayments.push(creditConsumption);
        }

        setAccountPayments(prev => {
          const ids = new Set(prev.map(p => p.id));
          return [...prev, ...newPayments.filter(p => !ids.has(p.id))];
        });
      }
      showToast("Pedido cobrado ✓");
      setDetail(null);
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Cancelar pedido ────────────────────────────────────────────────────────
  const cancelOrder = async (sale) => {
    if (!confirm("¿Cancelar este pedido?")) return;
    try {
      // Solo restaurar stock si ya llegó a "Listo para Retirar" (único momento donde se descuenta)
      if (sale.status === "ready") {
        const restoreDeltas = buildStockDeltas(sale.items);
        if (restoreDeltas.length > 0) {
          const { data: stockResults, error: stockErr } = await supabase.rpc(
            "cancel_order_stocks", { p_restore_deltas: restoreDeltas, p_sale_id: sale.id }
          );
          if (stockErr) throw stockErr;
          setProducts(prev => prev.map(p => {
            const upd = (stockResults || []).find(r => r.id === p.id);
            return upd ? { ...p, stock: upd.stock } : p;
          }));
        }
      }
      const { error } = await supabase.from("sales").update({ status: "cancelled" }).eq("id", sale.id);
      if (error) throw error;
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, status: "cancelled" } : s));
      if (detail?.id === sale.id) setDetail(null);
      showToast("Pedido cancelado");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  };

  // ── Nuevo pedido — helpers ─────────────────────────────────────────────────
  const activeProducts = useMemo(() => products.filter(p => p.active), [products]);
  const categories = useMemo(
    () => ["Todos", ...new Set(activeProducts.map(p => p.category))],
    [activeProducts]
  );
  const filteredProds = activeProducts.filter(p =>
    (newFilterCat === "Todos" || p.category === newFilterCat) &&
    (!newProdSearch || p.name.toLowerCase().includes(newProdSearch.toLowerCase()))
  );
  const filteredCusts = customers.filter(c =>
    !newCustSearch || c.name.toLowerCase().includes(newCustSearch.toLowerCase())
  );

  const addToNewCart = (prod) => {
    const price = newPriceList === "retail" ? prod.priceRetail : prod.priceWholesale;
    setNewCart(prev => {
      const ex = prev.find(i => i.productId === prod.id);
      if (ex) return prev.map(i =>
        i.productId === prod.id ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price } : i
      );
      return [...prev, {
        productId: prod.id, name: prod.name, qty: 1, price, subtotal: price,
        isKit: prod.kitItems?.length > 0, kitItems: prod.kitItems || [],
        includeInTicket: true, category: prod.category, frozen: false,
      }];
    });
  };

  const updateNewQty = (productId, val) => {
    const qty = Math.max(1, Number(val) || 1);
    setNewCart(prev => prev.map(i =>
      i.productId === productId ? { ...i, qty, subtotal: qty * i.price } : i
    ));
  };

  const updateNewPrice = (productId, val) => {
    const price = Math.max(0, Number(val) || 0);
    setNewCart(prev => prev.map(i =>
      i.productId === productId ? { ...i, price, subtotal: i.qty * price } : i
    ));
  };

  // Recalcular precios del carrito cuando cambia la lista de precios (igual que POSPage)
  useEffect(() => {
    setNewCart(prev => prev.map(i => {
      const prod = products.find(p => p.id === i.productId);
      if (!prod) return i;
      const price = newPriceList === "retail" ? prod.priceRetail : prod.priceWholesale;
      return { ...i, price, subtotal: i.qty * price };
    }));
  }, [newPriceList]);

  const newTotal = newCart.reduce((a, b) => a + b.subtotal, 0);

  const openNew = () => {
    setNewCart([]); setNewCustomer(null); setNewCustSearch("");
    setNewPriceList("retail"); setNewDeliveryDate(todayStr());
    setNewNotes(""); setNewProdSearch(""); setNewFilterCat("Todos");
    setShowNew(true);
  };

  const saveNewOrder = async () => {
    if (newCart.length === 0) { showToast("Agregá al menos un producto", "error"); return; }
    if (!newDeliveryDate) { showToast("Seleccioná una fecha de entrega", "error"); return; }
    setSaving(true);
    try {
      // El stock se descuenta cuando el pedido llega a "Listo para Retirar", no al crearlo.
      const sale = {
        id: uid(),
        customerId: newCustomer?.id || null,
        customerName: newCustomer?.name || "Sin cliente",
        items: newCart,
        total: newTotal,
        priceList: newPriceList,
        paymentMethod: null,
        status: "open",
        notes: newNotes,
        createdAt: new Date().toISOString(),
        discountType: "pct",
        discountValue: 0,
        discountAmount: 0,
        deliveryDate: newDeliveryDate,
        needsBilling: false,
        billingStatus: null,
      };
      const { error } = await supabase.from("sales").insert(saleToDb(sale));
      if (error) throw error;
      setSales(prev => [sale, ...prev]);
      setShowNew(false);
      showToast("Pedido cargado ✓");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Calendario de Pedidos</div>
          <div className="page-sub">{kanbanOrders.length} pedidos activos</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Ico n="plus" s={14}/> Nuevo Pedido
        </button>
      </div>

      {/* ─── Kanban ──────────────────────────────────────────────────────────── */}
      <div className="kanban-board-wrap">
      <div className="kanban-board">
        {COLUMNS.map(col => {
          const orders = colOrders(col.id);
          const isOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              data-col-id={col.id}
              onDragOver={e => handleDragOver(e, col.id)}
              onDrop={e => handleDrop(e, col.id)}
              onDragLeave={() => { if (dragOverCol === col.id) setDragOverCol(null); }}
              style={{
                background: isOver ? "var(--s2)" : "var(--s1)",
                border: `2px ${isOver ? "dashed var(--accent)" : "solid var(--border)"}`,
                borderRadius: 14,
                minHeight: 220,
                padding: "12px 10px",
                transition: "background .12s, border-color .12s",
              }}
            >
              {/* Cabecera columna */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{col.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: ".87em" }}>{col.label}</span>
                </div>
                <span style={{
                  background: "var(--s2)", borderRadius: 20,
                  padding: "2px 9px", fontSize: ".77em", fontWeight: 700, color: "var(--t3)",
                }}>{orders.length}</span>
              </div>

              {/* Tarjetas */}
              {orders.map(sale => {
                const db = deliveryBadge(sale.deliveryDate);
                const isDragging = draggingId === sale.id;
                return (
                  <div
                    key={sale.id}
                    draggable
                    onDragStart={e => handleDragStart(e, sale)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={e => handleTouchStart(e, sale)}
                    onClick={() => { setDetail(sale); setPayMethod(sale.paymentMethod || "cash"); }}
                    style={{
                      background: "var(--bg1)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "11px 13px",
                      marginBottom: 8,
                      cursor: "grab",
                      opacity: isDragging ? 0.4 : 1,
                      boxShadow: isDragging ? "none" : "0 1px 4px rgba(0,0,0,.07)",
                      transition: "opacity .12s",
                      userSelect: "none",
                      touchAction: "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: ".92em", marginBottom: 3 }}>
                      {sale.customerName || "Sin cliente"}
                    </div>
                    <div style={{ fontSize: ".77em", color: "var(--t3)", marginBottom: 8, lineHeight: 1.4 }}>
                      {sale.items.map(i => `${i.name} ×${i.qty}`).join(", ")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: ".87em", color: "var(--green)" }}>
                        {$(sale.total)}
                      </span>
                      {db && (
                        <span className={`badge ${db.cls}`} style={{ fontSize: ".7em" }}>
                          📅 {db.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {orders.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--t4)", fontSize: ".8em", padding: "28px 0", fontStyle: "italic" }}>
                  Sin pedidos
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>

      {/* ─── Modal detalle / cobro ─────────────────────────────────────────── */}
      {detail && (() => {
        const db = deliveryBadge(detail.deliveryDate);
        const isReady = detail.status === "ready";
        const nextLabel = { open: "→ En preparación", preparing: "→ Listo para Retirar" }[detail.status];
        return (
          <Modal title={`Pedido — ${detail.customerName || "Sin cliente"}`} onClose={() => setDetail(null)} lg>
            {/* Info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="lbl">Cliente</label>
                <div style={{ marginTop: 4, fontWeight: 600 }}>{detail.customerName || "Sin cliente"}</div>
              </div>
              <div>
                <label className="lbl">Entrega</label>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  {db
                    ? <span className={`badge ${db.cls}`}>📅 {db.label}</span>
                    : <span style={{ color: "var(--t4)", fontSize: ".85em" }}>Sin fecha</span>}
                  {detail.deliveryDate && db?.label !== detail.deliveryDate &&
                    <span style={{ fontSize: ".8em", color: "var(--t3)" }}>{detail.deliveryDate}</span>}
                </div>
              </div>
            </div>

            {detail.notes && (
              <div style={{ background: "var(--amberl)", border: "1px solid var(--amberlb)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: ".84em" }}>
                📝 {detail.notes}
              </div>
            )}

            {/* Productos */}
            <div className="section-title">Productos</div>
            <div className="table-wrap" style={{ marginBottom: 14, maxHeight: 240, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {detail.items.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.name}</td>
                      <td>{i.qty}</td>
                      <td>{$(i.price)}</td>
                      <td style={{ fontWeight: 700 }}>{$(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tot-row total">
              <span>TOTAL</span>
              <span style={{ color: "var(--green)" }}>{$(detail.total)}</span>
            </div>

            {/* Cobro — solo en "Listo para Retirar" */}
            {isReady && (
              <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--greenl)", border: "1px solid var(--greenlb)", borderRadius: 10 }}>
                <label className="lbl" style={{ marginBottom: 8, display: "block" }}>Método de pago</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {Object.entries(PAY_ORDER_LABELS).map(([k, v]) =>
                    (k !== "account" || detail.customerId) && (
                      <button
                        key={k}
                        className={`btn btn-sm ${payMethod === k ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setPayMethod(k)}
                      >
                        {payMethod === k && <Ico n="check" s={12}/>}{v}
                      </button>
                    )
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", fontWeight: 700 }}
                  onClick={closeOrder}
                  disabled={submitting}
                >
                  <Ico n="check" s={14}/>
                  {submitting ? "Guardando..." : `Cobrar y Cerrar — ${$(detail.total)}`}
                </button>
              </div>
            )}

            {/* Acciones */}
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
              {nextLabel && (
                <button className="btn btn-blue" onClick={() => advanceStatus(detail)}>
                  {nextLabel}
                </button>
              )}
              {detail.needsBilling ? (
                <button className="btn btn-secondary" onClick={() => toggleBilling(detail)}>
                  <Ico n="check" s={13} c="var(--green)"/> Marcado para facturar — sacar
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => toggleBilling(detail)}>
                  <Ico n="billing" s={13}/> Marcar para facturar
                </button>
              )}
              <button
                className="btn btn-secondary"
                style={{ marginLeft: "auto" }}
                onClick={() => cancelOrder(detail)}
              >
                <Ico n="x" s={13} c="var(--red)"/> Cancelar pedido
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* ─── Modal nuevo pedido ────────────────────────────────────────────── */}
      {showNew && (
        <div className="modal-bg" onClick={e => { if (e.target.className === "modal-bg") setShowNew(false); }}>
          <div className="modal" style={{ maxWidth: 960, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-header">
              <div className="modal-title">Nuevo Pedido</div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowNew(false)}>
                <Ico n="x" s={18}/>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 8px" }}>
              {/* Fila superior: cliente / fecha / lista de precios */}
              <div className="kanban-new-top-grid" style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: 12, marginBottom: 16 }}>
                {/* Cliente */}
                <div style={{ position: "relative" }}>
                  <label className="lbl">Cliente (opcional)</label>
                  <input
                    value={newCustSearch}
                    onChange={e => { setNewCustSearch(e.target.value); if (!e.target.value) setNewCustomer(null); setShowCustDrop(true); }}
                    onFocus={() => setShowCustDrop(true)}
                    onBlur={() => setTimeout(() => setShowCustDrop(false), 150)}
                    placeholder="Buscar cliente..."
                    style={{ marginTop: 4 }}
                  />
                  {newCustomer && (
                    <div style={{ fontSize: ".78em", color: "var(--green)", marginTop: 3 }}>✓ {newCustomer.name}</div>
                  )}
                  {showCustDrop && newCustSearch && !newCustomer && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 180, overflowY: "auto" }}>
                      {filteredCusts.slice(0, 8).map(c => (
                        <div key={c.id}
                          style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: ".88em" }}
                          onMouseDown={() => { setNewCustomer(c); setNewCustSearch(c.name); setShowCustDrop(false); setNewPriceList(c.priceList || "retail"); }}>
                          {c.name}
                        </div>
                      ))}
                      {filteredCusts.length === 0 && (
                        <div style={{ padding: "8px 12px", color: "var(--t4)", fontSize: ".85em" }}>Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Fecha de entrega */}
                <div>
                  <label className="lbl">Fecha de entrega *</label>
                  <input type="date" value={newDeliveryDate} onChange={e => setNewDeliveryDate(e.target.value)} style={{ marginTop: 4 }}/>
                </div>

                {/* Lista de precios */}
                <div>
                  <label className="lbl">Precios</label>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <button className={`btn btn-sm ${newPriceList === "retail" ? "btn-primary" : "btn-secondary"}`} onClick={() => setNewPriceList("retail")}>Minorista</button>
                    <button className={`btn btn-sm ${newPriceList === "wholesale" ? "btn-primary" : "btn-secondary"}`} onClick={() => setNewPriceList("wholesale")}>Mayorista</button>
                  </div>
                </div>
              </div>

              {/* Productos + Carrito */}
              <div className="kanban-new-body-grid" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
                {/* Catálogo */}
                <div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={newProdSearch} onChange={e => setNewProdSearch(e.target.value)}
                      placeholder="Buscar producto..." style={{ flex: 1 }}/>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                    {categories.map(c => (
                      <button key={c}
                        className={`btn btn-sm ${newFilterCat === c ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setNewFilterCat(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                    {filteredProds.map(p => (
                      <div key={p.id} onClick={() => addToNewCart(p)}
                        style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px", cursor: "pointer", fontSize: ".83em" }}>
                        <div style={{ fontWeight: 600, marginBottom: 3 }}>{p.name}</div>
                        <div style={{ color: "var(--green)", fontWeight: 700 }}>
                          {$(newPriceList === "retail" ? p.priceRetail : p.priceWholesale)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Carrito */}
                <div>
                  <div className="section-title" style={{ marginBottom: 8 }}>Carrito</div>
                  {newCart.length === 0 ? (
                    <div style={{ color: "var(--t4)", fontSize: ".84em", fontStyle: "italic", padding: "20px 0" }}>
                      Hacé click en un producto para agregarlo
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                      {newCart.map(item => (
                        <div key={item.productId} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: ".85em" }}>{item.name}</span>
                            <button className="btn btn-ghost btn-icon btn-sm"
                              onClick={() => setNewCart(prev => prev.filter(i => i.productId !== item.productId))}>
                              <Ico n="x" s={12} c="var(--red)"/>
                            </button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            <div>
                              <label className="lbl" style={{ fontSize: ".7em" }}>Cantidad</label>
                              <input type="number" min={1} value={item.qty}
                                onChange={e => updateNewQty(item.productId, e.target.value)}
                                style={{ padding: "3px 6px", fontSize: ".85em" }}/>
                            </div>
                            <div>
                              <label className="lbl" style={{ fontSize: ".7em" }}>Precio</label>
                              <input type="number" min={0} value={item.price}
                                onChange={e => updateNewPrice(item.productId, e.target.value)}
                                style={{ padding: "3px 6px", fontSize: ".85em" }}/>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: ".8em", fontWeight: 700, color: "var(--green)", marginTop: 4 }}>
                            {$(item.subtotal)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {newCart.length > 0 && (
                    <div className="tot-row total" style={{ marginTop: 10 }}>
                      <span>TOTAL</span>
                      <span style={{ color: "var(--green)" }}>{$(newTotal)}</span>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <label className="lbl">Notas del pedido</label>
                    <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                      placeholder="Instrucciones especiales, detalles del encargo..."
                      style={{ marginTop: 4, minHeight: 60, width: "100%" }}/>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveNewOrder} disabled={saving}>
                {saving ? "Guardando..." : "Guardar Pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
