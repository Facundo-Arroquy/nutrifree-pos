/**
 * AppRoutes.jsx — Árbol de rutas privadas de la aplicación.
 *
 * Cada sección tiene su propia URL (ver `paths.js`). Las páginas siguen
 * recibiendo el mismo objeto `props` que antes, así que no hubo que tocarlas.
 * El guard por rol se aplica a TODAS las rutas: al ser direccionables por URL,
 * ya no alcanza con filtrar el sidebar.
 */
import { Routes, Route, Navigate } from "react-router-dom";
import { ROUTES, PUBLIC_PATHS, canAccess, homePathFor } from "./paths.js";
import AccessDenied from "./AccessDenied.jsx";

import DashboardPage from "../pages/DashboardPage.jsx";
import POSPage from "../pages/POSPage.jsx";
import OrdersKanbanPage from "../pages/OrdersKanbanPage.jsx";
import OrdersPage from "../pages/OrdersPage.jsx";
import BillingPage from "../pages/BillingPage.jsx";
import CustomersPage from "../pages/CustomersPage.jsx";
import ProductsPage from "../pages/ProductsPage.jsx";
import RecipesPage from "../pages/RecipesPage.jsx";
import IngredientsPage from "../pages/IngredientsPage.jsx";
import ProductionPage from "../pages/ProductionPage.jsx";
import ProductionLogPage from "../pages/ProductionLogPage.jsx";
import HoursBankPage from "../pages/HoursBankPage.jsx";
import CashShiftPage from "../pages/CashShiftPage.jsx";
import ExpensesPage from "../pages/ExpensesPage.jsx";
import SuppliersPage from "../pages/SuppliersPage.jsx";
import ImportPage from "../pages/ImportPage.jsx";
import ReportsPage from "../pages/ReportsPage.jsx";
import HelpAdminPage from "../pages/HelpAdminPage.jsx";
import SettingsPage from "../pages/SettingsPage.jsx";

/** id de página → componente. Las rutas sin componente se ignoran (acciones). */
const PAGE_COMPONENTS = {
  "dashboard":      DashboardPage,
  "pos":            POSPage,
  "orders-kanban":  OrdersKanbanPage,
  "orders":         OrdersPage,
  "billing":        BillingPage,
  "customers":      CustomersPage,
  "products":       ProductsPage,
  "recipes":        RecipesPage,
  "ingredients":    IngredientsPage,
  "production":     ProductionPage,
  "production-log": ProductionLogPage,
  "hours-bank":     HoursBankPage,
  "cash":           CashShiftPage,
  "expenses":       ExpensesPage,
  "suppliers":      SuppliersPage,
  "import":         ImportPage,
  "reports":        ReportsPage,
  "help-admin":     HelpAdminPage,
  "settings":       SettingsPage,
};

/** Rutas que además aceptan una subruta (/configuracion/:section). */
const NESTED_PATH_IDS = ["settings"];

export default function AppRoutes({ user, pageProps }) {
  const home = homePathFor(user);

  const render = (id) => {
    const Page = PAGE_COMPONENTS[id];
    if (!Page) return null;
    return canAccess(user, id) ? <Page {...pageProps}/> : <AccessDenied/>;
  };

  return (
    <Routes>
      {ROUTES.filter(r => r.path && PAGE_COMPONENTS[r.id]).map(r => (
        <Route
          key={r.id}
          path={NESTED_PATH_IDS.includes(r.id) ? `${r.path}/*` : r.path}
          element={render(r.id)}
        />
      ))}
      {/* La home y el login, ya con sesión activa, llevan a la página inicial. */}
      <Route path={PUBLIC_PATHS.home}  element={<Navigate to={home} replace/>}/>
      <Route path={PUBLIC_PATHS.login} element={<Navigate to={home} replace/>}/>
      <Route path="*" element={<Navigate to={home} replace/>}/>
    </Routes>
  );
}
