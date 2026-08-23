/**
 * paths.js — Fuente única de verdad de las rutas de la aplicación.
 *
 * Antes cada sección vivía en la MISMA URL y se elegía con el estado `page`.
 * Ahora cada sección tiene su propia ruta, y este módulo centraliza:
 *   1. El catálogo de rutas privadas (id, path, roles, metadatos del sidebar)
 *   2. Las rutas públicas (menú, login, menú mayorista, resultado de pago)
 *   3. Los helpers de traducción id ↔ path y los permisos por rol
 *
 * Es un módulo sin JSX a propósito: se puede testear sin montar React.
 */

// ─── RUTAS PÚBLICAS (no requieren sesión) ─────────────────────────────────────
export const PUBLIC_PATHS = {
  home:          "/",                 // Menú público (visitantes sin sesión)
  login:         "/login",
  wholesaleMenu: "/menu-mayorista",   // Menú mayorista (público con código)
  paySuccess:    "/pago-exitoso",
  payFailure:    "/pago-fallido",
  payPending:    "/pago-pendiente",
};

/** Rutas de retorno de Mercado Pago: las tres las resuelve PagoResultadoPage. */
export const PAY_RESULT_PATHS = [
  PUBLIC_PATHS.paySuccess,
  PUBLIC_PATHS.payFailure,
  PUBLIC_PATHS.payPending,
];

// ─── SECCIONES DEL SIDEBAR ────────────────────────────────────────────────────
export const SIDEBAR_SECTIONS = [
  { label: null,        key: "top" },
  { label: "Ventas",    key: "ventas" },
  { label: "Productos", key: "productos" },
  { label: "Finanzas",  key: "finanzas" },
  { label: null,        key: "bottom" },
];

/**
 * Catálogo de rutas privadas.
 *
 *  id      → identificador histórico de la página (el que usan las páginas al
 *            llamar `setPage("recipes")`); se mantiene para no tocar las vistas.
 *  path    → URL propia de la sección. `null` = no es una ruta, es una acción
 *            del sidebar (ej. "Menú del Día" abre un modal).
 *  roles   → roles con permiso. El modo demo ve todo.
 *  section → sección del sidebar. `null` = no se muestra en el sidebar
 *            (se llega desde otra página).
 */
export const ROUTES = [
  { id:"dashboard",      path:"/dashboard",          label:"Dashboard",             icon:"dashboard",   roles:["admin","vendor"],          section:"top" },
  { id:"pos",            path:"/pos",                label:"Ventas en Mostrador",   icon:"pos",         roles:["admin","vendor"],          section:"ventas" },
  { id:"menu-banner",    path:null,                  label:"Menú del Día",          icon:"dashboard",   roles:["admin","vendor","cocina"], section:"ventas" },
  { id:"orders-kanban",  path:"/calendario-pedidos", label:"Calendario de Pedidos", icon:"orders",      roles:["admin","vendor","cocina"], section:"ventas" },
  { id:"orders",         path:"/pedidos",            label:"Pedidos",               icon:"orders",      roles:["admin","vendor"],          section:"ventas" },
  { id:"billing",        path:"/facturacion",        label:"Facturación",           icon:"billing",     roles:["admin","vendor"],          section:"ventas" },
  { id:"customers",      path:"/clientes",           label:"Clientes",              icon:"customers",   roles:["admin","vendor"],          section:"ventas" },
  { id:"products",       path:"/productos",          label:"Productos",             icon:"products",    roles:["admin","vendor"],          section:"productos" },
  { id:"recipes",        path:"/recetas",            label:"Recetas",               icon:"recipes",     roles:["admin","vendor","cocina"], section:"productos" },
  { id:"ingredients",    path:"/ingredientes",       label:"Ingredientes",          icon:"ingredients", roles:["admin","vendor"],          section:"productos" },
  { id:"production",     path:"/produccion",         label:"Producción",            icon:"production",  roles:["admin","vendor","cocina"], section:"productos" },
  { id:"production-log", path:"/registro-produccion",label:"Reg. Producción",       icon:"production",  roles:["admin","vendor","cocina"], section:"productos" },
  { id:"cash",           path:"/caja",               label:"Cierre de Caja",        icon:"cash",        roles:["admin","vendor"],          section:"finanzas" },
  { id:"expenses",       path:"/gastos",             label:"Gastos",                icon:"expenses",    roles:["admin","vendor"],          section:"finanzas" },
  { id:"suppliers",      path:"/proveedores",        label:"Proveedores",           icon:"suppliers",   roles:["admin","vendor"],          section:"finanzas" },
  { id:"import",         path:"/importar",           label:"Importar datos",        icon:"upload",      roles:["admin"],                   section:"bottom" },
  { id:"reports",        path:"/reportes",           label:"Reportes",              icon:"reports",     roles:["admin"],                   section:"bottom" },
  { id:"help-admin",     path:"/ayuda",              label:"FAQ / Ayuda",           icon:"settings",    roles:["admin","cocina"],          section:"bottom" },
  { id:"settings",       path:"/configuracion",      label:"Configuración",         icon:"settings",    roles:["admin","vendor"],          section:"bottom" },
  // Sin entrada en el sidebar: se accede desde Reg. Producción.
  { id:"hours-bank",     path:"/banco-horas",        label:"Banco de Horas",        icon:"production",  roles:["admin"],                   section:null },
];

/** Subsecciones de Configuración → /configuracion/:section */
export const SETTINGS_SECTIONS = [
  { id:"general",   label:"General",           roles:["admin","vendor"] },
  { id:"sistema",   label:"Sistema",           roles:["admin","vendor"] },
  { id:"precios",   label:"Listas de precios", roles:["admin","vendor"] },
  { id:"empleados", label:"Empleados",         roles:["admin"] },
  { id:"notas",     label:"Notas internas",    roles:["admin"] },
  { id:"backup",    label:"Backup",            roles:["admin"] },
  { id:"cuenta",    label:"Mi cuenta",         roles:["admin","vendor"] },
];

export const DEFAULT_SETTINGS_SECTION = "general";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Ruta por id de página. Devuelve `null` si el id no existe o no es navegable. */
export const routeById = (id) => ROUTES.find(r => r.id === id) || null;

/** URL de una página. Fallback al dashboard si el id es desconocido. */
export const pathForPage = (id) => routeById(id)?.path || "/dashboard";

/**
 * Id de página a partir de la URL actual (para marcar el ítem activo del
 * sidebar). Reconoce subrutas: /configuracion/empleados → "settings".
 */
export const pageIdForPath = (pathname = "") => {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const match = ROUTES
    .filter(r => r.path)
    .find(r => clean === r.path || clean.startsWith(r.path + "/"));
  return match ? match.id : null;
};

/** Página inicial según el rol: cocina arranca en el calendario de pedidos. */
export const homePathFor = (user) =>
  user?.role === "cocina" ? pathForPage("orders-kanban") : pathForPage("dashboard");

/** ¿El usuario puede entrar a esta página? El modo demo tiene acceso total. */
export const canAccess = (user, pageId) => {
  if (user?.isDemo) return true;
  const roles = routeById(pageId)?.roles || ["admin", "vendor"];
  return roles.includes(user?.role);
};

/** Ítems visibles del sidebar para el usuario (respetando el orden declarado). */
export const navItemsFor = (user) =>
  ROUTES.filter(r => r.section && (user?.isDemo || r.roles.includes(user?.role)));

/** Subsecciones de Configuración visibles para el usuario. */
export const settingsSectionsFor = (user) =>
  SETTINGS_SECTIONS.filter(s => user?.isDemo || s.roles.includes(user?.role));
