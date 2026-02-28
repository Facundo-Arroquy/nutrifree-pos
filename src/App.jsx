import { useState, useEffect, useRef, useMemo } from "react";
import {
  CSS, Ico, Toast, Modal, LoginPage,
  uid, $, fmtDate, fmtTime, fmtDT, todayStr,
  STATUS_LABELS, STATUS_COLORS, PAY_LABELS,
  SEED_PRODUCTS, SEED_CUSTOMERS, SEED_RECIPES, SEED_SALES, SEED_CATEGORIES
} from "./shared.jsx";

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("pos");
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [customers, setCustomers] = useState(SEED_CUSTOMERS);
  const [sales, setSales] = useState(SEED_SALES);
  const [recipes, setRecipes] = useState(SEED_RECIPES);
  const [categories, setCategories] = useState(SEED_CATEGORIES);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const d = localStorage.getItem("nutrifree_pos_v1");
      if (d) {
        const p = JSON.parse(d);
        if (p.products) setProducts(p.products);
        if (p.customers) setCustomers(p.customers);
        if (p.sales) setSales(p.sales);
        if (p.recipes) setRecipes(p.recipes);
        if (p.categories) setCategories(p.categories);
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("nutrifree_pos_v1", JSON.stringify({ products, customers, sales, recipes, categories }));
    } catch(e) {}
  }, [products, customers, sales, recipes, categories]);

  const showToast = (msg, type="success") => setToast({ msg, type });

  if (!user) return (
    <>
      <style>{CSS}</style>
      <LoginPage onLogin={u => { setUser(u); setPage("pos"); }} />
    </>
  );

  const nav = [
    { id:"pos", label:"Caja / POS", icon:"pos", roles:["admin","vendor"] },
    { id:"orders", label:"Pedidos", icon:"orders", roles:["admin","vendor"] },
    { id:"customers", label:"Clientes", icon:"customers", roles:["admin","vendor"] },
    { id:"products", label:"Productos", icon:"products", roles:["admin","vendor"] },
    { id:"production", label:"Producción", icon:"production", roles:["admin"] },
    { id:"recipes", label:"Recetas", icon:"recipes", roles:["admin","vendor"] },
    { id:"reports", label:"Reportes", icon:"reports", roles:["admin"] },
    { id:"settings", label:"Configuración", icon:"settings", roles:["admin"] },
  ].filter(n => n.roles.includes(user.role));

  const props = { user, products, setProducts, customers, setCustomers, sales, setSales, recipes, setRecipes, categories, setCategories, showToast, setPage };

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
            {nav.slice(0,4).map(n => (
              <button key={n.id} className={`ni${page===n.id?" active":""}`} onClick={() => setPage(n.id)}>
                <Ico n={n.icon} s={15}/>{n.label}
              </button>
            ))}
            {user.role === "admin" && <>
              <div className="sb-section">Administración</div>
              {nav.slice(4).map(n => (
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
function POSPage({ products, setProducts, customers, setCustomers, sales, setSales, showToast }) {
  const [cart, setCart] = useState([]);
  const [priceList, setPriceList] = useState("retail");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Todos");
  const [payModal, setPayModal] = useState(false);
  const [custModal, setCustModal] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [orderNotes, setOrderNotes] = useState("");

  const categories = ["Todos", ...new Set(products.map(p => p.category))];
  const filtered = products.filter(p => p.active &&
    (filterCat==="Todos" || p.category===filterCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (prod) => {
    if (prod.stock <= 0) { showToast("Sin stock disponible", "error"); return; }
    setCart(prev => {
      const ex = prev.find(i => i.productId === prod.id);
      if (ex) {
        if (ex.qty >= prod.stock) { showToast("Stock insuficiente", "error"); return prev; }
        return prev.map(i => i.productId===prod.id ? {...i, qty:i.qty+1, subtotal:(i.qty+1)*i.price} : i);
      }
      const price = priceList==="retail" ? prod.priceRetail : prod.priceWholesale;
      return [...prev, { productId:prod.id, name:prod.name, qty:1, price, subtotal:price }];
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

  const subtotal = cart.reduce((a,b) => a+b.subtotal, 0);
  const total = subtotal;

  const clearCart = () => { setCart([]); setSelectedCustomer(null); setOrderNotes(""); setPriceList("retail"); };

  const completeSale = (status="closed") => {
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
    };
    // deduct stock
    setProducts(prev => prev.map(p => {
      const ci = cart.find(i => i.productId === p.id);
      if (!ci) return p;
      return {...p, stock: Math.max(0, p.stock - ci.qty)};
    }));
    // charge to account if selected
    if (payMethod === "account" && selectedCustomer) {
      setCustomers(prev => prev.map(c => c.id===selectedCustomer.id ? {...c, balance:c.balance-total} : c));
    }
    setSales(prev => [sale, ...prev]);
    setPayModal(false);
    clearCart();
    showToast(status==="closed" ? "Venta registrada ✓" : "Pedido guardado ✓");
  };

  // recalc prices when list changes
  useEffect(() => {
    setCart(prev => prev.map(i => {
      const prod = products.find(p => p.id === i.productId);
      if (!prod) return i;
      const price = priceList==="retail" ? prod.priceRetail : prod.priceWholesale;
      return {...i, price, subtotal:i.qty*price};
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
            return (
              <div key={p.id} className={`prod-card${p.stock<=0?" inactive":""}`} onClick={()=>addToCart(p)}>
                <div className="prod-card-name">{p.name}</div>
                <div className="prod-card-cat">{p.category}</div>
                <div className="prod-card-price">{$(price)}</div>
                <div className="prod-card-stock">Stock: {p.stock}</div>
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
                <div className="cart-item-sub">{$(item.price)} c/u</div>
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
          <div className="tot-row total"><span>TOTAL</span><span style={{color:"var(--green)"}}>{$(total)}</span></div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button className="btn btn-secondary" style={{ flex:1 }} disabled={cart.length===0}
              onClick={() => completeSale("open")}>
              <Ico n="clock" s={14}/>Pedido abierto
            </button>
            <button className="btn btn-primary" style={{ flex:1 }} disabled={cart.length===0}
              onClick={()=>setPayModal(true)}>
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
              onClick={()=>{ setSelectedCustomer(c); setPriceList(c.priceList); setCustModal(false); }}>
              <Ico n="user" s={14}/>
              <div>
                <div>{c.name}</div>
                <div style={{ fontSize:".74em", color:"var(--t3)" }}>
                  Saldo: <span className={c.balance>0?"balance-pos":c.balance<0?"balance-neg":"balance-zero"}>{$(c.balance)}</span>
                </div>
              </div>
            </button>
          ))}
        </Modal>
      )}

      {/* PAYMENT MODAL */}
      {payModal && (
        <Modal title="Completar venta" onClose={()=>setPayModal(false)}>
          <div className="tot-row" style={{ fontSize:"1.1em", marginBottom:16 }}>
            <span style={{ fontWeight:700 }}>Total a cobrar:</span>
            <span style={{ fontWeight:800, color:"var(--green)", fontSize:"1.3em" }}>{$(total)}</span>
          </div>
          {selectedCustomer && (
            <div style={{ background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:".84em" }}>
              Cliente: <strong>{selectedCustomer.name}</strong> · Saldo actual: <span className={selectedCustomer.balance>=0?"balance-pos":"balance-neg"}>{$(selectedCustomer.balance)}</span>
            </div>
          )}
          <div className="section-title">Método de pago</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {Object.entries(PAY_LABELS).map(([k,v]) => (
              (!k.includes("account") || selectedCustomer) && (
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
            <button className="btn btn-primary btn-lg" onClick={()=>completeSale("closed")}>
              <Ico n="check" s={16}/>Confirmar venta
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ORDERS PAGE ──────────────────────────────────────────────────────────────
function OrdersPage({ sales, setSales, products, setProducts, customers, showToast }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const statuses = ["all","open","pending","ready","delivered","closed","cancelled"];
  const filtered = sales.filter(s => filter==="all" || s.status===filter)
    .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));

  const changeStatus = (id, status) => {
    setSales(prev => prev.map(s => s.id===id ? {...s,status} : s));
    if (selected?.id===id) setSelected(prev => ({...prev,status}));
    showToast("Estado actualizado");
  };

  const cancelOrder = (sale) => {
    // restore stock
    setProducts(prev => prev.map(p => {
      const ci = sale.items.find(i => i.productId===p.id);
      if (!ci) return p;
      return {...p, stock:p.stock+ci.qty};
    }));
    setSales(prev => prev.map(s => s.id===sale.id ? {...s,status:"cancelled"} : s));
    if (selected?.id===sale.id) setSelected(prev=>({...prev,status:"cancelled"}));
    showToast("Pedido cancelado");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Pedidos</div><div className="page-sub">{filtered.length} registros</div></div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {statuses.map(s => (
          <button key={s} className={`btn btn-sm ${filter===s?"btn-primary":"btn-secondary"}`}
            onClick={()=>setFilter(s)}>
            {s==="all"?"Todos":STATUS_LABELS[s]}
          </button>
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
                <td><span className={`badge ${STATUS_COLORS[s.status]||"badge-gray"}`}>{STATUS_LABELS[s.status]||s.status}</span></td>
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
            <div><label className="lbl">Pago</label><div style={{ marginTop:4 }}>{PAY_LABELS[selected.paymentMethod]||selected.paymentMethod}</div></div>
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
              {selected.status==="open" && <button className="btn btn-amber" onClick={()=>changeStatus(selected.id,"pending")}><Ico n="clock" s={13}/>Pend. pago</button>}
              {(selected.status==="open"||selected.status==="pending") && <button className="btn btn-blue" onClick={()=>changeStatus(selected.id,"ready")}><Ico n="box" s={13}/>Listo</button>}
              {selected.status==="ready" && <button className="btn btn-primary" onClick={()=>changeStatus(selected.id,"delivered")}><Ico n="check" s={13}/>Entregado</button>}
              <button className="btn btn-secondary" onClick={()=>changeStatus(selected.id,"closed")}><Ico n="check" s={13}/>Cerrar</button>
              <button className="btn btn-danger" onClick={()=>cancelOrder(selected)}><Ico n="x" s={13}/>Cancelar</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── CUSTOMERS PAGE ───────────────────────────────────────────────────────────
function CustomersPage({ customers, setCustomers, sales, showToast }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | customer
  const [form, setForm] = useState({ name:"", phone:"", address:"", notes:"", priceList:"retail", balance:0 });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const filtered = customers.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));

  const openNew = () => { setForm({ name:"", phone:"", address:"", notes:"", priceList:"retail", balance:0 }); setModal("new"); };
  const openEdit = c => { setForm({...c}); setModal(c); };

  const save = () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    if (modal==="new") {
      setCustomers(p => [...p, {...form, id:uid(), balance:Number(form.balance)||0}]);
    } else {
      setCustomers(p => p.map(c => c.id===modal.id ? {...c,...form, balance:Number(form.balance)||0} : c));
    }
    setModal(null);
    showToast("Cliente guardado");
  };

  const del = id => { if (confirm("¿Eliminar cliente?")) { setCustomers(p=>p.filter(c=>c.id!==id)); showToast("Eliminado"); } };

  const adjustBalance = (id, amount) => {
    setCustomers(p => p.map(c => c.id===id ? {...c, balance:c.balance+Number(amount)} : c));
    showToast("Saldo actualizado");
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
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Lista</th><th>Saldo</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            {filtered.map(c => {
              const custSales = sales.filter(s=>s.customerId===c.id).length;
              return (
                <tr key={c.id} className="tr-click" onClick={()=>openEdit(c)}>
                  <td><div style={{ fontWeight:600 }}>{c.name}</div><div style={{ fontSize:".76em", color:"var(--t3)" }}>{custSales} compra{custSales!==1?"s":""}</div></td>
                  <td style={{ color:"var(--t2)" }}>{c.phone||"—"}</td>
                  <td><span className={`badge ${c.priceList==="wholesale"?"badge-blue":"badge-green"}`}>{c.priceList==="wholesale"?"Mayorista":"Minorista"}</span></td>
                  <td><span className={c.balance>0?"balance-pos":c.balance<0?"balance-neg":"balance-zero"}>{$(c.balance)}</span></td>
                  <td style={{ color:"var(--t3)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.notes||"—"}</td>
                  <td>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={e=>{e.stopPropagation();del(c.id);}}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={6}><div className="empty"><div className="empty-icon">👥</div><h3>Sin clientes</h3></div></td></tr>}
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
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
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
  const emptyForm = { name:"", category:"Viandas", priceRetail:0, priceWholesale:0, unit:"unit", stock:0, active:true, description:"" };
  const [form, setForm] = useState(emptyForm);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const cats = ["Todos", ...categories];
  const filtered = products.filter(p =>
    (filterCat==="Todos"||p.category===filterCat) &&
    (!search||p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = p => { setForm({...p}); setModal(p); };

  const save = () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    if (modal==="new") {
      setProducts(p => [...p, {...form, id:uid(), priceRetail:Number(form.priceRetail), priceWholesale:Number(form.priceWholesale), stock:Number(form.stock)}]);
    } else {
      setProducts(p => p.map(x => x.id===modal.id ? {...x,...form, priceRetail:Number(form.priceRetail), priceWholesale:Number(form.priceWholesale), stock:Number(form.stock)} : x));
    }
    setModal(null);
    showToast("Producto guardado");
  };

  const del = id => { if (confirm("¿Eliminar producto?")) { setProducts(p=>p.filter(x=>x.id!==id)); showToast("Eliminado"); } };

  const toggleActive = id => setProducts(p => p.map(x => x.id===id ? {...x,active:!x.active} : x));

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
                <td><div style={{ fontWeight:600 }}>{p.name}</div>{p.description&&<div style={{ fontSize:".74em", color:"var(--t3)" }}>{p.description}</div>}</td>
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
function ProductionPage({ products, setProducts, showToast }) {
  const [qty, setQty] = useState({});

  const setQ = (id,v) => setQty(p=>({...p,[id]:v}));

  const applyProduction = (id) => {
    const q = Number(qty[id]);
    if (!q || q<=0) { showToast("Ingresá una cantidad válida", "error"); return; }
    setProducts(p => p.map(x => x.id===id ? {...x, stock:x.stock+q} : x));
    setQty(p=>({...p,[id]:""}));
    showToast(`+${q} unidades registradas`);
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
function RecipesPage({ recipes, setRecipes, products, showToast }) {
  const [modal, setModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [form, setForm] = useState({ productId:"", prepTime:0, cookTime:0, yield:1, notes:"", ingredients:[], steps:[] });
  const [newIngr, setNewIngr] = useState({ name:"", qty:"", unit:"g", cost:"" });
  const [newStep, setNewStep] = useState("");
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const totalCost = (ingrs) => ingrs.reduce((a,b)=>a+Number(b.cost),0);
  const costPerUnit = (r) => r.yield>0 ? totalCost(r.ingredients)/r.yield : 0;

  const openNew = () => { setForm({ productId:products[0]?.id||"", prepTime:0, cookTime:0, yield:1, notes:"", ingredients:[], steps:[] }); setModal("new"); };
  const openEdit = r => { setForm({...r, ingredients:[...r.ingredients], steps:[...r.steps]}); setModal(r); };

  const addIngr = () => {
    if (!newIngr.name) return;
    setForm(p=>({...p, ingredients:[...p.ingredients, {...newIngr, qty:Number(newIngr.qty), cost:Number(newIngr.cost)}]}));
    setNewIngr({ name:"", qty:"", unit:"g", cost:"" });
  };
  const removeIngr = i => setForm(p=>({...p,ingredients:p.ingredients.filter((_,idx)=>idx!==i)}));
  const addStep = () => { if (!newStep) return; setForm(p=>({...p,steps:[...p.steps,newStep]})); setNewStep(""); };
  const removeStep = i => setForm(p=>({...p,steps:p.steps.filter((_,idx)=>idx!==i)}));

  const save = () => {
    if (!form.productId) { showToast("Seleccioná un producto", "error"); return; }
    if (modal==="new") setRecipes(p=>[...p,{...form,id:uid()}]);
    else setRecipes(p=>p.map(r=>r.id===modal.id?{...r,...form}:r));
    setModal(null);
    showToast("Receta guardada");
  };

  const del = id => { if(confirm("¿Eliminar receta?")){ setRecipes(p=>p.filter(r=>r.id!==id)); showToast("Eliminada"); }};

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
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>{i.unit}</td><td>{$(i.cost)}</td></tr>
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
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr auto", gap:6, marginBottom:16 }}>
            <input placeholder="Ingrediente" value={newIngr.name} onChange={e=>setNewIngr(p=>({...p,name:e.target.value}))}/>
            <input placeholder="Cant." type="number" value={newIngr.qty} onChange={e=>setNewIngr(p=>({...p,qty:e.target.value}))}/>
            <select value={newIngr.unit} onChange={e=>setNewIngr(p=>({...p,unit:e.target.value}))}>
              {["g","kg","ml","l","unidad","unidades","cdas","ctas"].map(u=><option key={u}>{u}</option>)}
            </select>
            <input placeholder="Costo $" type="number" value={newIngr.cost} onChange={e=>setNewIngr(p=>({...p,cost:e.target.value}))}/>
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

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
function ReportsPage({ sales, products }) {
  const [period, setPeriod] = useState("today");

  const now = new Date();
  const cutoff = useMemo(() => {
    if (period==="today") return new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if (period==="week") return new Date(now-7*86400000);
    if (period==="month") return new Date(now.getFullYear(),now.getMonth(),1);
    return new Date(0);
  }, [period]);

  const pSales = sales.filter(s => new Date(s.createdAt)>=cutoff && s.status!=="cancelled");
  const totalIncome = pSales.filter(s=>s.status==="closed"||s.status==="delivered").reduce((a,b)=>a+b.total,0);
  const pending = sales.filter(s=>["open","pending","ready"].includes(s.status));
  const pendingValue = pending.reduce((a,b)=>a+b.total,0);

  const productCount = {};
  pSales.forEach(s => s.items.forEach(i => {
    productCount[i.name] = (productCount[i.name]||0)+i.qty;
  }));
  const topProducts = Object.entries(productCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxQty = topProducts[0]?.[1]||1;

  const stockAlert = products.filter(p=>p.active&&p.stock<=5).sort((a,b)=>a.stock-b.stock);

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
        <div className="stat stat-green"><div className="stat-num">{$(totalIncome)}</div><div className="stat-label">Ingresos cobrados</div><div className="stat-icon">💰</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(pendingValue)}</div><div className="stat-label">Pendiente de cobro</div><div className="stat-icon">⏳</div></div>
        <div className="stat"><div className="stat-num">{pSales.length}</div><div className="stat-label">Ventas en período</div><div className="stat-icon">🧾</div></div>
        <div className="stat stat-blue"><div className="stat-num">{pending.length}</div><div className="stat-label">Pedidos activos</div><div className="stat-icon">📋</div></div>
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
          {pending.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin pedidos activos</div> :
            pending.slice(0,8).map(s=>(
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
function SettingsPage({ categories, setCategories, showToast }) {
  const [newCat, setNewCat] = useState("");

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Configuración</div></div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="section-title">Categorías de productos</div>
          {categories.map(c=>(
            <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".88em" }}>{c}</span>
              {categories.length>1 && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>{setCategories(p=>p.filter(x=>x!==c));showToast("Categoría eliminada");}}>
                  <Ico n="x" s={12} c="var(--red)"/>
                </button>
              )}
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nueva categoría..."
              onKeyDown={e=>{if(e.key==="Enter"&&newCat){setCategories(p=>[...p,newCat]);setNewCat("");showToast("Categoría agregada");}}}/>
            <button className="btn btn-primary btn-sm" disabled={!newCat||categories.includes(newCat)}
              onClick={()=>{setCategories(p=>[...p,newCat]);setNewCat("");showToast("Categoría agregada");}}>
              <Ico n="plus" s={13}/>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Usuarios del sistema</div>
          {[{name:"Administrador",role:"admin",pass:"admin123"},{name:"Vendedor",role:"vendor",pass:"1234"}].map(u=>(
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
    </div>
  );
}
