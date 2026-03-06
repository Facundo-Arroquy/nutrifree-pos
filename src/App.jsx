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
import { useState, useEffect } from "react";
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

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
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
  const [reminderStart, setReminderStart] = useState(() => localStorage.getItem("reminderStart") || "10:00");
  const [reminderEnd,   setReminderEnd]   = useState(() => localStorage.getItem("reminderEnd")   || "11:00");

  useEffect(() => {
    const load = async () => {
      // Ensure no stale demo flag affects production data load
      localStorage.removeItem("nutrifree_mode");
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
  }, []);

  /** Muestra una notificación temporal. type: "success" | "error" */
  const showToast = (msg, type="success") => setToast({ msg, type });

  if (!user) return (
    <>
      <style>{CSS}</style>
      <LoginPage onLogin={u => {
        if (u.isDemo) {
          initDemoDb(false);
          localStorage.setItem("nutrifree_mode", "demo");
          // Load demo state into React from localStorage
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
        } else {
          localStorage.removeItem("nutrifree_mode");
        }
        setUser(u);
        setPage("dashboard");
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = reminderStart.split(":").map(Number);
        const [eh, em] = reminderEnd.split(":").map(Number);
        if (cur >= sh * 60 + sm && cur < eh * 60 + em) {
          const today = todayStr();
          const alerts = sales.filter(s =>
            ["open","pending","confirmed","ready"].includes(s.status) &&
            s.deliveryDate === today
          );
          if (alerts.length > 0) setDeliveryAlerts(alerts);
        }
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
    { id:"reports",     label:"Reportes",        icon:"reports",     roles:["admin"],          section:"bottom" },
    { id:"settings",    label:"Configuración",   icon:"settings",    roles:["admin","vendor"], section:"bottom" },
  ].filter(n => n.roles.includes(user.role));
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

  const props = { user, products, setProducts, customers, setCustomers, sales, setSales, recipes, setRecipes, categories, setCategories, expenseCategories, setExpenseCategories, expenses, setExpenses, ingredients, setIngredients, accountPayments, setAccountPayments, stockMovements, setStockMovements, suppliers, setSuppliers, supplierPayments, setSupplierPayments, cashShifts, setCashShifts, showToast, setPage, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo };

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
                    <button key={n.id} className={`ni${page===n.id?" active":""}`} onClick={() => setPage(n.id)}>
                      <Ico n={n.icon} s={15}/>{n.label}
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
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { localStorage.removeItem("nutrifree_mode"); setUser(null); }} title="Salir"><Ico n="logout" s={13}/></button>
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
            {page==="reports" && <ReportsPage {...props}/>}
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
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)}/>}
    </>
  );
}
