import { useState, useEffect, useRef, useMemo } from "react";
import {
  CSS, Ico, Toast, Modal, LoginPage,
  uid, $, fmtDate, fmtTime, fmtDT, todayStr,
  STATUS_LABELS, STATUS_COLORS, PAY_LABELS, PAY_ORDER_LABELS,
  SEED_PRODUCTS, SEED_CUSTOMERS, SEED_RECIPES, SEED_SALES, SEED_CATEGORIES
} from "./shared.jsx";
import {
  supabase,
  dbToProduct, productToDb,
  dbToCustomer, customerToDb,
  dbToSale, saleToDb,
  dbToRecipe, recipeToDb,
  dbToExpense, expenseToDb,
  dbToIngredient, ingredientToDb,
  dbToAccountPayment, accountPaymentToDb,
} from "./supabase.js";

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("pos");
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [customers, setCustomers] = useState(SEED_CUSTOMERS);
  const [sales, setSales] = useState(SEED_SALES);
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState(SEED_CATEGORIES);
  const [expenseCategories, setExpenseCategories] = useState(["Ingredientes","Servicios","Envases","Limpieza","Otros"]);
  const [expenses, setExpenses] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [accountPayments, setAccountPayments] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: cats }, { data: expCats }, { data: prods }, { data: custs }, { data: sls }, { data: recs }, { data: exps }, { data: ingrs }, { data: accPays, error: accPaysErr }] = await Promise.all([
        supabase.from("categories").select("*"),
        supabase.from("expense_categories").select("*").order("name"),
        supabase.from("products").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("sales").select("*").order("created_at", { ascending: false }),
        supabase.from("recipes").select("*"),
        supabase.from("expenses").select("*").order("created_at", { ascending: false }),
        supabase.from("ingredients").select("*").order("name"),
        supabase.from("account_payments").select("*").order("created_at", { ascending: false }),
      ]);
      if (accPaysErr) console.error("[account_payments] Error al cargar:", accPaysErr);
      // If DB is empty for a table, seed it with default data
      if (cats && cats.length > 0) {
        setCategories(cats.map(c => c.name));
      } else {
        supabase.from("categories").insert(SEED_CATEGORIES.map(name => ({ name }))).then(() => {});
      }
      if (expCats && expCats.length > 0) {
        setExpenseCategories(expCats.map(c => c.name));
      }
      if (prods && prods.length > 0) {
        setProducts(prods.map(dbToProduct));
      } else {
        supabase.from("products").insert(SEED_PRODUCTS.map(productToDb)).then(() => {});
      }
      if (custs && custs.length > 0) {
        setCustomers(custs.map(dbToCustomer));
      } else {
        supabase.from("customers").insert(SEED_CUSTOMERS.map(customerToDb)).then(() => {});
      }
      if (sls && sls.length > 0) setSales(sls.map(dbToSale));
      if (exps && exps.length > 0) setExpenses(exps.map(dbToExpense));
      if (ingrs && ingrs.length > 0) setIngredients(ingrs.map(dbToIngredient));
      if (recs && recs.length > 0) {
        setRecipes(recs.map(dbToRecipe));
      }
      if (accPays && accPays.length > 0) setAccountPayments(accPays.map(dbToAccountPayment));
    };
    load();
  }, []);

  const showToast = (msg, type="success") => setToast({ msg, type });

  if (!user) return (
    <>
      <style>{CSS}</style>
      <LoginPage onLogin={u => { setUser(u); setPage("pos"); }} />
    </>
  );

  const nav = [
    { id:"pos", label:"Caja / POS", icon:"pos", roles:["admin","vendor"], section:"main" },
    { id:"orders", label:"Pedidos", icon:"orders", roles:["admin","vendor"], section:"main" },
    { id:"customers", label:"Clientes", icon:"customers", roles:["admin","vendor"], section:"main" },
    { id:"products", label:"Productos", icon:"products", roles:["admin","vendor"], section:"main" },
    { id:"production", label:"Producción", icon:"production", roles:["admin","vendor"], section:"admin" },
    { id:"recipes", label:"Recetas", icon:"recipes", roles:["admin","vendor"], section:"admin" },
    { id:"ingredients", label:"Ingredientes", icon:"ingredients", roles:["admin","vendor"], section:"admin" },
    { id:"expenses", label:"Gastos", icon:"expenses", roles:["admin","vendor"], section:"admin" },
    { id:"reports", label:"Reportes", icon:"reports", roles:["admin"], section:"admin" },
    { id:"settings", label:"Configuración", icon:"settings", roles:["admin","vendor"], section:"admin" },
  ].filter(n => n.roles.includes(user.role));
  const mainNav = nav.filter(n => n.section === "main");
  const adminNav = nav.filter(n => n.section === "admin");

  const props = { user, products, setProducts, customers, setCustomers, sales, setSales, recipes, setRecipes, categories, setCategories, expenseCategories, setExpenseCategories, expenses, setExpenses, ingredients, setIngredients, accountPayments, setAccountPayments, showToast, setPage };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sb-logo">
            <h1>🥗 Nutrifree</h1>
            <p>Sistema de gestión</p>
          </div>
          <nav className="sb-nav">
            <div className="sb-section">Principal</div>
            {mainNav.map(n => (
              <button key={n.id} className={`ni${page===n.id?" active":""}`} onClick={() => setPage(n.id)}>
                <Ico n={n.icon} s={15}/>{n.label}
              </button>
            ))}
            {adminNav.length > 0 && <>
              <div className="sb-section">Administración</div>
              {adminNav.map(n => (
                <button key={n.id} className={`ni${page===n.id?" active":""}`} onClick={() => setPage(n.id)}>
                  <Ico n={n.icon} s={15}/>{n.label}
                </button>
              ))}
            </>}
          </nav>
          <div className="sb-footer">
            <div className="user-chip">
              <div className="user-av">{user.name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:".82em", fontWeight:600, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
                <div style={{ fontSize:".7em", color:"var(--t3)", textTransform:"capitalize" }}>{user.role}</div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setUser(null)} title="Salir"><Ico n="logout" s={14}/></button>
            </div>
          </div>
        </aside>

        {/* CONTENT */}
        <div className="content">
          <div className="topbar">
            <span className="topbar-title">{nav.find(n=>n.id===page)?.label || ""}</span>
            <span className="topbar-date">{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
          </div>
          <div style={{ flex:1, overflow:"hidden" }}>
            {page==="pos" && <POSPage {...props}/>}
            {page==="orders" && <OrdersPage {...props}/>}
            {page==="customers" && <CustomersPage {...props}/>}
            {page==="products" && <ProductsPage {...props}/>}
            {page==="production" && <ProductionPage {...props}/>}
            {page==="recipes" && <RecipesPage {...props}/>}
            {page==="ingredients" && <IngredientsPage {...props}/>}
            {page==="expenses" && <ExpensesPage {...props}/>}
            {page==="reports" && <ReportsPage {...props}/>}
            {page==="settings" && <SettingsPage {...props}/>}
          </div>
        </div>
      </div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)}/>}
    </>
  );
}

