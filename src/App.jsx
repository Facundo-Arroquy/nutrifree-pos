/**
 * App.jsx — Componente raíz de la aplicación
 *
 * Responsabilidades:
 *  1. Carga inicial de todos los datos desde Supabase (14 tablas en paralelo)
 *  2. Estado global compartido con todas las páginas vía objeto `props`
 *  3. Lógica de autenticación: login, logout, modo demo
 *  4. Layout general (sidebar + topbar) y montaje del router (`routes/`)
 *  5. Alertas de entrega al login (según ventana de horario configurable)
 *  6. Sidebar dinámico filtrado por rol del usuario
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  dbToFaqEntry,
  dbToFaqMissed,
  dbToExpenseSubcategory,
} from "./supabase.js";

import ChatWidget from "./components/ChatWidget.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import WholesaleMenuPage from "./pages/WholesaleMenuPage.jsx";
import PagoResultadoPage from "./pages/PagoResultadoPage.jsx";
import AppRoutes from "./routes/AppRoutes.jsx";
import {
  PUBLIC_PATHS, PAY_RESULT_PATHS, SIDEBAR_SECTIONS, DEFAULT_SETTINGS_SECTION,
  pathForPage, pageIdForPath, homePathFor, navItemsFor, settingsSectionsFor,
} from "./routes/paths.js";
import { auditIsDue, runAudit, sendAuditEmail } from "./utils/auditCheck.js";

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
const sessionToUser = (session) => {
  const email = session.user.email || "";
  const lower = email.toLowerCase();
  const role = lower.startsWith("admin") ? "admin"
    : lower.startsWith("cocina") ? "cocina"
    : "vendor";
  const name = session.user.user_metadata?.name || email.split("@")[0] || "Usuario";
  return { name, role, email, isDemo: false };
};

// Sincroniza el usuario con business_users y devuelve el user con el rol guardado en DB.
// Si el registro no existe lo crea. Si existe, preserva el rol ya almacenado.
// Si el usuario está inactivo devuelve null (debe ser deslogueado).
const syncBusinessUser = async (session) => {
  const base = sessionToUser(session);
  const { email, name, role } = base;
  const domain = email.split("@")[1] || "";
  if (!domain) return base;

  try {
    // Intentar leer registro existente
    const { data: existing } = await supabase
      .from("business_users")
      .select("id, role, name, active")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (!existing.active) return null; // bloqueado
      // Actualizar nombre en caso de cambio, preservar rol
      await supabase.from("business_users").update({ name }).eq("id", existing.id);
      return { ...base, role: existing.role, name: existing.name || name };
    } else {
      // Primer login: insertar con rol derivado del email
      const { data: inserted } = await supabase
        .from("business_users")
        .insert({ email, domain, name, role })
        .select("role, active")
        .single();
      if (inserted && !inserted.active) return null;
      return base;
    }
  } catch (_) {
    return base; // Si falla la sincronización, usar el usuario base
  }
};

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // La sección activa ya no es estado: la define la URL (ver routes/paths.js).
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageIdForPath(location.pathname);
  /** Compat: las páginas siguen llamando setPage("clientes") para navegar. */
  const setPage = (id) => navigate(pathForPage(id));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(244);
  // Subsección de Configuración: sale de la URL /configuracion/:section.
  const settingsSection = (location.pathname.split("/")[2] || DEFAULT_SETTINGS_SECTION);
  const setSettingsSection = (id) => navigate(`${pathForPage("settings")}/${id}`);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState(["Ingredientes","Servicios","Envases","Limpieza","Otros"]);
  const [expenseSubcategories, setExpenseSubcategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [accountPayments, setAccountPayments] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [cashShifts, setCashShifts] = useState([]);
  const [faqEntries, setFaqEntries] = useState([]);
  const [faqMissed, setFaqMissed] = useState([]);
  const [openRecipeId, setOpenRecipeId] = useState(null);
  const [highlightRecipeId, setHighlightRecipeId] = useState(null);
  const [alertBalanceThreshold, setAlertBalanceThreshold] = useState(0);
  const [inactiveDayThreshold, setInactiveDayThreshold] = useState(0);
  const [inactiveDismissed, setInactiveDismissed] = useState([]); // [{ customerId, lastSaleAt, dismissedAt, dismissedBy }]
  const [frozenDiscount, setFrozenDiscount] = useState(15);
  const [vatRate, setVatRate] = useState(21);
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
  const loadDataRef = useRef(null);

  // ─── Supabase Auth: restaurar sesión y escuchar cambios ───────────────────
  useEffect(() => {
    // Sincroniza en background: no bloquea la carga inicial.
    // Establece el usuario base de inmediato y luego actualiza con el rol de DB.
    const syncInBackground = (session) => {
      syncBusinessUser(session).then(u => {
        if (!u) supabase.auth.signOut();
        else setUser(u);
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(sessionToUser(session)); // carga inmediata
        syncInBackground(session);       // actualiza rol en background
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(sessionToUser(session));
        syncInBackground(session);
      } else {
        setUser(prev => (prev?.isDemo ? prev : null));
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // El rol "cocina" tiene navegación limitada: si por defecto (o al restaurar
  // sesión) cae en una página fuera de su alcance, lo mandamos al calendario.
  useEffect(() => {
    if (user?.role === "cocina" && page === "dashboard") {
      navigate(pathForPage("orders-kanban"), { replace: true });
    }
  }, [user, page]);

  useEffect(() => {
    if (!user || user.isDemo) return;
    const load = async () => {
      // PostgREST limita a 1000 filas por respuesta: las tablas que crecen sin
      // techo se paginan. Los saldos de cuenta corriente (clientes y
      // proveedores) se calculan sumando TODOS sus movimientos, así que una
      // respuesta truncada daría saldos mal.
      const fetchAllRows = async (table) => {
        let all = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase.from(table)
            .select("*").order("created_at", { ascending: false })
            .range(from, from + 999);
          if (error) { console.error(`[${table}] Error:`, error); break; }
          if (!data || data.length === 0) break;
          all = [...all, ...data];
          if (data.length < 1000) break;
          from += 1000;
        }
        return all;
      };

      const [[{ data: cats }, { data: expCats }, { data: prods }, { data: custs }, { data: sls }, { data: recs }, { data: ingrs }, { data: stockMovs }, { data: recIngrs }, { data: supps }, { data: shifts }, { data: faqs }, { data: faqsMissed }, { data: settings }, { data: inactiveDis }, { data: expSubcats }], accPays, exps, suppPays] = await Promise.all([
        Promise.all([
          supabase.from("categories").select("*"),
          supabase.from("expense_categories").select("*").order("name"),
          supabase.from("products").select("*"),
          supabase.from("customers").select("*"),
          supabase.from("sales").select("*").order("created_at", { ascending: false }),
          supabase.from("recipes").select("*"),
          supabase.from("ingredients").select("*").order("name"),
          supabase.from("stock_movements").select("*").order("created_at", { ascending: false }),
          supabase.from("recipe_ingredients").select("*"),
          supabase.from("suppliers").select("*").order("name"),
          supabase.from("cash_shifts").select("*").order("created_at", { ascending: false }),
          supabase.from("faq_entries").select("*").order("created_at", { ascending: false }),
          supabase.from("faq_missed").select("*").order("created_at", { ascending: false }),
          supabase.from("app_settings").select("*"),
          supabase.from("customer_inactive_dismissed").select("*"),
          supabase.from("expense_subcategories").select("*").order("name"),
        ]),
        fetchAllRows("account_payments"),
        fetchAllRows("expenses"),
        fetchAllRows("supplier_payments"),
      ]);
      if (cats) setCategories(cats.map(c => c.name));
      if (expCats && expCats.length > 0) setExpenseCategories(expCats.map(c => c.name));
      if (expSubcats) setExpenseSubcategories(expSubcats.map(dbToExpenseSubcategory));
      if (prods) setProducts(prods.map(dbToProduct));
      if (custs) setCustomers(custs.map(dbToCustomer));
      if (sls) setSales(sls.map(dbToSale));
      if (exps) setExpenses(exps.map(dbToExpense));
      if (ingrs) setIngredients(ingrs.map(dbToIngredient));
      if (recs) {
        const ingredientsCatalog = ingrs || [];
        setRecipes(recs.map(r => ({
          ...dbToRecipe(r),
          ingredients: (recIngrs || [])
            .filter(ri => ri.recipe_id === r.id)
            .map(ri => dbToRecipeIngredient(ri, ingredientsCatalog)),
        })));
      }
      setAccountPayments(accPays.map(dbToAccountPayment));
      if (stockMovs) setStockMovements(stockMovs.map(dbToStockMovement));
      if (supps) setSuppliers(supps.map(dbToSupplier));
      if (suppPays) setSupplierPayments(suppPays.map(dbToSupplierPayment));
      if (shifts) setCashShifts(shifts.map(dbToCashShift));
      if (faqs) setFaqEntries(faqs.map(dbToFaqEntry));
      if (faqsMissed) setFaqMissed(faqsMissed.map(dbToFaqMissed));
      if (settings) {
        const bal = settings.find(s => s.key === "balance_alert_threshold");
        if (bal) setAlertBalanceThreshold(Number(bal.value) || 0);
        const frozen = settings.find(s => s.key === "frozen_discount");
        if (frozen) setFrozenDiscount(Number(frozen.value) || 15);
        const vat = settings.find(s => s.key === "vat_rate");
        if (vat) setVatRate(Number(vat.value) || 21);
        const inactiveDays = settings.find(s => s.key === "inactive_days_threshold");
        if (inactiveDays) setInactiveDayThreshold(Number(inactiveDays.value) || 0);
      }
      if (inactiveDis) setInactiveDismissed(inactiveDis.map(r => ({
        customerId: r.customer_id,
        lastSaleAt: r.last_sale_at,
        dismissedAt: r.dismissed_at,
        dismissedBy: r.dismissed_by,
      })));
    };
    loadDataRef.current = load;
    load();
  }, [user?.email]);

  // ─── Re-fetch al volver a la tab (visibilitychange) ────────────────────────
  useEffect(() => {
    if (!user || user.isDemo) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") loadDataRef.current?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.email]);

  // ─── Supabase Realtime: sincroniza cambios remotos por ID ──────────────────
  const ingredientsRef = useRef([]);
  useEffect(() => { ingredientsRef.current = ingredients; }, [ingredients]);

  useEffect(() => {
    if (!user || user.isDemo) return;

    // Helper genérico: INSERT agrega al frente (sin duplicar), UPDATE reemplaza por id, DELETE filtra
    const sub = (table, mapper, setter) =>
      supabase.channel(`rt_${table}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table }, ({ new: row }) =>
          setter(prev => prev.some(x => x.id === row.id) ? prev : [mapper(row), ...prev])
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table }, ({ new: row }) =>
          setter(prev => prev.map(x => x.id === row.id ? mapper(row) : x))
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table }, ({ old: row }) =>
          setter(prev => prev.filter(x => x.id !== row.id))
        )
        .subscribe();

    const channels = [
      sub("sales",             dbToSale,            setSales),
      sub("expenses",          dbToExpense,         setExpenses),
      sub("products",          dbToProduct,         setProducts),
      sub("customers",         dbToCustomer,        setCustomers),
      sub("suppliers",         dbToSupplier,        setSuppliers),
      sub("supplier_payments", dbToSupplierPayment, setSupplierPayments),
      sub("ingredients",       dbToIngredient,      setIngredients),
      sub("account_payments",  dbToAccountPayment,  setAccountPayments),
      sub("stock_movements",   dbToStockMovement,   setStockMovements),
      sub("cash_shifts",       dbToCashShift,       setCashShifts),
    ];

    // Subscripción a dismissed de clientes inactivos (re-fetch completo en cualquier cambio)
    const dismissedChannel = supabase.channel("rt_customer_inactive_dismissed")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_inactive_dismissed" }, () => {
        supabase.from("customer_inactive_dismissed").select("*").then(({ data }) => {
          if (data) setInactiveDismissed(data.map(r => ({
            customerId: r.customer_id,
            lastSaleAt: r.last_sale_at,
            dismissedAt: r.dismissed_at,
            dismissedBy: r.dismissed_by,
          })));
        }).catch(err => console.error("[rt_customer_inactive_dismissed]", err));
      })
      .subscribe();

    // Recetas: preserva el array local de ingredients al actualizar
    const recipesChannel = supabase.channel("rt_recipes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recipes" }, ({ new: row }) =>
        setRecipes(prev => prev.some(r => r.id === row.id) ? prev : [{ ...dbToRecipe(row), ingredients: [] }, ...prev])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "recipes" }, ({ new: row }) =>
        setRecipes(prev => prev.map(r => r.id === row.id ? { ...dbToRecipe(row), ingredients: r.ingredients } : r))
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "recipes" }, ({ old: row }) =>
        setRecipes(prev => prev.filter(r => r.id !== row.id))
      )
      .subscribe();

    // Ingredientes de receta: actualiza solo la receta afectada
    const recIngChannel = supabase.channel("rt_recipe_ingredients")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recipe_ingredients" }, ({ new: ri }) =>
        setRecipes(prev => prev.map(r => r.id === ri.recipe_id
          ? { ...r, ingredients: r.ingredients.some(i => i.id === ri.id) ? r.ingredients : [...r.ingredients, dbToRecipeIngredient(ri, ingredientsRef.current)] }
          : r
        ))
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "recipe_ingredients" }, ({ new: ri }) =>
        setRecipes(prev => prev.map(r => r.id === ri.recipe_id
          ? { ...r, ingredients: r.ingredients.map(i => i.id === ri.id ? dbToRecipeIngredient(ri, ingredientsRef.current) : i) }
          : r
        ))
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "recipe_ingredients" }, ({ old: ri }) =>
        setRecipes(prev => prev.map(r => ({ ...r, ingredients: r.ingredients.filter(i => i.id !== ri.id) })))
      )
      .subscribe();

    // Categorías de productos (re-fetch en cualquier cambio)
    const catsChannel = supabase.channel("rt_categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
        supabase.from("categories").select("*").then(({ data }) => { if (data) setCategories(data.map(c => c.name)); })
          .catch(err => console.error("[rt_categories]", err));
      }).subscribe();

    // Categorías de gastos (re-fetch en cualquier cambio)
    const expCatsChannel = supabase.channel("rt_expense_categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => {
        supabase.from("expense_categories").select("*").order("name").then(({ data }) => { if (data) setExpenseCategories(data.map(c => c.name)); })
          .catch(err => console.error("[rt_expense_categories]", err));
      }).subscribe();

    // Subcategorías de gastos (re-fetch en cualquier cambio)
    const expSubcatsChannel = supabase.channel("rt_expense_subcategories")
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_subcategories" }, () => {
        supabase.from("expense_subcategories").select("*").order("name").then(({ data }) => {
          if (data) setExpenseSubcategories(data.map(dbToExpenseSubcategory));
        }).catch(err => console.error("[rt_expense_subcategories]", err));
      }).subscribe();

    // Configuración global (IVA, umbrales, descuentos) — re-fetch en cualquier cambio
    const settingsChannel = supabase.channel("rt_app_settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
        supabase.from("app_settings").select("*").then(({ data: s }) => {
          if (!s) return;
          const bal = s.find(x => x.key === "balance_alert_threshold"); if (bal) setAlertBalanceThreshold(Number(bal.value) || 0);
          const frozen = s.find(x => x.key === "frozen_discount");       if (frozen) setFrozenDiscount(Number(frozen.value) || 15);
          const vat = s.find(x => x.key === "vat_rate");                 if (vat) setVatRate(Number(vat.value) || 21);
          const inact = s.find(x => x.key === "inactive_days_threshold"); if (inact) setInactiveDayThreshold(Number(inact.value) || 0);
        }).catch(err => console.error("[rt_app_settings]", err));
      }).subscribe();

    // FAQ
    const faqChannel = supabase.channel("rt_faq_entries")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "faq_entries" }, ({ new: row }) =>
        setFaqEntries(prev => prev.some(x => x.id === row.id) ? prev : [dbToFaqEntry(row), ...prev])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "faq_entries" }, ({ new: row }) =>
        setFaqEntries(prev => prev.map(x => x.id === row.id ? dbToFaqEntry(row) : x))
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "faq_entries" }, ({ old: row }) =>
        setFaqEntries(prev => prev.filter(x => x.id !== row.id))
      ).subscribe();

    const faqMissedChannel = supabase.channel("rt_faq_missed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "faq_missed" }, ({ new: row }) =>
        setFaqMissed(prev => prev.some(x => x.id === row.id) ? prev : [dbToFaqMissed(row), ...prev])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "faq_missed" }, ({ new: row }) =>
        setFaqMissed(prev => prev.map(x => x.id === row.id ? dbToFaqMissed(row) : x))
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "faq_missed" }, ({ old: row }) =>
        setFaqMissed(prev => prev.filter(x => x.id !== row.id))
      ).subscribe();

    return () => {
      [...channels, recipesChannel, recIngChannel, dismissedChannel, catsChannel, expCatsChannel, expSubcatsChannel, settingsChannel, faqChannel, faqMissedChannel].forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.email]);

  // Sincroniza costos de recipe_ingredients cuando cambia el precio de un ingrediente
  useEffect(() => {
    if (!ingredients.length || !recipes.length) return;
    setRecipes(prev => prev.map(r => ({
      ...r,
      ingredients: r.ingredients.map(ri => {
        const ing = ingredients.find(x => x.id === ri.ingredientId);
        return ing ? { ...ri, cost: ri.qty * ing.unitCost } : ri;
      }),
    })));
  }, [ingredients]);

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

  // ─── Auditoría semanal de integridad (solo admin) ──────────────────────────
  const auditChecked = useRef(false);
  useEffect(() => {
    if (!user || user.isDemo || user.role !== "admin" || auditChecked.current) return;
    if (!auditIsDue()) return;
    auditChecked.current = true;
    runAudit().then(result => {
      if (!result.ok) {
        showToast(
          `⚠️ Auditoría: ${result.orphanedCredits.length + result.uncoveredSales.length} problema(s) detectado(s). Revisá AUDITORIA.md.`,
          "error"
        );
        sendAuditEmail(result).catch(() => {});
      }
    }).catch(() => {});
  }, [user]);

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
  /** Normaliza para comparar nombres sin depender de tildes ni mayúsculas. */
  const normName = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  const saveMenu = async () => {
    if (!menuLunchId || !menuDinnerId) { showToast("Seleccioná el almuerzo y la cena", "error"); return; }
    const kitItems = [{ productId: menuLunchId, qty: 1 }, { productId: menuDinnerId, qty: 1 }];
    const lunchProd  = products.find(p => p.id === menuLunchId);
    const dinnerProd = products.find(p => p.id === menuDinnerId);
    if (!lunchProd || !dinnerProd) { showToast("Productos no encontrados", "error"); return; }
    const description = `Almuerzo: ${lunchProd.name} | Cena: ${dinnerProd.name}`;
    // Comparar normalizado: "Almuerzo y Cena del Dia" y "…del día" son el mismo
    // producto; con igualdad estricta se creaba un kit duplicado cada vez.
    const existing = products.find(p => normName(p.name) === normName(MENU_PRODUCT_NAME));

    if (existing) {
      const { error } = await supabase.from("products")
        // stock 0: el kit no tiene stock propio, se deriva de sus componentes.
        .update({ kit_items: kitItems, description, stock: 0 })
        .eq("id", existing.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setProducts(ps => ps.map(p => p.id === existing.id ? { ...p, kitItems, description, stock: 0 } : p));
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

  // ─── Rutas públicas: se renderizan sin el layout de la app ────────────────
  const currentPath = location.pathname;
  if (currentPath === PUBLIC_PATHS.wholesaleMenu) {
    return <WholesaleMenuPage />;
  }

  // Páginas de resultado de pago MP (públicas)
  if (PAY_RESULT_PATHS.includes(currentPath)) {
    return <PagoResultadoPage />;
  }

  // Menú público en /
  if (currentPath === PUBLIC_PATHS.home && !user) {
    if (authLoading) return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f3faf8", flexDirection:"column", gap:16 }}>
        <img src="/imagenes/logo.png" style={{ height:60, opacity:0.7 }} alt="NutriFree" />
        <div style={{ fontFamily:"Arial, sans-serif", fontSize:".9em", color:"#89b8ad" }}>Cargando…</div>
      </div>
    );
    return <MenuPage onGoToLogin={() => navigate(PUBLIC_PATHS.login)} />;
  }

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
        // Si venía de /login o /, AppRoutes lo lleva a la home de su rol;
        // si entró por un deep link (ej. /pos), se respeta esa URL.
        navigate(pageIdForPath(currentPath) ? currentPath : homePathFor(u), { replace: true });
      }} />
    </>
  );

  const nav = navItemsFor(user);
  const SETTINGS_SECTIONS = settingsSectionsFor(user);
  const sidebarSections = SIDEBAR_SECTIONS;

  /** Restaura los datos demo a su estado original y recarga la aplicación. */
  const resetDemo = () => {
    resetDemoDb();
    window.location.reload();
  };

  const startResize = (e) => {
    e.preventDefault();
    const onMove = (e) => setSidebarWidth(Math.min(Math.max(e.clientX, 180), 420));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const props = { user, products, setProducts, customers, setCustomers, sales, setSales, recipes, setRecipes, categories, setCategories, expenseCategories, setExpenseCategories, expenseSubcategories, setExpenseSubcategories, expenses, setExpenses, ingredients, setIngredients, accountPayments, setAccountPayments, stockMovements, setStockMovements, suppliers, setSuppliers, supplierPayments, setSupplierPayments, cashShifts, setCashShifts, faqEntries, setFaqEntries, faqMissed, setFaqMissed, alertBalanceThreshold, setAlertBalanceThreshold, inactiveDayThreshold, setInactiveDayThreshold, inactiveDismissed, frozenDiscount, setFrozenDiscount, vatRate, setVatRate, openRecipeId, setOpenRecipeId, highlightRecipeId, setHighlightRecipeId, showToast, setPage, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo, logAction, settingsSection, setSettingsSection };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* OVERLAY MOBILE */}
        <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

        {/* SIDEBAR */}
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`} style={{ width: sidebarWidth }}>
          <div className="sb-resize-handle" onMouseDown={startResize} />
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
                  {items.map(n => {
                    if (n.id === "settings") {
                      const expanded = settingsExpanded || page === "settings";
                      return (
                        <div key="settings">
                          <button className={`ni${page==="settings"?" active":""}`} onClick={() => {
                            if (page !== "settings") setSettingsSection(DEFAULT_SETTINGS_SECTION);
                            setSettingsExpanded(v => !v);
                            setSidebarOpen(false);
                          }}>
                            <Ico n="settings" s={15}/>Configuración
                            <span style={{ position:"absolute", right:10, display:"flex", alignItems:"center", transform: expanded ? "none" : "rotate(-90deg)", transition:"transform .2s" }}>
                              <Ico n="chevron" s={11}/>
                            </span>
                          </button>
                          {expanded && SETTINGS_SECTIONS.map(sec => (
                            <button key={sec.id} className={`ni${page==="settings" && settingsSection===sec.id?" active":""}`}
                              style={{ paddingLeft:32, fontSize:".82em" }}
                              onClick={() => { setSettingsSection(sec.id); setSidebarOpen(false); }}
                            >
                              {sec.label}
                            </button>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <button key={n.id} className={`ni${page===n.id?" active":""}${user.role==="cocina"?" ni-tablet":""}`} onClick={() => {
                        if (n.id === "reports") logAction("view", "reports", "Acceso a reportes");
                        if (n.id === "menu-banner") {
                          const today = todayStr();
                          setMenuLunchId(localStorage.getItem("menuLunchId_" + today) || "");
                          setMenuDinnerId(localStorage.getItem("menuDinnerId_" + today) || "");
                          setMenuSearch({ lunch: "", dinner: "" });
                          setShowMenuReminder(true);
                          setSidebarOpen(false);
                          return;
                        }
                        setPage(n.id);
                        setSidebarOpen(false);
                      }}>
                        <Ico n={n.icon} s={user.role==="cocina" ? 20 : 15}/>{n.label}
                        {n.id === "reports" && marginAlertCount > 0 && (
                          <span style={{ position:"absolute", right:10, background:"var(--red)", color:"white", borderRadius:99, minWidth:17, height:17, fontSize:".6em", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", flexShrink:0 }}>
                            {marginAlertCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
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
        <div className="content" style={{ marginLeft: sidebarWidth }}>
          {/* HEADER MOBILE */}
          <div className="mob-header">
            <button className="ham-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">
              <span/><span/><span/>
            </button>
            <span className="mob-header-brand">Nutrifree Manager</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={async () => {
              localStorage.removeItem("nutrifree_mode");
              if (!user.isDemo) await supabase.auth.signOut();
              setUser(null);
            }} title="Salir"><Ico n="logout" s={13}/></button>
          </div>

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
              <span className="topbar-date">{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",timeZone:"America/Argentina/Buenos_Aires"})}</span>
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
            <AppRoutes user={user} pageProps={props}/>
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
      <ChatWidget faqEntries={faqEntries} setFaqMissed={setFaqMissed}/>
    </>
  );
}
