/**
 * App.jsx — Componente raíz de la aplicación
 *
 * Responsabilidades:
 *  1. Carga inicial de todos los datos desde Supabase (14 tablas en paralelo)
 *  2. Estado global compartido con todas las páginas vía objeto `props`
 *  3. Lógica de autenticación: login, logout, modo demo
 *  4. Routing client-side mediante estado `page`
 *  5. Alertas de entrega al login (según ventana de horario configurable)
 *  6. Sidebar dinámico filtrado por rol del usuario
 */
import { useState, useEffect, useMemo, useRef } from "react";
import {
  CSS, Ico, Toast, LoginPage,
  SEED_PRODUCTS, SEED_CUSTOMERS, SEED_SALES, SEED_CATEGORIES,
  $, STATUS_LABELS, STATUS_COLORS, todayStr,
} from "./shared.jsx";
import { initDemoDb, resetDemoDb } from "./demoData.js";
import {
  supabase,
  dbToProduct, productToDb,
  dbToCustomer, customerToDb,
  dbToSale,
  dbToRecipe,
  dbToExpense,
  dbToIngredient,
  dbToAccountPayment,
  dbToStockMovement,
  dbToRecipeIngredient,
  dbToSupplier,
  dbToSupplierPayment,
  dbToCashShift,
} from "./supabase.js";

import DashboardPage from "./pages/DashboardPage.jsx";
import POSPage from "./pages/POSPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import CustomersPage from "./pages/CustomersPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import ProductionPage from "./pages/ProductionPage.jsx";
import RecipesPage from "./pages/RecipesPage.jsx";
import IngredientsPage from "./pages/IngredientsPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import SuppliersPage from "./pages/SuppliersPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import CashShiftPage from "./pages/CashShiftPage.jsx";
import ImportPage from "./pages/ImportPage.jsx";

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
const sessionToUser = (session) => {
  const email = session.user.email || "";
  // El prefijo del email determina el rol: admin@... → admin, cualquier otro → vendor
  const role = email.toLowerCase().startsWith("admin") ? "admin" : "vendor";
  const name = session.user.user_metadata?.name || email.split("@")[0] || "Usuario";
  return { name, role, email, isDemo: false };
};