// ─── POS PAGE ─────────────────────────────────────────────────────────────────
function POSPage({ products, setProducts, customers, setCustomers, sales, setSales, accountPayments, setAccountPayments, showToast }) {
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

  const categories = ["Todos", ...new Set(products.map(p => p.category))];
  const filtered = products.filter(p => p.active &&
    (filterCat==="Todos" || p.category===filterCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

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
      return [...prev, { productId:prod.id, name:prod.name, qty:1, price, originalPrice:price, priceOverridden:false, subtotal:price, isKit, kitItems: prod.kitItems || [] }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const nq = i.qty + delta;
      if (nq <= 0) return null;
      return {...i, qty:nq, subtotal:nq*i.price};
    }).filter(Boolean));
  };

  const removeItem = id => setCart(prev => prev.filter(i => i.productId !== id));

  const overridePrice = (productId, newPrice) => {
    const p = Number(newPrice);
    if (isNaN(p) || p < 0) { setEditingPrice(null); return; }
    setCart(prev => prev.map(i => i.productId===productId ? {...i, price:p, subtotal:i.qty*p, priceOverridden:true} : i));
    setEditingPrice(null);
  };

  const subtotal = cart.reduce((a,b) => a+b.subtotal, 0);
  const discountAmt = discountType==="pct"
    ? Math.round(subtotal * (Number(discountValue)||0) / 100)
    : Math.min(Number(discountValue)||0, subtotal);
  const total = subtotal - discountAmt;

  const clearCart = () => {
    setCart([]); setSelectedCustomer(null); setOrderNotes("");
    setPriceList("retail"); setDiscountType("pct"); setDiscountValue(""); setEditingPrice(null);
  };

  const completeSale = async (status="closed") => {
    if (cart.length === 0) { showToast("El carrito está vacío", "error"); return; }
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
      if (error) console.error("Error al descontar stock:", error.message);
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
    setPayModal(false);
    clearCart();
    showToast(status==="closed" ? "Venta registrada ✓" : "Pedido guardado ✓");
  };

  // recalc prices when list changes (skip manually overridden items)
  useEffect(() => {
    setCart(prev => prev.map(i => {
      if (i.priceOverridden) return i;
      const prod = products.find(p => p.id === i.productId);
      if (!prod) return i;
      const price = priceList==="retail" ? prod.priceRetail : prod.priceWholesale;
      return {...i, price, originalPrice:price, subtotal:i.qty*price};
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
            return (
              <div key={p.id} className={`prod-card${effStock<=0?" inactive":""}`} onClick={()=>addToCart(p)}>
                <div className="prod-card-name">{p.name}</div>
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
          <button className="btn btn-secondary btn-sm btn-block" onClick={()=>setCustModal(true)}>
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
            <div key={item.productId} className="cart-item">
              <div style={{ flex:1, minWidth:0 }}>
                <div className="cart-item-name">{item.name}</div>
                <div className="cart-item-sub" style={{ display:"flex", alignItems:"center", gap:3 }}>
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
                </div>
              </div>
              <div className="qty-ctrl">
                <button className="qty-btn" onClick={()=>updateQty(item.productId,-1)}>−</button>
                <span className="qty-num">{item.qty}</span>
                <button className="qty-btn" onClick={()=>updateQty(item.productId,1)}>+</button>
              </div>
              <div style={{ minWidth:70, textAlign:"right" }}>
                <div style={{ fontWeight:700, fontSize:".9em" }}>{$(item.subtotal)}</div>
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
        <Modal title="Seleccionar cliente" onClose={()=>setCustModal(false)}>
          <div className="search-wrap" style={{ marginBottom:12 }}>
            <div className="search-ico"><Ico n="search" s={14}/></div>
            <input placeholder="Buscar cliente..." autoFocus id="cust-search"/>
          </div>
          <button className="btn btn-ghost btn-block btn-sm" style={{ marginBottom:8, justifyContent:"flex-start" }}
            onClick={()=>{ setSelectedCustomer(null); setCustModal(false); }}>
            <Ico n="user" s={14}/> Anónimo
          </button>
          {customers.map(c => (
            <button key={c.id} className="btn btn-ghost btn-block btn-sm" style={{ marginBottom:6, justifyContent:"flex-start", textAlign:"left" }}
              onClick={()=>{
                setSelectedCustomer(c);
                setPriceList(c.priceList);
                if ((c.discountPct||0) > 0) { setDiscountType("pct"); setDiscountValue(String(c.discountPct)); }
                setCustModal(false);
              }}>
              <Ico n="user" s={14}/>
              <div>
                <div>{c.name}</div>
                <div style={{ fontSize:".74em", color:"var(--t3)" }}>
                  {(() => { const b = custBal(c.id); return <span className={b>0?"balance-pos":b<0?"balance-neg":"balance-zero"}>Saldo: {$(b)}</span>; })()}
                </div>
              </div>
            </button>
          ))}
        </Modal>
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
          <div className="tot-row" style={{ fontSize:"1.1em", marginBottom:16 }}>
            <span style={{ fontWeight:700 }}>Total a cobrar:</span>
            <span style={{ fontWeight:800, color:"var(--green)", fontSize:"1.3em" }}>{$(total)}</span>
          </div>
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

// ─── ORDERS PAGE ──────────────────────────────────────────────────────────────
function OrdersPage({ sales, setSales, products, setProducts, customers, setCustomers, accountPayments, setAccountPayments, showToast }) {
  const [filter, setFilter] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [selected, setSelected] = useState(null);

  const statuses = ["all","open","ready","delivered","closed","cancelled"];

  const isPendingPayment = (s) =>
    !["closed","cancelled"].includes(s.status) ||
    (s.status === "closed" && s.paymentMethod === "account");
  const filtered = sales
    .filter(s => filter==="all" || s.status===filter)
    .filter(s => filterPay==="all" || s.paymentMethod===filterPay)
    .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));

  const changeStatus = async (id, status) => {
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
    if (!sale.paymentMethod) { showToast("Seleccioná un método de pago", "error"); return; }
    const { error: saleErr } = await supabase.from("sales").update({ status: "closed" }).eq("id", sale.id);
    if (saleErr) { showToast("Error al cerrar: " + saleErr.message, "error"); return; }
    setSales(prev => prev.map(s => s.id===sale.id ? {...s, status:"closed"} : s));
    setSelected(prev => prev ? {...prev, status:"closed"} : prev);
    if (sale.paymentMethod === "account" && sale.customerId) {
      const charge = { id: crypto.randomUUID(), customerId: sale.customerId, saleId: sale.id,
        amount: sale.total, type: "charge", paymentMethod: null, date: todayStr(), notes: "" };
      const { error: payErr } = await supabase.from("account_payments").insert(accountPaymentToDb(charge));
      if (payErr) { showToast("Error al registrar movimiento: " + payErr.message, "error"); return; }
      setAccountPayments(prev => [...prev, charge]);
    }
    showToast("Pedido cerrado");
  };

  const cancelOrder = async (sale) => {
    // restore stock
    for (const p of sale.items) {
      const prod = products.find(x => x.id === p.productId);
      if (!prod) continue;
      const newStock = prod.stock + p.qty;
      await supabase.from("products").update({ stock: newStock }).eq("id", p.productId);
      setProducts(prev => prev.map(x => x.id===p.productId ? {...x, stock: newStock} : x));
    }
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
          <thead><tr><th>#</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Pago</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="tr-click" onClick={()=>setSelected(s)}>
                <td style={{ color:"var(--t3)", fontSize:".8em" }}>{s.id.toUpperCase()}</td>
                <td style={{ fontWeight:600 }}>{s.customerName}</td>
                <td style={{ color:"var(--t2)" }}>{s.items.length} ítem{s.items.length!==1?"s":""}</td>
                <td style={{ fontWeight:700, color:"var(--green)" }}>{$(s.total)}</td>
                <td style={{ color:"var(--t3)" }}>{PAY_LABELS[s.paymentMethod]||s.paymentMethod}</td>
                <td>
                  <span className={`badge ${STATUS_COLORS[s.status]||"badge-gray"}`}>{STATUS_LABELS[s.status]||s.status}</span>
                  {isPendingPayment(s) && <span className="badge badge-amber" style={{ marginLeft:4 }}>Pend. pago</span>}
                </td>
                <td style={{ color:"var(--t3)", fontSize:".82em" }}>{fmtDT(s.createdAt)}</td>
                <td>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
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
          <div className="table-wrap" style={{ marginBottom:16 }}>
            <table>
              <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
              <tbody>
                {selected.items.map((i,idx)=>(
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>{$(i.price)}</td><td style={{ fontWeight:700 }}>{$(i.subtotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tot-row total"><span>TOTAL</span><span style={{ color:"var(--green)" }}>{$(selected.total)}</span></div>

          {selected.status !== "closed" && selected.status !== "cancelled" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:16 }}>
              {selected.status==="open" && <button className="btn btn-blue" onClick={()=>changeStatus(selected.id,"ready")}><Ico n="box" s={13}/>Listo</button>}
              {selected.status==="ready" && <button className="btn btn-primary" onClick={()=>changeStatus(selected.id,"delivered")}><Ico n="check" s={13}/>Entregado</button>}
              <button className="btn btn-secondary" onClick={()=>closeOrder(selected)}><Ico n="check" s={13}/>Cerrar</button>
              <button className="btn btn-danger" onClick={()=>cancelOrder(selected)}><Ico n="x" s={13}/>Cancelar</button>
            </div>
          )}
          {selected.status === "closed" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:16 }}>
              <button className="btn btn-danger" onClick={()=>cancelOrder(selected)}><Ico n="x" s={13}/>Cancelar pedido</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── CUSTOMERS PAGE ───────────────────────────────────────────────────────────
function CustomersPage({ customers, setCustomers, sales, accountPayments, setAccountPayments, showToast }) {
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
                    {custBal(c.id) < 0 && (
                      <button className="btn btn-amber btn-sm" onClick={e=>{e.stopPropagation();setPayModal(c);setPayForm({amount:"",paymentMethod:"cash",notes:""});}}>
                        Registrar Pago
                      </button>
                    )}
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

// ─── PRODUCTS PAGE ────────────────────────────────────────────────────────────
function ProductsPage({ products, setProducts, categories, showToast }) {
  const [modal, setModal] = useState(null);
  const [filterCat, setFilterCat] = useState("Todos");
  const [search, setSearch] = useState("");
  const emptyForm = { name:"", category:"Viandas", priceRetail:0, priceWholesale:0, unit:"unit", stock:0, active:true, description:"", isKit:false, kitItems:[] };
  const [form, setForm] = useState(emptyForm);
  const [kitProductId, setKitProductId] = useState("");
  const [kitQty, setKitQty] = useState(1);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const cats = ["Todos", ...categories];
  const filtered = products.filter(p =>
    (filterCat==="Todos"||p.category===filterCat) &&
    (!search||p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => { setForm(emptyForm); setKitProductId(""); setKitQty(1); setModal("new"); };
  const openEdit = p => { setForm({...p, isKit: p.kitItems?.length > 0, kitItems: p.kitItems || []}); setKitProductId(""); setKitQty(1); setModal(p); };

  const save = async () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    if (modal==="new") {
      const newProduct = {...form, id:uid(), priceRetail:Number(form.priceRetail), priceWholesale:Number(form.priceWholesale), stock:Number(form.stock)};
      const { error } = await supabase.from("products").insert(productToDb(newProduct));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setProducts(p => [...p, newProduct]);
    } else {
      const updated = {...form, priceRetail:Number(form.priceRetail), priceWholesale:Number(form.priceWholesale), stock:Number(form.stock)};
      const { error } = await supabase.from("products").update(productToDb(updated)).eq("id", modal.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setProducts(p => p.map(x => x.id===modal.id ? {...x,...updated} : x));
    }
    setModal(null);
    showToast("Producto guardado");
  };

  const del = async (id) => {
    if (confirm("¿Eliminar producto?")) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setProducts(p=>p.filter(x=>x.id!==id));
      showToast("Eliminado");
    }
  };

  const toggleActive = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const active = !product.active;
    const { error } = await supabase.from("products").update({ active }).eq("id", id);
    if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
    setProducts(p => p.map(x => x.id===id ? {...x, active} : x));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Productos</div><div className="page-sub">{products.length} registrados</div></div>
        <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo producto</button>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div className="search-wrap" style={{ flex:1, minWidth:200 }}>
          <div className="search-ico"><Ico n="search" s={14}/></div>
          <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {cats.map(c => <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterCat(c)}>{c}</button>)}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Categoría</th><th>P. Minorista</th><th>P. Mayorista</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="tr-click" onClick={()=>openEdit(p)}>
                <td>
                  <div style={{ fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                    {p.name}
                    {p.kitItems?.length > 0 && <span className="badge badge-blue" style={{ fontSize:".7em" }}>Kit</span>}
                  </div>
                  {p.description&&<div style={{ fontSize:".74em", color:"var(--t3)" }}>{p.description}</div>}
                </td>
                <td><span className="tag">{p.category}</span></td>
                <td style={{ fontWeight:600, color:"var(--green)" }}>{$(p.priceRetail)}</td>
                <td style={{ color:"var(--t2)" }}>{$(p.priceWholesale)}</td>
                <td>
                  <span style={{ fontWeight:600, color:p.stock<=2?"var(--red)":p.stock<=5?"var(--amber)":"var(--t1)" }}>{p.stock}</span>
                </td>
                <td>
                  <button className={`badge ${p.active?"badge-green":"badge-gray"}`} onClick={e=>{e.stopPropagation();toggleActive(p.id);}}>
                    {p.active?"Activo":"Inactivo"}
                  </button>
                </td>
                <td>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={e=>{e.stopPropagation();del(p.id);}}><Ico n="trash" s={13} c="var(--red)"/></button>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={7}><div className="empty"><div className="empty-icon">📦</div><h3>Sin productos</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==="new"?"Nuevo producto":form.name} onClose={()=>setModal(null)}>
          <div className="form-grid">
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>set("name",e.target.value)} autoFocus/></div>
            <div className="form-group"><label className="lbl">Categoría</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)}>
                {categories.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Unidad</label>
              <select value={form.unit} onChange={e=>set("unit",e.target.value)}>
                <option value="unit">Unidad</option>
                <option value="kg">Peso (kg)</option>
              </select>
            </div>
            <div className="form-group"><label className="lbl">Precio minorista</label><input type="number" value={form.priceRetail} onChange={e=>set("priceRetail",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Precio mayorista</label><input type="number" value={form.priceWholesale} onChange={e=>set("priceWholesale",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Stock actual</label><input type="number" value={form.stock} onChange={e=>set("stock",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Activo</label>
              <select value={form.active?"true":"false"} onChange={e=>set("active",e.target.value==="true")}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="form-group full"><label className="lbl">Descripción</label><textarea value={form.description} onChange={e=>set("description",e.target.value)}/></div>
            <div className="form-group full">
              <label className="lbl" style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" checked={form.isKit} onChange={e=>set("isKit",e.target.checked)} style={{ width:16, height:16 }}/>
                ¿Es un kit? (compuesto por otros productos)
              </label>
            </div>
            {form.isKit && (
              <div className="form-group full">
                <label className="lbl">Componentes del kit</label>
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <select value={kitProductId} onChange={e=>setKitProductId(e.target.value)} style={{ flex:1 }}>
                    <option value="">— Seleccionar producto —</option>
                    {products.filter(p => !p.kitItems?.length && p.id !== (modal !== "new" ? modal.id : null)).map(p =>
                      <option key={p.id} value={p.id}>{p.name}</option>
                    )}
                  </select>
                  <input type="number" value={kitQty} onChange={e=>setKitQty(Number(e.target.value))} min={1} style={{ width:70 }} placeholder="Cant."/>
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    if (!kitProductId) return;
                    const already = form.kitItems.find(k => k.productId === kitProductId);
                    if (already) { set("kitItems", form.kitItems.map(k => k.productId===kitProductId ? {...k, qty: kitQty} : k)); }
                    else { set("kitItems", [...form.kitItems, { productId: kitProductId, qty: kitQty }]); }
                    setKitProductId(""); setKitQty(1);
                  }}>Agregar</button>
                </div>
                {form.kitItems.length > 0 && (
                  <div style={{ border:"1px solid var(--border)", borderRadius:6, overflow:"hidden" }}>
                    {form.kitItems.map((k,i) => {
                      const prod = products.find(p => p.id === k.productId);
                      return (
                        <div key={k.productId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px", background: i%2===0?"var(--bg2)":"var(--bg1)", fontSize:".88em" }}>
                          <span>{prod?.name || k.productId}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ color:"var(--t2)" }}>×{k.qty}</span>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>set("kitItems", form.kitItems.filter((_,j)=>j!==i))}><Ico n="trash" s={12} c="var(--red)"/></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {form.kitItems.length === 0 && <div style={{ color:"var(--t3)", fontSize:".84em" }}>Agregá al menos un producto componente.</div>}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PRODUCTION PAGE ──────────────────────────────────────────────────────────
function ProductionPage({ products, setProducts, recipes, setIngredients, showToast }) {
  const [qty, setQty] = useState({});

  const setQ = (id,v) => setQty(p=>({...p,[id]:v}));

  const applyProduction = async (id) => {
    const q = Number(qty[id]);
    if (!q || q<=0) { showToast("Ingresá una cantidad válida", "error"); return; }

    const product = products.find(x => x.id === id);
    if (!product) return;
    const newProductStock = product.stock + q;
    const { error: prodErr } = await supabase.from("products").update({ stock: newProductStock }).eq("id", id);
    if (prodErr) { showToast("Error al actualizar stock: " + prodErr.message, "error"); return; }
    setProducts(p => p.map(x => x.id===id ? {...x, stock: newProductStock} : x));

    const recipe = recipes.find(r => r.productId === id);
    if (!recipe) {
      setQty(p=>({...p,[id]:""}));
      showToast(`+${q} unidades · sin receta asociada`, "error");
      return;
    }
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      setQty(p=>({...p,[id]:""}));
      showToast(`+${q} unidades · la receta no tiene ingredientes`, "error");
      return;
    }

    const factor = q / (recipe.yield > 0 ? recipe.yield : 1);
    const ingUpdates = [];
    setIngredients(prev => {
      let matched = 0;
      const next = prev.map(ing => {
        const ri = recipe.ingredients.find(r =>
          (r.ingredientId && r.ingredientId === ing.id) ||
          (!r.ingredientId && r.name?.toLowerCase() === ing.name?.toLowerCase())
        );
        if (!ri) return ing;
        matched++;
        const newStock = ing.stock - ri.qty * factor;
        ingUpdates.push({ id: ing.id, newStock });
        return {...ing, stock: newStock};
      });
      console.log("[Producción] ingredientes descontados:", matched);
      return next;
    });
    for (const { id: ingId, newStock } of ingUpdates) {
      const { error } = await supabase.from("ingredients").update({ stock: newStock }).eq("id", ingId);
      if (error) console.error("Error al descontar ingrediente:", error.message);
    }

    setQty(p=>({...p,[id]:""}));
    showToast(`+${q} unidades registradas · ingredientes descontados`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Producción diaria</div><div className="page-sub">Ingresá las unidades producidas hoy para actualizar el stock</div></div>
      </div>

      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ fontSize:".84em", color:"var(--t2)", display:"flex", gap:8, alignItems:"center" }}>
          <Ico n="alert" s={15} c="var(--amber)"/>
          Ingresá la cantidad producida de cada producto. El stock se incrementará automáticamente.
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Stock actual</th><th>Producción hoy</th><th></th></tr></thead>
          <tbody>
            {products.filter(p=>p.active).map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight:600 }}>{p.name}</td>
                <td><span className="tag">{p.category}</span></td>
                <td>
                  <span style={{ fontWeight:700, color:p.stock<=2?"var(--red)":p.stock<=5?"var(--amber)":"var(--green)" }}>
                    {p.stock} unidades
                  </span>
                </td>
                <td style={{ width:180 }}>
                  <input type="number" min="0" placeholder="Cant. producida" value={qty[p.id]||""}
                    onChange={e=>setQ(p.id,e.target.value)} style={{ width:"100%" }}/>
                </td>
                <td>
                  <button className="btn btn-primary btn-sm" onClick={()=>applyProduction(p.id)}>
                    <Ico n="plus" s={12}/>Agregar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── RECIPES PAGE ─────────────────────────────────────────────────────────────
function RecipesPage({ recipes, setRecipes, products, ingredients, showToast }) {
  const [modal, setModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [form, setForm] = useState({ productId:"", prepTime:0, cookTime:0, yield:1, notes:"", ingredients:[], steps:[] });
  const [newIngr, setNewIngr] = useState({ ingredientId:"", qty:"" });
  const [newStep, setNewStep] = useState("");
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const ingredientCost = (i) => {
    const ing = i.ingredientId
      ? ingredients.find(x => x.id === i.ingredientId)
      : ingredients.find(x => x.name?.toLowerCase() === i.name?.toLowerCase());
    return ing ? i.qty * ing.unitCost : Number(i.cost) || 0;
  };
  const totalCost = (ingrs) => ingrs.reduce((a, b) => a + ingredientCost(b), 0);
  const costPerUnit = (r) => r.yield>0 ? totalCost(r.ingredients)/r.yield : 0;

  const exportRecipePDF = (r) => {
    const prod = products.find(p=>p.id===r.productId);
    const cost = totalCost(r.ingredients);
    const cpu = costPerUnit(r);
    const margin = prod ? ((prod.priceRetail - cpu)/prod.priceRetail*100) : 0;
    const fmt = n => `$${Number(n||0).toLocaleString("es-AR",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Receta - ${prod?.name||"Producto"}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:36px;color:#1a1a1a;font-size:14px}
h1{font-size:24px;font-weight:800;margin-bottom:2px}.sub{color:#888;font-size:12px;margin-bottom:28px;border-bottom:1px solid #e5e7eb;padding-bottom:12px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}.stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px}
.stat-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.stat-value{font-size:18px;font-weight:700;margin-top:4px}
h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#4b5563;border-bottom:2px solid #22c55e;padding-bottom:4px;margin:22px 0 10px}
table{width:100%;border-collapse:collapse}th{background:#f9fafb;text-align:left;padding:7px 10px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb}
td{padding:7px 10px;border-bottom:1px solid #f3f4f6;font-size:13px}.total-row td{font-weight:700;background:#f0fdf4;color:#16a34a}
.costs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:4px}.cost-box{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px}
.cost-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.cost-value{font-size:18px;font-weight:700;margin-top:4px}
.step{display:flex;gap:10px;margin-bottom:10px;align-items:flex-start}.step-num{width:22px;height:22px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.notes{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;margin-top:16px}
@media print{body{padding:20px}}
</style></head><body>
<h1>${prod?.name||"Producto eliminado"}</h1>
<div class="sub">Ficha técnica &nbsp;·&nbsp; NutriFree POS</div>
<div class="stats">
  <div class="stat"><div class="stat-label">Tiempo preparación</div><div class="stat-value">${r.prepTime} min</div></div>
  <div class="stat"><div class="stat-label">Tiempo cocción</div><div class="stat-value">${r.cookTime} min</div></div>
  <div class="stat"><div class="stat-label">Rendimiento</div><div class="stat-value">${r.yield} unidades</div></div>
</div>
<h2>Ingredientes</h2>
<table><thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Costo</th></tr></thead><tbody>
${r.ingredients.map(i=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.unit}</td><td>${fmt(ingredientCost(i))}</td></tr>`).join("")}
<tr class="total-row"><td colspan="3">TOTAL</td><td>${fmt(cost)}</td></tr>
</tbody></table>
<h2>Costos</h2>
<div class="costs">
  <div class="cost-box"><div class="cost-label">Costo total</div><div class="cost-value">${fmt(cost)}</div></div>
  <div class="cost-box"><div class="cost-label">Costo por unidad</div><div class="cost-value">${fmt(cpu)}</div></div>
  ${prod?`<div class="cost-box"><div class="cost-label">Margen estimado</div><div class="cost-value" style="color:${margin>30?"#16a34a":margin>10?"#d97706":"#dc2626"}">${margin.toFixed(1)}%</div></div>`:""}
</div>
${r.steps.length>0?`<h2>Pasos</h2>${r.steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><div>${s}</div></div>`).join("")}`:""}
${r.notes?`<div class="notes">📝 ${r.notes}</div>`:""}
</body></html>`;
    const win = window.open("","_blank");
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  const openNew = () => { setForm({ productId:products[0]?.id||"", prepTime:0, cookTime:0, yield:1, notes:"", ingredients:[], steps:[] }); setModal("new"); };
  const openEdit = r => { setForm({...r, ingredients:[...r.ingredients], steps:[...r.steps]}); setModal(r); };

  const addIngr = () => {
    if (!newIngr.ingredientId || !newIngr.qty) return;
    const ing = ingredients.find(i => i.id === newIngr.ingredientId);
    if (!ing) return;
    const qty = Number(newIngr.qty);
    const cost = qty * ing.unitCost;
    setForm(p=>({...p, ingredients:[...p.ingredients, { ingredientId: ing.id, name: ing.name, qty, unit: ing.unit, cost }]}));
    setNewIngr({ ingredientId:"", qty:"" });
  };
  const removeIngr = i => setForm(p=>({...p,ingredients:p.ingredients.filter((_,idx)=>idx!==i)}));
  const addStep = () => { if (!newStep) return; setForm(p=>({...p,steps:[...p.steps,newStep]})); setNewStep(""); };
  const removeStep = i => setForm(p=>({...p,steps:p.steps.filter((_,idx)=>idx!==i)}));

  const save = async () => {
    if (!form.productId) { showToast("Seleccioná un producto", "error"); return; }
    if (modal==="new") {
      const newRecipe = {...form, id: crypto.randomUUID()};
      const { error } = await supabase.from("recipes").insert(recipeToDb(newRecipe));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setRecipes(p=>[...p, newRecipe]);
    } else {
      const { error } = await supabase.from("recipes").update(recipeToDb({...form, id:modal.id})).eq("id", modal.id);
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setRecipes(p=>p.map(r=>r.id===modal.id?{...r,...form}:r));
    }
    setModal(null);
    showToast("Receta guardada");
  };

  const del = async (id) => {
    if(confirm("¿Eliminar receta?")) {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setRecipes(p=>p.filter(r=>r.id!==id));
      showToast("Eliminada");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Recetas</div><div className="page-sub">Fichas técnicas de productos</div></div>
        <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nueva receta</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
        {recipes.map(r => {
          const prod = products.find(p=>p.id===r.productId);
          const cost = totalCost(r.ingredients);
          const cpu = costPerUnit(r);
          const margin = prod ? ((prod.priceRetail - cpu)/prod.priceRetail*100) : 0;
          return (
            <div key={r.id} className="card card-hover" onClick={()=>setViewModal(r)}>
              <div style={{ fontWeight:700, fontSize:".95em", marginBottom:4 }}>{prod?.name||"Producto eliminado"}</div>
              <div style={{ fontSize:".78em", color:"var(--t3)", marginBottom:10 }}>
                ⏱ {r.prepTime}min prep · {r.cookTime}min cocción · Rinde {r.yield} unid.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:".82em" }}>
                <div><span style={{ color:"var(--t3)" }}>Costo total:</span><div style={{ fontWeight:700 }}>{$(cost)}</div></div>
                <div><span style={{ color:"var(--t3)" }}>Costo/unidad:</span><div style={{ fontWeight:700 }}>{$(cpu)}</div></div>
                {prod && <div style={{ gridColumn:"1/-1" }}><span style={{ color:"var(--t3)" }}>Margen estimado:</span><div style={{ fontWeight:700, color:margin>30?"var(--green)":margin>10?"var(--amber)":"var(--red)" }}>{margin.toFixed(1)}%</div></div>}
              </div>
              <div style={{ display:"flex", gap:6, marginTop:12 }}>
                <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();openEdit(r);}}><Ico n="edit" s={12}/>Editar</button>
                <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();exportRecipePDF(r);}} title="Exportar PDF"><Ico n="download" s={12}/>PDF</button>
                <button className="btn btn-danger btn-sm" onClick={e=>{e.stopPropagation();del(r.id);}}><Ico n="trash" s={12}/></button>
              </div>
            </div>
          );
        })}
        {recipes.length===0&&<div className="empty"><div className="empty-icon">📖</div><h3>Sin recetas</h3></div>}
      </div>

      {/* VIEW MODAL */}
      {viewModal && (
        <Modal title={products.find(p=>p.id===viewModal.productId)?.name||"Receta"} onClose={()=>setViewModal(null)} lg>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
            {[["Tiempo prep.",viewModal.prepTime+" min"],["Tiempo cocción",viewModal.cookTime+" min"],["Rendimiento",viewModal.yield+" unidades"]].map(([l,v])=>(
              <div key={l} style={{ background:"var(--s2)", borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:".72em", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".4px" }}>{l}</div>
                <div style={{ fontWeight:700, marginTop:4 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="section-title">Ingredientes</div>
          <div className="table-wrap" style={{ marginBottom:16 }}>
            <table>
              <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Costo</th></tr></thead>
              <tbody>
                {viewModal.ingredients.map((i,idx)=>(
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>{i.unit}</td><td>{$(ingredientCost(i))}</td></tr>
                ))}
                <tr style={{ background:"var(--greenl)" }}>
                  <td colSpan={3} style={{ fontWeight:700 }}>TOTAL</td>
                  <td style={{ fontWeight:700, color:"var(--green)" }}>{$(totalCost(viewModal.ingredients))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="section-title">Pasos</div>
          {viewModal.steps.map((s,i)=>(
            <div key={i} style={{ display:"flex", gap:10, marginBottom:8, padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:"var(--green)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".76em", fontWeight:700, flexShrink:0 }}>{i+1}</div>
              <div style={{ fontSize:".88em", paddingTop:3 }}>{s}</div>
            </div>
          ))}
          {viewModal.notes&&<div style={{ marginTop:12, background:"var(--amberl)", border:"1px solid var(--amberlb)", borderRadius:8, padding:"8px 12px", fontSize:".84em" }}>📝 {viewModal.notes}</div>}
        </Modal>
      )}

      {/* EDIT MODAL */}
      {modal && (
        <Modal title={modal==="new"?"Nueva receta":"Editar receta"} onClose={()=>setModal(null)} lg>
          <div className="form-grid" style={{ marginBottom:16 }}>
            <div className="form-group full">
              <label className="lbl">Producto *</label>
              <select value={form.productId} onChange={e=>setF("productId",e.target.value)}>
                {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Tiempo preparación (min)</label><input type="number" value={form.prepTime} onChange={e=>setF("prepTime",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Tiempo cocción (min)</label><input type="number" value={form.cookTime} onChange={e=>setF("cookTime",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Rendimiento (unidades)</label><input type="number" value={form.yield} onChange={e=>setF("yield",e.target.value)}/></div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>setF("notes",e.target.value)}/></div>
          </div>

          <div className="section-title">Ingredientes</div>
          {form.ingredients.map((ing,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <span style={{ flex:2, fontSize:".86em" }}>{ing.name}</span>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>{ing.qty} {ing.unit}</span>
              <span style={{ fontSize:".84em" }}>{$(ing.cost)}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>removeIngr(i)}><Ico n="x" s={12} c="var(--red)"/></button>
            </div>
          ))}
          <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr auto", gap:6, marginBottom:16 }}>
            <select value={newIngr.ingredientId} onChange={e=>setNewIngr(p=>({...p,ingredientId:e.target.value}))}>
              <option value="">-- Seleccionar ingrediente --</option>
              {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit}) — ${i.unitCost}/{i.unit}</option>)}
            </select>
            <input placeholder="Cant." type="number" value={newIngr.qty} onChange={e=>setNewIngr(p=>({...p,qty:e.target.value}))}/>
            <button className="btn btn-primary btn-sm" onClick={addIngr}><Ico n="plus" s={12}/></button>
          </div>

          <div className="section-title">Pasos</div>
          {form.steps.map((s,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:6 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:"var(--green)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".72em", fontWeight:700, flexShrink:0, marginTop:2 }}>{i+1}</div>
              <span style={{ flex:1, fontSize:".86em" }}>{s}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>removeStep(i)}><Ico n="x" s={12} c="var(--red)"/></button>
            </div>
          ))}
          <div style={{ display:"flex", gap:6, marginBottom:16 }}>
            <input placeholder="Describí el paso..." value={newStep} onChange={e=>setNewStep(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStep()}/>
            <button className="btn btn-primary btn-sm" onClick={addStep}><Ico n="plus" s={12}/></button>
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar receta</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── INGREDIENTS PAGE ─────────────────────────────────────────────────────────
const INGR_CATS = ["Harinas","Lácteos","Grasas/Aceites","Endulzantes","Frutas/Verduras","Especias","Proteínas","Otros"];
const INGR_UNITS = ["g","kg","ml","l","unidad","unidades","cdas","ctas"];

function IngredientsPage({ ingredients, setIngredients, showToast }) {
  const emptyForm = { name:"", category:"Harinas", unit:"g", stock:0, stockMin:0, unitCost:0, supplier:"", notes:"" };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterCat, setFilterCat] = useState("Todos");
  const [stockEdit, setStockEdit] = useState({});
  const [priceEdit, setPriceEdit] = useState({});
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const filtered = ingredients
    .filter(i => filterCat==="Todos" || i.category===filterCat)
    .sort((a,b) => a.name.localeCompare(b.name));

  const lowStock = ingredients.filter(i => i.stockMin > 0 && i.stock <= i.stockMin);
  const totalValue = ingredients.reduce((a,i) => a + i.stock * i.unitCost, 0);

  const openNew  = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = i  => { setForm({...i}); setModal(i); };

  const save = async () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    const data = { ...form, stock:Number(form.stock)||0, stockMin:Number(form.stockMin)||0, unitCost:Number(form.unitCost)||0 };
    if (modal==="new") {
      const newIngr = { ...data, id: crypto.randomUUID() };
      const { error } = await supabase.from("ingredients").insert(ingredientToDb(newIngr));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setIngredients(p=>[...p, newIngr]);
    } else {
      const { error } = await supabase.from("ingredients").update(ingredientToDb(data)).eq("id", modal.id);
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setIngredients(p=>p.map(i=>i.id===modal.id?{...i,...data}:i));
    }
    setModal(null);
    showToast("Ingrediente guardado");
  };

  const del = async (id) => {
    if (confirm("¿Eliminar ingrediente?")) {
      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setIngredients(p=>p.filter(i=>i.id!==id));
      showToast("Eliminado");
    }
  };

  const applyPrice = async (id) => {
    const val = Number(priceEdit[id]);
    if (isNaN(val) || val < 0) return;
    const { error } = await supabase.from("ingredients").update({ unit_cost: val }).eq("id", id);
    if (error) { showToast("Error al actualizar precio: " + error.message, "error"); return; }
    setIngredients(p=>p.map(i=>i.id===id?{...i,unitCost:val}:i));
    setPriceEdit(p=>({...p,[id]:undefined}));
    showToast("Precio actualizado");
  };

  const applyStock = async (id) => {
    const qty = Number(stockEdit[id]);
    if (!qty) return;
    const ingr = ingredients.find(i=>i.id===id);
    const newStock = (ingr?.stock||0) + qty;
    const { error } = await supabase.from("ingredients").update({ stock: newStock }).eq("id", id);
    if (error) { showToast("Error al actualizar stock: " + error.message, "error"); return; }
    setIngredients(p=>p.map(i=>i.id===id?{...i,stock:newStock}:i));
    setStockEdit(p=>({...p,[id]:""}));
    showToast(`Stock: ${newStock} ${ingr?.unit}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Ingredientes</div><div className="page-sub">{ingredients.length} registrados</div></div>
        <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo ingrediente</button>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat"><div className="stat-num">{ingredients.length}</div><div className="stat-label">Total ingredientes</div><div className="stat-icon">🧂</div></div>
        <div className={`stat${lowStock.length>0?" stat-red":""}`}><div className="stat-num">{lowStock.length}</div><div className="stat-label">Stock bajo</div><div className="stat-icon">⚠️</div></div>
        <div className="stat"><div className="stat-num">{$(totalValue)}</div><div className="stat-label">Valor en stock</div><div className="stat-icon">💰</div></div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {["Todos",...INGR_CATS].map(c=>(
          <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterCat(c)}>{c}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Unidad</th><th>Stock</th><th>Mín.</th><th>Costo/unid.</th><th>Proveedor</th><th>Agregar stock</th><th></th></tr></thead>
          <tbody>
            {filtered.map(i => {
              const low = i.stockMin > 0 && i.stock <= i.stockMin;
              return (
                <tr key={i.id} className="tr-click" onClick={()=>openEdit(i)}>
                  <td style={{ fontWeight:600 }}>{i.name}</td>
                  <td><span className="tag">{i.category}</span></td>
                  <td style={{ color:"var(--t3)" }}>{i.unit}</td>
                  <td>
                    <span style={{ fontWeight:700, color:low?"var(--red)":i.stockMin>0&&i.stock<=i.stockMin*1.5?"var(--amber)":"var(--green)" }}>
                      {i.stock} {i.unit}
                    </span>
                    {low && <span style={{ fontSize:".72em", color:"var(--red)", marginLeft:6 }}>⚠ bajo</span>}
                  </td>
                  <td style={{ color:"var(--t3)" }}>{i.stockMin} {i.unit}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {priceEdit[i.id] !== undefined ? (
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        <input type="number" min="0" step="0.01" style={{ width:80 }} autoFocus
                          value={priceEdit[i.id]}
                          onChange={e=>setPriceEdit(p=>({...p,[i.id]:e.target.value}))}
                          onKeyDown={e=>{ if(e.key==="Enter") applyPrice(i.id); if(e.key==="Escape") setPriceEdit(p=>({...p,[i.id]:undefined})); }}/>
                        <button className="btn btn-primary btn-sm" onClick={()=>applyPrice(i.id)}><Ico n="check" s={12}/></button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setPriceEdit(p=>({...p,[i.id]:undefined}))}><Ico n="x" s={12}/></button>
                      </div>
                    ) : (
                      <span style={{ fontWeight:600, cursor:"pointer", borderBottom:"1px dashed var(--t4)" }}
                        onClick={()=>setPriceEdit(p=>({...p,[i.id]:i.unitCost}))}>
                        {$(i.unitCost)}
                      </span>
                    )}
                  </td>
                  <td style={{ color:"var(--t3)", fontSize:".86em" }}>{i.supplier||"—"}</td>
                  <td onClick={e=>e.stopPropagation()} style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <input type="number" style={{ width:80 }} placeholder="Cant." value={stockEdit[i.id]||""}
                      onChange={e=>setStockEdit(p=>({...p,[i.id]:e.target.value}))}
                      onKeyDown={e=>e.key==="Enter"&&applyStock(i.id)}/>
                    <button className="btn btn-primary btn-sm" onClick={()=>applyStock(i.id)}><Ico n="plus" s={12}/></button>
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(i.id)}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={9}><div className="empty"><div className="empty-icon">🧂</div><h3>Sin ingredientes</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==="new"?"Nuevo ingrediente":form.name} onClose={()=>setModal(null)} lg>
          <div className="form-grid">
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>setF("name",e.target.value)} autoFocus placeholder="Ej: Harina de arroz"/></div>
            <div className="form-group"><label className="lbl">Categoría</label>
              <select value={form.category} onChange={e=>setF("category",e.target.value)}>
                {INGR_CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Unidad de medida</label>
              <select value={form.unit} onChange={e=>setF("unit",e.target.value)}>
                {INGR_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Stock actual</label><input type="number" min="0" value={form.stock} onChange={e=>setF("stock",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Stock mínimo (alerta)</label><input type="number" min="0" value={form.stockMin} onChange={e=>setF("stockMin",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Costo por unidad</label><input type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>setF("unitCost",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Proveedor</label><input value={form.supplier} onChange={e=>setF("supplier",e.target.value)} placeholder="Nombre del proveedor"/></div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>setF("notes",e.target.value)} placeholder="Información adicional"/></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── EXPENSES PAGE ────────────────────────────────────────────────────────────
const EXPENSE_UNITS = ["unidades", "kg", "g", "litros", "porciones"];

function ExpensesPage({ expenses, setExpenses, expenseCategories, recipes, setRecipes, showToast }) {
  const defaultCat = expenseCategories[0] || "Ingredientes";
  const emptyForm = { date:todayStr(), supplier:"", concept:"", quantity:1, unit:"unidades", unitPrice:0, total:0, paymentMethod:"", paymentStatus:"pending", category:defaultCat, notes:"" };
  const [modal, setModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat] = useState("Todos");

  const set = (k, v) => setForm(p => {
    const np = {...p, [k]:v};
    if (k==="quantity" || k==="unitPrice") np.total = Number(np.quantity||0) * Number(np.unitPrice||0);
    return np;
  });

  const cats = ["Todos", ...expenseCategories];
  const filtered = expenses
    .filter(e => filterStatus==="all" || e.paymentStatus===filterStatus)
    .filter(e => filterCat==="Todos" || e.category===filterCat)
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const totalPaid    = expenses.filter(e=>e.paymentStatus==="paid").reduce((a,b)=>a+b.total,0);
  const totalPending = expenses.filter(e=>e.paymentStatus==="pending").reduce((a,b)=>a+b.total,0);

  const openNew  = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = e  => { setForm({...e}); setModal(e); };

  // When saving an ingredient expense, update matching ingredient costs in recipes
  const syncIngredientCosts = async (concept, unitPrice) => {
    if (!unitPrice || !concept) return 0;
    const lc = concept.toLowerCase().trim();
    const updates = [];
    setRecipes(prev => prev.map(r => {
      const hasMatch = r.ingredients.some(i => i.name.toLowerCase().includes(lc));
      if (!hasMatch) return r;
      const newIngredients = r.ingredients.map(i =>
        i.name.toLowerCase().includes(lc) ? {...i, cost: Number(unitPrice)} : i
      );
      updates.push({ id: r.id, ingredients: newIngredients });
      return {...r, ingredients: newIngredients};
    }));
    for (const { id, ingredients } of updates) {
      const { error } = await supabase.from("recipes").update({ ingredients }).eq("id", id);
      if (error) console.error("Error al sincronizar receta:", error.message);
    }
    return updates.length;
  };

  const save = async () => {
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
      setExpenses(p => [newExp, ...p]);
    } else {
      const { error } = await supabase.from("expenses").update(expenseToDb(data)).eq("id", modal.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setExpenses(p => p.map(e => e.id===modal.id ? {...e,...data} : e));
    }
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
    if (confirm("¿Eliminar gasto?")) {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setExpenses(p => p.filter(e => e.id!==id));
      showToast("Eliminado");
    }
  };

  const closeExpense = async (expense, paymentMethod) => {
    const { error } = await supabase.from("expenses").update({ payment_method: paymentMethod, payment_status:"paid" }).eq("id", expense.id);
    if (error) { showToast("Error al cerrar gasto: " + error.message, "error"); return; }
    setExpenses(p => p.map(e => e.id===expense.id ? {...e, paymentMethod, paymentStatus:"paid"} : e));
    setPayModal(null);
    showToast("Gasto cerrado ✓");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Gastos</div><div className="page-sub">{expenses.length} registrados</div></div>
        <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo gasto</button>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat stat-red"><div className="stat-num">{$(totalPaid)}</div><div className="stat-label">Total pagado</div><div className="stat-icon">💸</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(totalPending)}</div><div className="stat-label">Pendiente de pago</div><div className="stat-icon">⏳</div></div>
        <div className="stat"><div className="stat-num">{expenses.length}</div><div className="stat-label">Gastos registrados</div><div className="stat-icon">📋</div></div>
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
                <td onClick={ev=>ev.stopPropagation()} style={{ display:"flex", gap:4, alignItems:"center" }}>
                  {e.paymentStatus==="pending" && (
                    <button className="btn btn-sm btn-primary" style={{ fontSize:".76em", padding:"4px 9px" }} onClick={()=>setPayModal(e)}>
                      <Ico n="check" s={12}/>Cerrar
                    </button>
                  )}
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(e.id)}><Ico n="trash" s={13} c="var(--red)"/></button>
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
            <div className="form-group"><label className="lbl">Proveedor</label><input value={form.supplier} onChange={e=>set("supplier",e.target.value)} placeholder="Nombre del proveedor"/></div>
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
          {form.category==="Ingredientes" && form.unitPrice>0 && (
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

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
// Parse date-only strings ("2026-03-01") as local time, not UTC
const parseLocalDate = d => {
  if (!d) return new Date(0);
  if (typeof d === "string" && d.length === 10) return new Date(d + "T00:00:00");
  return new Date(d);
};

function ReportsPage({ sales, products, expenses, expenseCategories, accountPayments }) {
  const [period, setPeriod] = useState("today");

  const now = new Date();
  const cutoff = useMemo(() => {
    if (period==="today") return new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if (period==="week") return new Date(now-7*86400000);
    if (period==="month") return new Date(now.getFullYear(),now.getMonth(),1);
    return new Date(0);
  }, [period]);

  // ── Sales in period ──────────────────────────────────────────────────────────
  const pSales = sales.filter(s => new Date(s.createdAt) >= cutoff && s.status !== "cancelled");
  const closedSales = pSales.filter(s => s.status === "closed" || s.status === "delivered");

  // Cash actually received: closed sales paid directly (not account)
  const directIncome = closedSales
    .filter(s => s.paymentMethod !== "account")
    .reduce((a, b) => a + b.total, 0);

  // Account payments received in period (customer paying their debt)
  const pAccountPayments = (accountPayments || []).filter(p =>
    p.type === "payment" && p.paymentMethod && parseLocalDate(p.date) >= cutoff
  );
  const accountIncome = pAccountPayments.reduce((a, b) => a + b.amount, 0);

  // Total income = cash received directly + account debt collected
  const totalIncome = directIncome + accountIncome;

  // Outstanding account debt (all time)
  const allCharges  = (accountPayments || []).filter(p => p.type === "charge").reduce((a, b) => a + b.amount, 0);
  const allPayments = (accountPayments || []).filter(p => p.type === "payment").reduce((a, b) => a + b.amount, 0);
  const outstandingDebt = Math.max(0, allCharges - allPayments);

  // Active open orders (all time — always relevant)
  const activeOrders = sales.filter(s => ["open", "pending", "ready"].includes(s.status));
  const activeOrdersValue = activeOrders.reduce((a, b) => a + b.total, 0);

  // Pay method totals: direct sales + account payments received
  const payMethodTotals = {};
  closedSales.filter(s => s.paymentMethod !== "account").forEach(s => {
    const k = s.paymentMethod || "other";
    payMethodTotals[k] = (payMethodTotals[k] || 0) + s.total;
  });
  pAccountPayments.forEach(p => {
    const k = p.paymentMethod;
    payMethodTotals[k] = (payMethodTotals[k] || 0) + p.amount;
  });

  // ── Products ─────────────────────────────────────────────────────────────────
  const productCount = {};
  pSales.forEach(s => s.items.forEach(i => {
    productCount[i.name] = (productCount[i.name]||0)+i.qty;
  }));
  const topProducts = Object.entries(productCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxQty = topProducts[0]?.[1]||1;

  const stockAlert = products.filter(p=>p.active&&p.stock<=5).sort((a,b)=>a.stock-b.stock);

  // ── Expenses in period ───────────────────────────────────────────────────────
  const pExpenses = (expenses||[]).filter(e => parseLocalDate(e.date) >= cutoff);
  const totalExpenses   = pExpenses.filter(e=>e.paymentStatus==="paid").reduce((a,b)=>a+b.total,0);
  const pendingExpenses = pExpenses.filter(e=>e.paymentStatus==="pending").reduce((a,b)=>a+b.total,0);
  const netResult       = totalIncome - totalExpenses;
  const expByCat = {};
  pExpenses.filter(e=>e.paymentStatus==="paid").forEach(e => {
    expByCat[e.category||"Otros"] = (expByCat[e.category||"Otros"]||0) + e.total;
  });
  const maxExpCat = Math.max(...Object.values(expByCat), 1);

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Reportes</div><div className="page-sub">Análisis del negocio</div></div>
        <div style={{ display:"flex", gap:6 }}>
          {[["today","Hoy"],["week","7 días"],["month","Este mes"],["all","Todo"]].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${period===v?"btn-primary":"btn-secondary"}`} onClick={()=>setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="stats-row">
        <div className="stat stat-green"><div className="stat-num">{$(totalIncome)}</div><div className="stat-label">Cobrado en período</div><div className="stat-icon">💰</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(outstandingDebt)}</div><div className="stat-label">Deuda en cuentas</div><div className="stat-icon">⏳</div></div>
        <div className="stat"><div className="stat-num">{pSales.length}</div><div className="stat-label">Ventas en período</div><div className="stat-icon">🧾</div></div>
        <div className="stat stat-blue"><div className="stat-num">{$(activeOrdersValue)}</div><div className="stat-label">Pedidos activos ({activeOrders.length})</div><div className="stat-icon">📋</div></div>
      </div>
      <div className="stats-row" style={{ marginBottom:16 }}>
        <div className="stat stat-red"><div className="stat-num">{$(totalExpenses)}</div><div className="stat-label">Gastos pagados</div><div className="stat-icon">💸</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(pendingExpenses)}</div><div className="stat-label">Gastos pendientes</div><div className="stat-icon">📤</div></div>
        <div className="stat"><div className="stat-num">{pExpenses.length}</div><div className="stat-label">Gastos en período</div><div className="stat-icon">🧾</div></div>
        <div className={`stat ${netResult>=0?"stat-green":"stat-red"}`}>
          <div className="stat-num">{netResult<0?"-":""}{$(Math.abs(netResult))}</div>
          <div className="stat-label">Resultado neto</div>
          <div className="stat-icon">{netResult>=0?"📈":"📉"}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="section-title">Productos más vendidos</div>
          {topProducts.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin datos</div> :
            topProducts.map(([name,qty])=>(
              <div key={name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ fontSize:".82em", color:"var(--t2)", width:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                <div style={{ flex:1, height:7, background:"var(--s2)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${(qty/maxQty)*100}%`, height:"100%", background:"var(--green)", borderRadius:4 }}/>
                </div>
                <div style={{ fontSize:".82em", fontWeight:700, width:28, textAlign:"right" }}>{qty}</div>
              </div>
            ))
          }
        </div>

        <div className="card">
          <div className="section-title">Pedidos activos</div>
          {activeOrders.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin pedidos activos</div> :
            activeOrders.slice(0,8).map(s=>(
              <div key={s.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize:".86em", fontWeight:600 }}>{s.customerName}</div>
                  <div style={{ fontSize:".74em", color:"var(--t3)" }}>{fmtDate(s.createdAt)}</div>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <span className={`badge ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status]}</span>
                  <span style={{ fontWeight:700, color:"var(--green)" }}>{$(s.total)}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title">Ingresos por método de pago</div>
        {totalIncome === 0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin cobros en el período</div> :
          Object.entries(PAY_LABELS).filter(([k]) => (payMethodTotals[k]||0) > 0 || k !== "account").map(([k,v]) => {
            const amt = payMethodTotals[k]||0;
            const pct = totalIncome>0 ? Math.round(amt/totalIncome*100) : 0;
            return (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:".86em", color:"var(--t2)", width:130 }}>{v}</span>
                <div style={{ flex:1, height:7, background:"var(--s2)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:"var(--green)", borderRadius:4 }}/>
                </div>
                <span style={{ fontSize:".82em", color:"var(--t3)", width:32, textAlign:"right" }}>{pct}%</span>
                <span style={{ fontWeight:700, color:amt>0?"var(--green)":"var(--t4)", width:80, textAlign:"right" }}>{$(amt)}</span>
              </div>
            );
          })
        }
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="section-title">Gastos por categoría</div>
          {Object.keys(expByCat).length===0
            ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin gastos pagados en el período</div>
            : (expenseCategories||[]).filter(c => expByCat[c]).map(c => {
                const amt = expByCat[c]||0;
                const pct = Math.round(amt/maxExpCat*100);
                return (
                  <div key={c} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ fontSize:".82em", color:"var(--t2)", width:100, flexShrink:0 }}>{c}</div>
                    <div style={{ flex:1, height:7, background:"var(--s2)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:"var(--red)", borderRadius:4 }}/>
                    </div>
                    <div style={{ fontWeight:700, color:"var(--red)", width:72, textAlign:"right", fontSize:".82em" }}>{$(amt)}</div>
                  </div>
                );
              })
          }
        </div>

        <div className="card">
          <div className="section-title">Balance del período</div>
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Ventas cobradas directamente</span>
              <span style={{ fontWeight:600, color:"var(--green)" }}>{$(directIncome)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Cuentas corrientes cobradas</span>
              <span style={{ fontWeight:600, color:"var(--green)" }}>{$(accountIncome)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"2px solid var(--border)" }}>
              <span style={{ fontSize:".86em", color:"var(--t2)", fontWeight:700 }}>Total cobrado</span>
              <span style={{ fontWeight:800, color:"var(--green)" }}>{$(totalIncome)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Gastos pagados</span>
              <span style={{ fontWeight:600, color:"var(--red)" }}>-{$(totalExpenses)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Gastos pendientes</span>
              <span style={{ fontWeight:600, color:"var(--amber)" }}>-{$(pendingExpenses)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Deuda en cuentas corrientes</span>
              <span style={{ fontWeight:600, color:outstandingDebt>0?"var(--amber)":"var(--t3)" }}>{$(outstandingDebt)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", marginTop:8, background:netResult>=0?"var(--greenl)":"var(--redl)", borderRadius:8, border:`1px solid ${netResult>=0?"var(--greenlb)":"var(--redlb)"}` }}>
              <span style={{ fontWeight:700, fontSize:".9em" }}>Resultado neto</span>
              <span style={{ fontWeight:800, fontSize:"1.1em", color:netResult>=0?"var(--green)":"var(--red)" }}>
                {netResult<0?"-":""}{$(Math.abs(netResult))}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">⚠️ Stock bajo (≤ 5 unidades)</div>
        {stockAlert.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>✅ Todo el stock está bien</div> :
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
            {stockAlert.map(p=>(
              <div key={p.id} style={{ background:p.stock===0?"var(--redl)":"var(--amberl)", border:`1px solid ${p.stock===0?"var(--redlb)":"var(--amberlb)"}`, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontWeight:600, fontSize:".88em" }}>{p.name}</div>
                <div style={{ fontSize:".8em", color:p.stock===0?"var(--red)":"var(--amber)", fontWeight:700, marginTop:4 }}>
                  {p.stock===0?"SIN STOCK":`${p.stock} unidades`}
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({ categories, setCategories, expenseCategories, setExpenseCategories, showToast }) {
  const [newCat, setNewCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");

  const addCat = async () => {
    if (!newCat || categories.includes(newCat)) return;
    const { error } = await supabase.from("categories").insert({ name: newCat });
    if (error) { showToast("Error al agregar: " + error.message, "error"); return; }
    setCategories(p => [...p, newCat]);
    setNewCat("");
    showToast("Categoría agregada");
  };

  const delCat = async (c) => {
    const { error } = await supabase.from("categories").delete().eq("name", c);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setCategories(p => p.filter(x => x !== c));
    showToast("Categoría eliminada");
  };

  const addExpCat = async () => {
    if (!newExpCat || expenseCategories.includes(newExpCat)) return;
    const { error } = await supabase.from("expense_categories").insert({ name: newExpCat });
    if (error) { showToast("Error al agregar: " + error.message, "error"); return; }
    setExpenseCategories(p => [...p, newExpCat]);
    setNewExpCat("");
    showToast("Categoría de gasto agregada");
  };

  const delExpCat = async (c) => {
    if (expenseCategories.length <= 1) { showToast("Debe quedar al menos una categoría", "error"); return; }
    const { error } = await supabase.from("expense_categories").delete().eq("name", c);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setExpenseCategories(p => p.filter(x => x !== c));
    showToast("Categoría eliminada");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Configuración</div></div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="section-title">Categorías de productos</div>
          {categories.map(c=>(
            <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".88em" }}>{c}</span>
              {categories.length>1 && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>delCat(c)}>
                  <Ico n="x" s={12} c="var(--red)"/>
                </button>
              )}
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nueva categoría..."
              onKeyDown={e=>{ if(e.key==="Enter") addCat(); }}/>
            <button className="btn btn-primary btn-sm" disabled={!newCat||categories.includes(newCat)} onClick={addCat}>
              <Ico n="plus" s={13}/>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Categorías de gastos</div>
          {expenseCategories.map(c=>(
            <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".88em" }}>{c}</span>
              {expenseCategories.length>1 && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>delExpCat(c)}>
                  <Ico n="x" s={12} c="var(--red)"/>
                </button>
              )}
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <input value={newExpCat} onChange={e=>setNewExpCat(e.target.value)} placeholder="Nueva categoría..."
              onKeyDown={e=>{ if(e.key==="Enter") addExpCat(); }}/>
            <button className="btn btn-primary btn-sm" disabled={!newExpCat||expenseCategories.includes(newExpCat)} onClick={addExpCat}>
              <Ico n="plus" s={13}/>
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth:420 }}>
        <div className="section-title">Usuarios del sistema</div>
        {[{name:"Administrador",role:"admin",pass:"noImporta"},{name:"Vendedor",role:"vendor",pass:"000comida"}].map(u=>(
          <div key={u.role} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight:600, fontSize:".88em" }}>{u.name}</div>
              <div style={{ fontSize:".74em", color:"var(--t3)" }}>Contraseña: {u.pass}</div>
            </div>
            <span className="tag" style={{ textTransform:"capitalize" }}>{u.role}</span>
          </div>
        ))}
        <p style={{ fontSize:".78em", color:"var(--t3)", marginTop:10 }}>Para cambiar contraseñas, editá el archivo src/shared.jsx</p>
      </div>
    </div>
  );
}
