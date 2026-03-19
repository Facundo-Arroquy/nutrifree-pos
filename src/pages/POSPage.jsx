/**
 * POSPage — Punto de venta (caja).
 *
 * Flujo: seleccionar cliente (opcional) → agregar productos al carrito →
 * aplicar descuento → cobrar (estado + método de pago) → confirmar.
 *
 * Al guardar un pedido abierto, ofrece registrar una fecha de entrega.
 * Los pedidos "account" generan automáticamente un cargo en cuenta corriente.
 *
 * Props: products, setProducts, customers, setCustomers, sales, setSales,
 *        accountPayments, setAccountPayments, showToast
 */
import { useState, useEffect } from "react";
import { Ico, Modal, $, PAY_ORDER_LABELS, uid, todayStr } from "../shared.jsx";
import { supabase, saleToDb, accountPaymentToDb } from "../supabase.js";

export default function POSPage({ products, setProducts, customers, setCustomers, sales, setSales, accountPayments, setAccountPayments, showToast, logAction }) {
  const custBal = (id) => {
    const c = customers.find(x => x.id === id);
    return (c?.balance ?? 0) + accountPayments.filter(p => p.customerId === id)
      .reduce((sum, p) => p.type === "payment" ? sum + p.amount : sum - p.amount, 0);
  };
  const [cart, setCart] = useState([]);
  const [priceList, setPriceList] = useState("retail");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Todos");
  const [payModal, setPayModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("closed");
  const [custModal, setCustModal] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [discountType, setDiscountType] = useState("pct"); // "pct" | "fixed"
  const [discountValue, setDiscountValue] = useState("");
  const [editingPrice, setEditingPrice] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null); // { id, customerName }
  const [deliveryDate, setDeliveryDate] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [billSale, setBillSale] = useState(false);
  const [favorites, setFavorites] = useState(
    () => new Set(JSON.parse(localStorage.getItem("pos_favorites") || "[]"))
  );

  const isDelivery = name => /^envio/i.test((name||"").trim());

  const toggleFav = (e, id) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("pos_favorites", JSON.stringify([...next]));
      return next;
    });
  };

  const categories = ["Todos", ...new Set(products.map(p => p.category))];
  const getKitMaxStock = (prod) => {
    if (!prod.kitItems?.length) return prod.stock;
    let max = Infinity;
    for (const comp of prod.kitItems) {
      const compProd = products.find(p => p.id === comp.productId);
      if (!compProd) return 0;
      max = Math.min(max, Math.floor(compProd.stock / comp.qty));
    }
    return isFinite(max) ? max : 0;
  };

  const filtered = products
    .filter(p => p.active &&
      (filterCat==="Todos" || p.category===filterCat) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const af = favorites.has(a.id) ? 0 : 1;
      const bf = favorites.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });

  const addToCart = (prod) => {
    const isKit = prod.kitItems?.length > 0;
    const effectiveStock = getKitMaxStock(prod);
    if (effectiveStock <= 0) { showToast("Sin stock disponible", "error"); return; }
    setCart(prev => {
      const ex = prev.find(i => i.productId === prod.id);
      if (ex) {
        if (ex.qty >= effectiveStock) { showToast("Stock insuficiente", "error"); return prev; }
        return prev.map(i => i.productId===prod.id ? {...i, qty:i.qty+1, subtotal:(i.qty+1)*i.price} : i);
      }
      const price = priceList==="retail" ? prod.priceRetail : prod.priceWholesale;
      return [...prev, { productId:prod.id, name:prod.name, qty:1, price, originalPrice:price, priceOverridden:false, subtotal:price, isKit, kitItems: prod.kitItems || [], includeInTicket: true, category: prod.category, frozen: false }];
    });
  };

  const updateQty = (productId, delta) => {
    const prod = products.find(p => p.id === productId);
    const maxStock = prod ? getKitMaxStock(prod) : Infinity;
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const nq = Math.round((i.qty + delta) * 100) / 100;
      if (nq <= 0) return null;
      if (delta > 0 && nq > maxStock) { showToast(`Stock insuficiente (máx. ${maxStock})`, "error"); return i; }
      return {...i, qty:nq, subtotal:nq*i.price};
    }).filter(Boolean));
  };

  const setQty = (productId, val) => {
    const nq = Number(val);
    if (!nq || nq <= 0) return;
    const prod = products.find(p => p.id === productId);
    const maxStock = prod ? getKitMaxStock(prod) : Infinity;
    if (nq > maxStock) { showToast(`Stock insuficiente (máx. ${maxStock})`, "error"); return; }
    setCart(prev => prev.map(i => i.productId !== productId ? i : {...i, qty:nq, subtotal:nq*i.price}));
  };

  const removeItem = id => setCart(prev => prev.filter(i => i.productId !== id));
  const toggleTicket = id => setCart(prev => prev.map(i => i.productId===id ? {...i, includeInTicket:!i.includeInTicket} : i));

  const toggleFrozen = (productId) => {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newFrozen = !i.frozen;
      const newPrice = newFrozen
        ? Math.round(i.originalPrice * 0.85 * 100) / 100
        : i.originalPrice;
      return { ...i, frozen: newFrozen, price: newPrice, priceOverridden: false, subtotal: i.qty * newPrice };
    }));
  };

  const overridePrice = (productId, newPrice) => {
    const p = Number(newPrice);
    if (isNaN(p) || p < 0) { setEditingPrice(null); return; }
    setCart(prev => prev.map(i => i.productId===productId ? {...i, price:p, subtotal:i.qty*p, priceOverridden:true} : i));
    setEditingPrice(null);
  };

  const subtotal = cart.reduce((a,b) => a + (b.includeInTicket ? b.subtotal : 0), 0);
  const deliveryExcluded = cart.filter(i => isDelivery(i.name) && !i.includeInTicket).reduce((a,b) => a+b.subtotal, 0);
  const discountAmt = discountType==="pct"
    ? Math.round(subtotal * (Number(discountValue)||0) / 100)
    : Math.min(Number(discountValue)||0, subtotal);
  const total = subtotal - discountAmt;

  const clearCart = () => {
    setCart([]); setSelectedCustomer(null); setOrderNotes("");
    setPriceList("retail"); setDiscountType("pct"); setDiscountValue(""); setEditingPrice(null);
    setBillSale(false);
  };

  const completeSale = async (status="closed") => {
    if (cart.length === 0) { showToast("El carrito está vacío", "error"); return; }
    for (const item of cart) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;
      const maxStock = getKitMaxStock(prod);
      if (item.qty > maxStock) {
        showToast(`Stock insuficiente para "${item.name}" (disponible: ${maxStock})`, "error");
        return;
      }
    }
    const sale = {
      id: uid(),
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || "Anónimo",
      items: cart,
      total,
      priceList,
      paymentMethod: payMethod,
      status,
      notes: orderNotes,
      createdAt: new Date().toISOString(),
      discountType,
      discountValue: Number(discountValue) || 0,
      discountAmount: discountAmt,
      needsBilling: billSale,
      billingStatus: billSale ? "pending" : null,
    };
    // deduct stock — productos normales (no kits)
    const stockUpdates = cart
      .filter(ci => !ci.isKit)
      .map(ci => {
        const p = products.find(x => x.id === ci.productId);
        if (!p) return null;
        return { id: p.id, newStock: Math.max(0, p.stock - ci.qty) };
      }).filter(Boolean);
    // deduct stock — componentes de kits
    const kitStockMap = {};
    for (const ci of cart.filter(c => c.isKit)) {
      for (const comp of (ci.kitItems || [])) {
        kitStockMap[comp.productId] = (kitStockMap[comp.productId] || 0) + comp.qty * ci.qty;
      }
    }
    for (const [compId, totalQty] of Object.entries(kitStockMap)) {
      const p = products.find(x => x.id === compId);
      if (!p) continue;
      const existing = stockUpdates.find(u => u.id === compId);
      if (existing) {
        existing.newStock = Math.max(0, existing.newStock - totalQty);
      } else {
        stockUpdates.push({ id: compId, newStock: Math.max(0, p.stock - totalQty) });
      }
    }
    for (const { id, newStock } of stockUpdates) {
      const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", id);
      if (error) showToast("Error al descontar stock: " + error.message, "error");
    }
    setProducts(prev => prev.map(p => {
      const upd = stockUpdates.find(u => u.id === p.id);
      return upd ? {...p, stock: upd.newStock} : p;
    }));
    const { error: saleErr } = await supabase.from("sales").insert(saleToDb(sale));
    if (saleErr) { showToast("Error al guardar venta: " + saleErr.message, "error"); return; }
    // if closed sale with account payment → record charge in account_payments
    if (status === "closed" && payMethod === "account" && selectedCustomer) {
      const charge = { id: crypto.randomUUID(), customerId: selectedCustomer.id, saleId: sale.id,
        amount: total, type: "charge", paymentMethod: null, date: todayStr(), notes: "" };
      const { error: payErr } = await supabase.from("account_payments").insert(accountPaymentToDb(charge));
      if (payErr) { showToast("Error al registrar movimiento: " + payErr.message, "error"); return; }
      setAccountPayments(prev => [...prev, charge]);
    }
    setSales(prev => [sale, ...prev]);
    const cliente = selectedCustomer?.name || "Anónimo";
    const metodo = PAY_ORDER_LABELS?.[payMethod] || payMethod;
    logAction?.(status === "closed" ? "venta" : "pedido", "pos",
      `$${total} — ${cliente} — ${metodo}${discountAmt > 0 ? ` (desc. $${discountAmt})` : ""}`);
    setPayModal(false);
    clearCart();
    showToast(status==="closed" ? "Venta registrada ✓" : "Pedido guardado ✓");
    if (status === "open") {
      setDeliveryDate("");
      setDeliveryModal({ id: sale.id, customerName: sale.customerName || "Anónimo" });
    }
  };

  const saveDeliveryDate = async () => {
    if (!deliveryDate || !deliveryModal) { setDeliveryModal(null); return; }
    await supabase.from("sales").update({ delivery_date: deliveryDate }).eq("id", deliveryModal.id);
    setSales(prev => prev.map(s => s.id === deliveryModal.id ? { ...s, deliveryDate } : s));
    setDeliveryModal(null);
    showToast("Fecha de entrega guardada ✓");
  };

  // recalc prices when list changes (skip manually overridden items)
  useEffect(() => {
    setCart(prev => prev.map(i => {
      if (i.priceOverridden) return i;
      const prod = products.find(p => p.id === i.productId);
      if (!prod) return i;
      const basePrice = priceList==="retail" ? prod.priceRetail : prod.priceWholesale;
      const price = i.frozen ? Math.round(basePrice * 0.85 * 100) / 100 : basePrice;
      return {...i, price, originalPrice: basePrice, subtotal: i.qty * price};
    }));
  }, [priceList]);

  return (
    <div className="pos-layout">
      {/* LEFT: PRODUCTS */}
      <div className="pos-products">
        <div style={{ marginBottom:14, display:"flex", gap:10, flexWrap:"wrap" }}>
          <div className="search-wrap" style={{ flex:1, minWidth:180 }}>
            <div className="search-ico"><Ico n="search" s={14}/></div>
            <input placeholder="Buscar producto..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {categories.map(c => (
              <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`}
                onClick={()=>setFilterCat(c)}>{c}</button>
            ))}
          </div>
        </div>
        <div className="prod-grid">
          {filtered.map(p => {
            const price = priceList==="retail" ? p.priceRetail : p.priceWholesale;
            const effStock = getKitMaxStock(p);
            const isFav = favorites.has(p.id);
            return (
              <div key={p.id} className={`prod-card${effStock<=0?" inactive":""}`} onClick={()=>addToCart(p)} style={{ position:"relative" }}>
                <button
                  onClick={e => toggleFav(e, p.id)}
                  title={isFav ? "Quitar favorito" : "Marcar favorito"}
                  style={{
                    position:"absolute", top:5, right:5,
                    background: isFav ? "var(--amber)" : "var(--s2)",
                    border: `1.5px solid ${isFav ? "var(--amber)" : "var(--border)"}`,
                    borderRadius:6, cursor:"pointer", padding:"2px 5px",
                    fontSize:".78em", lineHeight:1.2, fontWeight:700,
                    color: isFav ? "white" : "var(--t4)",
                    transition:"all .15s",
                  }}
                >{isFav ? "★ fav" : "☆"}</button>
                <div className="prod-card-name" style={{ paddingRight:18 }}>{p.name}</div>
                <div className="prod-card-cat">{p.kitItems?.length > 0 ? "Kit" : p.category}</div>
                <div className="prod-card-price">{$(price)}</div>
                <div className="prod-card-stock">Stock: {effStock}</div>
              </div>
            );
          })}
          {filtered.length===0 && <div className="empty"><div className="empty-icon">🔍</div><h3>Sin resultados</h3></div>}
        </div>
      </div>

      {/* RIGHT: CART */}
      <div className="pos-cart">
        <div className="pos-cart-header">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontWeight:700, fontSize:".95em" }}>Carrito</div>
            {cart.length>0 && <button className="btn btn-ghost btn-sm" onClick={clearCart} style={{color:"var(--red)"}}>Limpiar</button>}
          </div>
          {/* Price list toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ fontSize:".78em", color:"var(--t3)", fontWeight:600 }}>Lista:</span>
            <div className="price-toggle" style={{ flex:1 }}>
              <button className={priceList==="retail"?"active":""} onClick={()=>setPriceList("retail")}>Minorista</button>
              <button className={priceList==="wholesale"?"active":""} onClick={()=>setPriceList("wholesale")}>Mayorista</button>
            </div>
          </div>
          {/* Customer */}
          <button className="btn btn-secondary btn-sm btn-block" onClick={()=>{ setCustSearch(""); setCustModal(true); }}>
            <Ico n="user" s={13}/>
            {selectedCustomer ? selectedCustomer.name : "Cliente anónimo"}
          </button>
        </div>

        {/* Items */}
        <div className="pos-cart-items">
          {cart.length===0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"var(--t3)" }}>
              <div style={{ fontSize:"2em", marginBottom:8 }}>🛒</div>
              <div style={{ fontSize:".85em" }}>Seleccioná productos</div>
            </div>
          ) : cart.map(item => (
            <div key={item.productId} className="cart-item" style={!item.includeInTicket ? { opacity:.65 } : {}}>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="cart-item-name" style={!item.includeInTicket ? { textDecoration:"line-through", color:"var(--t3)" } : {}}>{item.name}</div>
                <div className="cart-item-sub" style={{ display:"flex", alignItems:"center", gap:3, flexWrap:"wrap" }}>
                  {editingPrice===item.productId ? (
                    <input type="number" defaultValue={item.price} autoFocus
                      style={{ width:74, padding:"1px 5px", fontSize:".82em", borderRadius:5, border:"1px solid var(--border)" }}
                      onBlur={e => overridePrice(item.productId, e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter") overridePrice(item.productId, e.target.value); if(e.key==="Escape") setEditingPrice(null); }}
                    />
                  ) : (
                    <>
                      <span style={item.priceOverridden ? {color:"var(--amber)",fontWeight:600} : {}}>{$(item.price)} c/u</span>
                      <button className="btn btn-ghost btn-icon" style={{padding:2}} title="Editar precio" onClick={()=>setEditingPrice(item.productId)}>
                        <Ico n="edit" s={10} c="var(--t4)"/>
                      </button>
                    </>
                  )}
                  {isDelivery(item.name) && (
                    <button
                      onClick={() => toggleTicket(item.productId)}
                      style={{ fontSize:".68em", padding:"2px 7px", borderRadius:5, border:"1px solid", cursor:"pointer", fontWeight:600, lineHeight:1.4,
                        background: item.includeInTicket ? "var(--greenl)" : "var(--s2)",
                        borderColor: item.includeInTicket ? "var(--greenlb)" : "var(--border)",
                        color: item.includeInTicket ? "var(--green)" : "var(--t3)" }}
                      title="Incluir o no en el ticket">
                      {item.includeInTicket ? "En ticket" : "Sin ticket"}
                    </button>
                  )}
                  {item.category === "Viandas" && (
                    <button
                      onClick={() => toggleFrozen(item.productId)}
                      style={{ fontSize:".68em", padding:"2px 7px", borderRadius:5, border:"1px solid", cursor:"pointer", fontWeight:600, lineHeight:1.4,
                        background: item.frozen ? "#dbeafe" : "var(--s2)",
                        borderColor: item.frozen ? "#3b82f6" : "var(--border)",
                        color: item.frozen ? "#1d4ed8" : "var(--t3)" }}
                      title="Aplicar descuento freezado (-15%)">
                      {item.frozen ? "❄️ Freezado -15%" : "❄️ Freezar"}
                    </button>
                  )}
                </div>
              </div>
              <div className="qty-ctrl">
                <button className="qty-btn" onClick={()=>updateQty(item.productId,-1)}>−</button>
                <input
                  type="number" min="0.01" step="0.01"
                  className="qty-num"
                  value={item.qty}
                  onChange={e=>setQty(item.productId, e.target.value)}
                  style={{ width:46, textAlign:"center", border:"none", background:"transparent", fontWeight:700, fontSize:"inherit", padding:0 }}
                />
                <button className="qty-btn" onClick={()=>updateQty(item.productId,1)}>+</button>
              </div>
              <div style={{ minWidth:70, textAlign:"right" }}>
                <div style={{ fontWeight:700, fontSize:".9em", color: item.includeInTicket ? undefined : "var(--t4)", textDecoration: item.includeInTicket ? undefined : "line-through" }}>{$(item.subtotal)}</div>
                <button className="btn btn-ghost btn-icon" style={{ padding:3, marginTop:2 }} onClick={()=>removeItem(item.productId)}>
                  <Ico n="x" s={12} c="var(--red)"/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pos-cart-footer">
          <div className="tot-row"><span>Subtotal</span><span>{$(subtotal)}</span></div>
          <div className="tot-row" style={{ alignItems:"center", gap:6 }}>
            <span style={{ color:"var(--t2)", flexShrink:0 }}>Descuento</span>
            <div style={{ display:"flex", alignItems:"center", gap:5, flex:1, justifyContent:"flex-end" }}>
              <div style={{ display:"flex", border:"1px solid var(--border)", borderRadius:6, overflow:"hidden" }}>
                <button style={{ padding:"2px 8px", background:discountType==="pct"?"var(--green)":"var(--s2)", color:discountType==="pct"?"white":"var(--t2)", border:"none", cursor:"pointer", fontWeight:700, fontSize:".74em" }} onClick={()=>setDiscountType("pct")}>%</button>
                <button style={{ padding:"2px 8px", background:discountType==="fixed"?"var(--green)":"var(--s2)", color:discountType==="fixed"?"white":"var(--t2)", border:"none", cursor:"pointer", fontWeight:700, fontSize:".74em" }} onClick={()=>setDiscountType("fixed")}>$</button>
              </div>
              <input type="number" min="0" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}
                style={{ width:58, padding:"2px 6px", fontSize:".86em", textAlign:"right", borderRadius:6, border:"1px solid var(--border)", background:"var(--s1)" }} placeholder="0"/>
              {discountAmt>0 && <span style={{ color:"var(--red)", fontWeight:600, minWidth:54, textAlign:"right" }}>-{$(discountAmt)}</span>}
            </div>
          </div>
          <div className="tot-row total"><span>TOTAL</span><span style={{color:"var(--green)"}}>{$(total)}</span></div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button className="btn btn-secondary" style={{ flex:1 }} disabled={cart.length===0}
              onClick={() => { setPendingStatus("open"); setPayModal(true); }}>
              <Ico n="clock" s={14}/>Pedido abierto
            </button>
            <button className="btn btn-primary" style={{ flex:1 }} disabled={cart.length===0}
              onClick={() => { setPendingStatus("closed"); setPayModal(true); }}>
              <Ico n="cash" s={14}/>Cobrar
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOMER MODAL */}
      {custModal && (
        <Modal title="Seleccionar cliente" onClose={()=>{ setCustModal(false); setCustSearch(""); }}>
          <div className="search-wrap" style={{ marginBottom:12 }}>
            <div className="search-ico"><Ico n="search" s={14}/></div>
            <input
              placeholder="Buscar por nombre o teléfono..."
              autoFocus
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-ghost btn-block btn-sm" style={{ marginBottom:8, justifyContent:"flex-start" }}
            onClick={()=>{ setSelectedCustomer(null); setCustModal(false); setCustSearch(""); }}>
            <Ico n="user" s={14}/> Anónimo
          </button>
          {customers
            .filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone||"").includes(custSearch))
            .sort((a,b) => a.name.localeCompare(b.name))
            .map(c => (
              <button key={c.id} className="btn btn-ghost btn-block btn-sm" style={{ marginBottom:6, justifyContent:"flex-start", textAlign:"left" }}
                onClick={()=>{
                  setSelectedCustomer(c);
                  setPriceList(c.priceList);
                  if ((c.discountPct||0) > 0) { setDiscountType("pct"); setDiscountValue(String(c.discountPct)); }
                  setCustModal(false);
                  setCustSearch("");
                }}>
                <Ico n="user" s={14}/>
                <div>
                  <div>{c.name}</div>
                  <div style={{ fontSize:".74em", color:"var(--t3)" }}>
                    {(() => { const b = custBal(c.id); return <span className={b>0?"balance-pos":b<0?"balance-neg":"balance-zero"}>Saldo: {$(b)}</span>; })()}
                    {c.phone && <span style={{ marginLeft:8 }}>📞 {c.phone}</span>}
                  </div>
                </div>
              </button>
            ))
          }
          {custSearch && customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone||"").includes(custSearch)).length === 0 && (
            <div style={{ fontSize:".84em", color:"var(--t3)", textAlign:"center", padding:"12px 0" }}>Sin resultados</div>
          )}
        </Modal>
      )}

      {/* DELIVERY DATE MODAL */}
      {deliveryModal && (
        <div className="modal-bg" onClick={() => setDeliveryModal(null)}>
          <div className="modal" style={{ maxWidth:380 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:"center", paddingTop:8 }}>
              <div style={{ fontSize:"1.8em", marginBottom:10 }}>📦</div>
              <div style={{ fontWeight:700, fontSize:".98em", color:"var(--t1)", marginBottom:5 }}>
                ¿Tiene fecha de entrega?
              </div>
              <div style={{ fontSize:".82em", color:"var(--t3)", marginBottom:22 }}>
                Pedido de <strong>{deliveryModal.customerName}</strong>
              </div>
              <div className="form-group" style={{ textAlign:"left", marginBottom:22 }}>
                <label className="lbl">Fecha máxima de entrega</label>
                <input type="date" value={deliveryDate} min={todayStr()}
                  onChange={e => setDeliveryDate(e.target.value)} autoFocus/>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => setDeliveryModal(null)}>
                  Sin fecha
                </button>
                <button className="btn btn-primary" style={{ flex:1 }} onClick={saveDeliveryDate} disabled={!deliveryDate}>
                  Guardar fecha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {payModal && (
        <Modal title={pendingStatus==="open" ? "Guardar pedido abierto" : "Completar venta"} onClose={()=>setPayModal(false)}>
          {discountAmt > 0 && (
            <div className="tot-row" style={{ marginBottom:4 }}>
              <span style={{ color:"var(--t3)" }}>Subtotal</span>
              <span style={{ color:"var(--t3)" }}>{$(subtotal)}</span>
            </div>
          )}
          {discountAmt > 0 && (
            <div className="tot-row" style={{ marginBottom:10 }}>
              <span style={{ color:"var(--red)" }}>
                Descuento {discountType==="pct" ? `${discountValue}%` : "fijo"}
              </span>
              <span style={{ color:"var(--red)", fontWeight:600 }}>-{$(discountAmt)}</span>
            </div>
          )}
          <div className="tot-row" style={{ fontSize:"1.1em", marginBottom: deliveryExcluded > 0 ? 8 : 16 }}>
            <span style={{ fontWeight:700 }}>Total a cobrar:</span>
            <span style={{ fontWeight:800, color:"var(--green)", fontSize:"1.3em" }}>{$(total)}</span>
          </div>
          {deliveryExcluded > 0 && (
            <div style={{ background:"var(--s2)", border:"1px solid var(--border)", borderRadius:8, padding:"7px 12px", marginBottom:16, fontSize:".82em", color:"var(--t3)", display:"flex", justifyContent:"space-between" }}>
              <span>Envío cobrado aparte (no incluido)</span>
              <span style={{ fontWeight:600, color:"var(--t2)" }}>{$(deliveryExcluded)}</span>
            </div>
          )}
          {selectedCustomer && (
            <div style={{ background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:".84em" }}>
              {(() => { const b = custBal(selectedCustomer.id); return <>Cliente: <strong>{selectedCustomer.name}</strong> · Saldo actual: <span className={b>=0?"balance-pos":"balance-neg"}>{$(b)}</span></>; })()}
            </div>
          )}
          <div className="section-title">Método de pago</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {Object.entries(PAY_ORDER_LABELS).map(([k,v]) => (
              (k !== "account" || selectedCustomer) && (
                <button key={k} className={`btn ${payMethod===k?"btn-primary":"btn-secondary"}`}
                  onClick={()=>setPayMethod(k)}>
                  {payMethod===k && <Ico n="check" s={13}/>}{v}
                </button>
              )
            ))}
          </div>
          <div className="form-group" style={{ marginBottom:16 }}>
            <label className="lbl">Notas del pedido</label>
            <textarea value={orderNotes} onChange={e=>setOrderNotes(e.target.value)} placeholder="Instrucciones especiales..."/>
          </div>
          <button
            onClick={() => setBillSale(p => !p)}
            style={{
              width:"100%", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"9px 14px", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:".86em",
              border: `1.5px solid ${billSale ? "var(--green)" : "var(--border)"}`,
              background: billSale ? "var(--greenl)" : "var(--s1)",
              color: billSale ? "var(--green)" : "var(--t3)",
              transition:"all .15s",
            }}>
            <span>🧾 Generar factura</span>
            <span style={{ fontSize:".82em", fontWeight:700 }}>{billSale ? "Sí" : "No"}</span>
          </button>
          <div className="modal-footer" style={{ paddingTop:0, borderTop:"none", marginTop:0, gap:10 }}>
            <button className="btn btn-secondary" onClick={()=>setPayModal(false)}>Cancelar</button>
            <button className="btn btn-primary btn-lg" onClick={()=>completeSale(pendingStatus)}>
              <Ico n="check" s={16}/>{pendingStatus==="open" ? "Guardar pedido" : "Confirmar venta"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