function AccessDenied() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-icon" style={{ opacity:1 }}>🔒</div>
        <h3>Acceso denegado</h3>
        <p>No tenés permiso para ver esta sección.</p>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState(["Ingredientes","Servicios","Envases","Limpieza","Otros"]);
  const [expenses, setExpenses] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [accountPayments, setAccountPayments] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [cashShifts, setCashShifts] = useState([]);
  const [toast, setToast] = useState(null);
  const [deliveryAlerts, setDeliveryAlerts] = useState([]);
  const [showMenuReminder, setShowMenuReminder] = useState(false);
  const [menuLunchId, setMenuLunchId] = useState("");
  const [menuDinnerId, setMenuDinnerId] = useState("");
  const [menuSearch, setMenuSearch] = useState({ lunch: "", dinner: "" });
  const [reminderStart, setReminderStart] = useState(() => localStorage.getItem("reminderStart") || "10:00");
  const [reminderEnd,   setReminderEnd]   = useState(() => localStorage.getItem("reminderEnd")   || "11:00");
  const alertsChecked = useRef(false);
  const deliveryChecked = useRef(false);

  // ─── Supabase Auth: restaurar sesión y escuchar cambios ───────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(sessionToUser(session));
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setUser(sessionToUser(session));
      else setUser(prev => (prev?.isDemo ? prev : null));
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user.isDemo) return;
    const load = async () => {
      const [{ data: cats }, { data: expCats }, { data: prods }, { data: custs }, { data: sls }, { data: recs }, { data: exps }, { data: ingrs }, { data: accPays, error: accPaysErr }, { data: stockMovs }, { data: recIngrs }, { data: supps }, { data: suppPays }, { data: shifts }] = await Promise.all([
        supabase.from("categories").select("*"),
        supabase.from("expense_categories").select("*").order("name"),
        supabase.from("products").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("sales").select("*").order("created_at", { ascending: false }),
        supabase.from("recipes").select("*"),
        supabase.from("expenses").select("*").order("created_at", { ascending: false }),
        supabase.from("ingredients").select("*").order("name"),
        supabase.from("account_payments").select("*").order("created_at", { ascending: false }),
        supabase.from("stock_movements").select("*").order("created_at", { ascending: false }),
        supabase.from("recipe_ingredients").select("*"),
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("supplier_payments").select("*").order("created_at", { ascending: false }),
        supabase.from("cash_shifts").select("*").order("created_at", { ascending: false }),
      ]);
      if (accPaysErr) console.error("[account_payments] Error al cargar:", accPaysErr);
      if (cats && cats.length > 0) setCategories(cats.map(c => c.name));
      if (expCats && expCats.length > 0) setExpenseCategories(expCats.map(c => c.name));
      if (prods && prods.length > 0) setProducts(prods.map(dbToProduct));
      if (custs && custs.length > 0) setCustomers(custs.map(dbToCustomer));
      if (sls && sls.length > 0) setSales(sls.map(dbToSale));
      if (exps && exps.length > 0) setExpenses(exps.map(dbToExpense));
      if (ingrs && ingrs.length > 0) setIngredients(ingrs.map(dbToIngredient));
      if (recs && recs.length > 0) {
        const ingredientsCatalog = ingrs || [];
        setRecipes(recs.map(r => ({
          ...dbToRecipe(r),
          ingredients: (recIngrs || [])
            .filter(ri => ri.recipe_id === r.id)
            .map(ri => dbToRecipeIngredient(ri, ingredientsCatalog)),
        })));
      }
      if (accPays && accPays.length > 0) setAccountPayments(accPays.map(dbToAccountPayment));
      if (stockMovs && stockMovs.length > 0) setStockMovements(stockMovs.map(dbToStockMovement));
      if (supps && supps.length > 0) setSuppliers(supps.map(dbToSupplier));
      if (suppPays && suppPays.length > 0) setSupplierPayments(suppPays.map(dbToSupplierPayment));
      if (shifts && shifts.length > 0) setCashShifts(shifts.map(dbToCashShift));
    };
    load();
  }, [user?.email]);

  /** Muestra una notificación temporal. type: "success" | "error" */
  const showToast = (msg, type="success") => setToast({ msg, type });

  // ─── Auditoría ─────────────────────────────────────────────────────────────
  const logAction = async (action, entity, detail = "") => {
    if (user?.isDemo) return;
    try {
      await supabase.from("audit_log").insert({
        id: crypto.randomUUID(),
        user_email: user?.email || "desconocido",
        action,
        entity,
        detail,
        created_at: new Date().toISOString(),
      });
    } catch (_) { /* fallo silencioso */ }
  };

  // ─── Route guards ──────────────────────────────────────────────────────────
  const PAGE_ROLES = { reports: ["admin"], import: ["admin"] };
  const canAccess = (pageId) => {
    if (user?.isDemo) return true;
    const allowed = PAGE_ROLES[pageId] || ["admin", "vendor"];
    return allowed.includes(user?.role);
  };

  // ─── Alertas de entrega para usuarios reales (luego de cargar ventas) ──────
  useEffect(() => {
    if (!user || user.isDemo || alertsChecked.current) return;
    alertsChecked.current = true;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = reminderStart.split(":").map(Number);
    const [eh, em] = reminderEnd.split(":").map(Number);
    if (cur < sh * 60 + sm || cur >= eh * 60 + em) return;
    const today = todayStr();
    if (localStorage.getItem("menuSavedDate") !== today) {
      setShowMenuReminder(true);
      setMenuLunchId(localStorage.getItem("menuLunchId_" + today) || "");
      setMenuDinnerId(localStorage.getItem("menuDinnerId_" + today) || "");
      setMenuSearch({ lunch: "", dinner: "" });
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.isDemo || deliveryChecked.current || sales.length === 0) return;
    deliveryChecked.current = true;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = reminderStart.split(":").map(Number);
    const [eh, em] = reminderEnd.split(":").map(Number);
    if (cur < sh * 60 + sm || cur >= eh * 60 + em) return;
    const today = todayStr();
    const alerts = sales.filter(s =>
      ["open","pending","confirmed","ready"].includes(s.status) && s.deliveryDate === today
    );
    if (alerts.length > 0) setDeliveryAlerts(alerts);
  }, [user, sales]);

  const MENU_PRODUCT_NAME = "Almuerzo y Cena del día";

  const saveMenu = async () => {
    if (!menuLunchId || !menuDinnerId) { showToast("Seleccioná el almuerzo y la cena", "error"); return; }
    const kitItems = [{ productId: menuLunchId, qty: 1 }, { productId: menuDinnerId, qty: 1 }];
    const lunchProd  = products.find(p => p.id === menuLunchId);
    const dinnerProd = products.find(p => p.id === menuDinnerId);
    const description = `Almuerzo: ${lunchProd.name} | Cena: ${dinnerProd.name}`;
    const existing = products.find(p => p.name === MENU_PRODUCT_NAME);

    if (existing) {
      const { error } = await supabase.from("products")
        .update({ kit_items: kitItems, description })
        .eq("id", existing.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setProducts(ps => ps.map(p => p.id === existing.id ? { ...p, kitItems, description } : p));
    } else {
      const newProd = {
        id: crypto.randomUUID(), name: MENU_PRODUCT_NAME,
        category: categories[0] || "", priceRetail: 0, priceWholesale: 0,
        unit: "unidad", stock: 0, active: true, photo: null, description, kitItems,
      };
      const { error } = await supabase.from("products").insert(productToDb(newProd));
      if (error) { showToast("Error al crear producto: " + error.message, "error"); return; }
      setProducts(ps => [...ps, newProd]);
    }

    const today = todayStr();
    localStorage.setItem("menuSavedDate", today);
    localStorage.setItem("menuLunchId_" + today, menuLunchId);
    localStorage.setItem("menuDinnerId_" + today, menuDinnerId);
    setShowMenuReminder(false);
    showToast("Menú del día guardado ✓");
  };

  const marginAlertCount = useMemo(() => {
    return products.filter(p => {
      if (!p.active) return false;
      const recipe = recipes.find(r => r.productId === p.id);
      if (!recipe || recipe.minMargin == null || recipe.minMargin === "") return false;
      const recipeCost = (recipe.ingredients || []).reduce((s, i) => s + (i.cost || 0), 0);
      const costPerUnit = recipeCost / Math.max(recipe.yield || 1, 1);
      const price = p.priceRetail || 0;
      if (price <= 0) return false;
      return ((price - costPerUnit) / price) * 100 < Number(recipe.minMargin);
    }).length;
  }, [products, recipes]);

  if (authLoading) return (
    <>
      <style>{CSS}</style>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"var(--s1)" }}>
        <div style={{ textAlign:"center", color:"var(--t3)" }}>
          <div style={{ fontSize:"2em", marginBottom:12 }}>🌿</div>
          <div style={{ fontSize:".9em" }}>Cargando...</div>
        </div>
      </div>
    </>
  );

  if (!user) return (
    <>
      <style>{CSS}</style>
      <LoginPage onLogin={u => {
        // onLogin solo se llama para modo demo. Los usuarios reales son manejados
        // por onAuthStateChange (supabase.auth.signInWithPassword en LoginPage).
        if (u.isDemo) {
          initDemoDb(false);
          localStorage.setItem("nutrifree_mode", "demo");
          const get = (k) => { try { return JSON.parse(localStorage.getItem("nutrifree_demo_" + k) || "[]"); } catch { return []; } };
          const dProds  = get("products");   const dCusts = get("customers");
          const dSls    = get("sales");       const dCats  = get("categories");
          const dExpCats= get("expense_categories"); const dExps = get("expenses");
          const dIngrs  = get("ingredients"); const dRecs  = get("recipes");
          const dRecIngrs = get("recipe_ingredients");
          const dAccPays  = get("account_payments");
          const dStockMovs= get("stock_movements");
          const dSupps    = get("suppliers");
          const dSuppPays = get("supplier_payments");
          const dShifts   = get("cash_shifts");
          setProducts(dProds.map(dbToProduct));
          setCustomers(dCusts.map(dbToCustomer));
          setSales(dSls.map(dbToSale));
          setCategories(dCats.map(c => c.name));
          setExpenseCategories(dExpCats.map(c => c.name));
          setExpenses(dExps.map(dbToExpense));
          setIngredients(dIngrs.map(dbToIngredient));
          setRecipes(dRecs.map(r => ({
            ...dbToRecipe(r),
            ingredients: dRecIngrs
              .filter(ri => ri.recipe_id === r.id)
              .map(ri => dbToRecipeIngredient(ri, dIngrs)),
          })));
          setAccountPayments(dAccPays.map(dbToAccountPayment));
          setStockMovements(dStockMovs.map(dbToStockMovement));
          setSuppliers(dSupps.map(dbToSupplier));
          setSupplierPayments(dSuppPays.map(dbToSupplierPayment));
          setCashShifts(dShifts.map(dbToCashShift));
          // Alertas de entrega para modo demo
          const now = new Date();
          const cur = now.getHours() * 60 + now.getMinutes();
          const [sh, sm] = reminderStart.split(":").map(Number);
          const [eh, em] = reminderEnd.split(":").map(Number);
          if (cur >= sh * 60 + sm && cur < eh * 60 + em) {
            const today = todayStr();
            if (localStorage.getItem("menuSavedDate") !== today) {
              setShowMenuReminder(true);
              setMenuLunchId(localStorage.getItem("menuLunchId_" + today) || "");
              setMenuDinnerId(localStorage.getItem("menuDinnerId_" + today) || "");
              setMenuSearch({ lunch: "", dinner: "" });
            }
          }
        }
        setUser(u);
        setPage("dashboard");
      }} />
    </>
  );

  const nav = [
    { id:"dashboard",   label:"Dashboard",      icon:"dashboard",   roles:["admin","vendor"], section:"top" },
    { id:"pos",         label:"Caja / POS",      icon:"pos",         roles:["admin","vendor"], section:"ventas" },
    { id:"orders",      label:"Pedidos",         icon:"orders",      roles:["admin","vendor"], section:"ventas" },
    { id:"customers",   label:"Clientes",        icon:"customers",   roles:["admin","vendor"], section:"ventas" },
    { id:"products",    label:"Productos",       icon:"products",    roles:["admin","vendor"], section:"productos" },
    { id:"recipes",     label:"Recetas",         icon:"recipes",     roles:["admin","vendor"], section:"productos" },
    { id:"ingredients", label:"Ingredientes",    icon:"ingredients", roles:["admin","vendor"], section:"productos" },
    { id:"production",  label:"Producción",      icon:"production",  roles:["admin","vendor"], section:"productos" },
    { id:"cash",        label:"Cierre de Caja",  icon:"cash",        roles:["admin","vendor"], section:"finanzas" },
    { id:"expenses",    label:"Gastos",          icon:"expenses",    roles:["admin","vendor"], section:"finanzas" },
    { id:"suppliers",   label:"Proveedores",     icon:"suppliers",   roles:["admin","vendor"], section:"finanzas" },
    { id:"import",      label:"Importar datos",  icon:"upload",      roles:["admin"],          section:"bottom" },
    { id:"reports",     label:"Reportes",        icon:"reports",     roles:["admin"],          section:"bottom" },
    { id:"settings",    label:"Configuración",   icon:"settings",    roles:["admin","vendor"], section:"bottom" },
  ].filter(n => user.isDemo || n.roles.includes(user.role));
  const sidebarSections = [
    { label: null,        key: "top" },
    { label: "Ventas",    key: "ventas" },
    { label: "Productos", key: "productos" },
    { label: "Finanzas",  key: "finanzas" },
    { label: null,        key: "bottom" },
  ];

  /** Restaura los datos demo a su estado original y recarga la aplicación. */
  const resetDemo = () => {
    resetDemoDb();
    window.location.reload();
  };

  const props = { user, products, setProducts, customers, setCustomers, sales, setSales, recipes, setRecipes, categories, setCategories, expenseCategories, setExpenseCategories, expenses, setExpenses, ingredients, setIngredients, accountPayments, setAccountPayments, stockMovements, setStockMovements, suppliers, setSuppliers, supplierPayments, setSupplierPayments, cashShifts, setCashShifts, showToast, setPage, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo, logAction };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sb-logo">
            <h1><img src="/logo.jpg" alt="Nutrifree" style={{ height:28, verticalAlign:"middle", marginRight:7, borderRadius:6 }}/>Nutrifree Manager</h1>
            <p>Sistema de gestión</p>
          </div>
          <nav className="sb-nav">
            {sidebarSections.map(sec => {
              const items = nav.filter(n => n.section === sec.key);
              if (!items.length) return null;
              return (
                <div key={sec.key}>
                  {sec.label && <div className="sb-section">{sec.label}</div>}
                  {items.map(n => (
                    <button key={n.id} className={`ni${page===n.id?" active":""}`} onClick={() => {
                      if (n.id === "reports") logAction("view", "reports", "Acceso a reportes");
                      setPage(n.id);
                    }}>
                      <Ico n={n.icon} s={15}/>{n.label}
                      {n.id === "reports" && marginAlertCount > 0 && (
                        <span style={{ marginLeft:"auto", background:"var(--red)", color:"white", borderRadius:99, minWidth:17, height:17, fontSize:".6em", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", flexShrink:0 }}>
                          {marginAlertCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="sb-footer">
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:10, background:"var(--s2)" }}>
              <div className="user-av" style={{ flexShrink:0 }}>{user.name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:".79em", fontWeight:600, color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
                <div style={{ fontSize:".68em", color:"var(--t4)", textTransform:"capitalize" }}>{user.role}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* CONTENT */}
        <div className="content">
          {user.isDemo && (
            <div className="demo-banner">
              🧪 Entorno Demo — Los datos no afectan la base de datos real
              <button className="demo-banner-btn" onClick={resetDemo}>↺ Restaurar datos</button>
            </div>
          )}
          <div className="topbar">
            <div className="topbar-brand">
              <img src="/logo.jpg" alt="Nutrifree" style={{ height:22, borderRadius:5 }}/>
              <span>Nutrifree Manager</span>
            </div>
            <div className="topbar-right">
              <span className="topbar-date">{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}</span>
              <div className="topbar-userchip">
                <div className="user-av" style={{ width:22, height:22, fontSize:".65em", flexShrink:0 }}>{user.name[0]}</div>
                <span className="topbar-user-name">{user.name}</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={async () => {
                localStorage.removeItem("nutrifree_mode");
                if (!user.isDemo) await supabase.auth.signOut();
                setUser(null);
              }} title="Salir"><Ico n="logout" s={13}/></button>
            </div>
          </div>
          <div style={{ flex:1, overflow:"hidden" }}>
            {page==="dashboard" && <DashboardPage {...props}/>}
            {page==="pos" && <POSPage {...props}/>}
            {page==="orders" && <OrdersPage {...props}/>}
            {page==="cash" && <CashShiftPage {...props}/>}
            {page==="customers" && <CustomersPage {...props}/>}
            {page==="products" && <ProductsPage {...props}/>}
            {page==="production" && <ProductionPage {...props}/>}
            {page==="recipes" && <RecipesPage {...props}/>}
            {page==="ingredients" && <IngredientsPage {...props}/>}
            {page==="expenses" && <ExpensesPage {...props}/>}
            {page==="suppliers" && <SuppliersPage {...props}/>}
            {page==="import" && (canAccess("import") ? <ImportPage {...props}/> : <AccessDenied/>)}
            {page==="reports" && (canAccess("reports") ? <ReportsPage {...props}/> : <AccessDenied/>)}
            {page==="settings" && <SettingsPage {...props}/>}
          </div>
        </div>
      </div>
      {deliveryAlerts.length > 0 && (
        <div className="modal-bg">
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span>⏰</span> Entregas pendientes hoy
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeliveryAlerts([])}><Ico n="x" s={18}/></button>
            </div>
            <p style={{ fontSize:".84em", color:"var(--t3)", marginBottom:16 }}>
              Los siguientes pedidos abiertos tienen fecha de entrega para hoy:
            </p>
            <div className="table-wrap" style={{ marginBottom:20 }}>
              <table>
                <thead><tr><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead>
                <tbody>
                  {deliveryAlerts.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight:500 }}>{s.customerName || "Anónimo"}</td>
                      <td style={{ fontWeight:700 }}>{$(s.total)}</td>
                      <td><span className={`badge ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeliveryAlerts([])}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => { setDeliveryAlerts([]); setPage("orders"); }}>
                <Ico n="orders" s={14}/> Ver pedidos
              </button>
            </div>
          </div>
        </div>
      )}
      {showMenuReminder && (
        <div className="modal-bg">
          <div className="modal" style={{ maxWidth:440 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span>🍽️</span> Menú del día
              </div>
            </div>
            <p style={{ fontSize:".84em", color:"var(--t3)", marginBottom:20 }}>
              Seleccioná los productos del menú de hoy. Se actualizará el kit <strong>{MENU_PRODUCT_NAME}</strong>.
            </p>
            {[
              { label:"☀️ Almuerzo del Día", key:"lunch",  id:menuLunchId,  setId:setMenuLunchId },
              { label:"🌙 Cena del Día",     key:"dinner", id:menuDinnerId, setId:setMenuDinnerId },
            ].map(({ label, key, id, setId }) => {
              const selected = products.find(p => p.id === id);
              const filtered = products.filter(p =>
                p.active && p.name !== MENU_PRODUCT_NAME &&
                (!menuSearch[key] || p.name.toLowerCase().includes(menuSearch[key].toLowerCase()))
              );
              return (
                <div key={key} className="form-group" style={{ marginBottom:14, position:"relative" }}>
                  <label className="lbl">{label}</label>
                  {selected
                    ? <div style={{ display:"flex", alignItems:"center", gap:8, background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:7, padding:"7px 10px" }}>
                        <span style={{ flex:1, fontSize:".88em", fontWeight:600 }}>{selected.name}</span>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setId(""); setMenuSearch(s => ({...s, [key]:""})); }}>
                          <Ico n="x" s={12} c="var(--red)"/>
                        </button>
                      </div>
                    : <>
                        <input
                          value={menuSearch[key]}
                          onChange={e => setMenuSearch(s => ({...s, [key]: e.target.value}))}
                          placeholder="Buscar producto..."
                          autoFocus={key === "lunch"}
                        />
                        {menuSearch[key] && filtered.length > 0 && (
                          <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:7, boxShadow:"0 4px 16px rgba(0,0,0,.12)", zIndex:50, maxHeight:180, overflowY:"auto" }}>
                            {filtered.map(p => (
                              <div key={p.id}
                                style={{ padding:"8px 12px", cursor:"pointer", fontSize:".88em", borderBottom:"1px solid var(--border)" }}
                                onMouseDown={() => { setId(p.id); setMenuSearch(s => ({...s, [key]:""})); }}>
                                {p.name}
                              </div>
                            ))}
                          </div>
                        )}
                        {menuSearch[key] && filtered.length === 0 && (
                          <div style={{ fontSize:".78em", color:"var(--t3)", marginTop:4 }}>Sin resultados</div>
                        )}
                      </>
                  }
                </div>
              );
            })}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMenuReminder(false)}>Saltar por ahora</button>
              <button className="btn btn-primary" onClick={saveMenu}>
                <Ico n="check" s={13}/> Guardar menú
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)}/>}
    </>
  );
}
