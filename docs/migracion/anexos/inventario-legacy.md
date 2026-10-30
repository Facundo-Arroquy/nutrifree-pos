# Inventario del sistema actual (`nutrifree-pos`, `main` al 2026-10-30)

Sirve de checklist: cada fila tiene que quedar cubierta por una fase.

## Tablas (`public`)

| Tabla | Módulo API | Fase |
|---|---|---|
| `business_users` | auth / users | B2 |
| `categories`, `products` | catalog | B3 |
| `ingredients` | catalog | B3 |
| `recipes`, `recipe_ingredients` | recipes | B3 |
| `stock_movements` | catalog / sales | B3, B5 |
| `customers`, `account_payments`, `customer_inactive_dismissed` | customers | B4 |
| `sales` | sales | B5 |
| `coupons` | coupons | B6 |
| `suppliers`, `supplier_payments` | suppliers | B7 |
| `expenses`, `expense_categories`, `expense_subcategories` | expenses | B7 |
| `cash_shifts` | cash | B7 |
| `productions`, `production_employees`, `employee_hours`, `production_kanban` | production | B8 |
| `weekly_goals`, `weekly_menus`, `vianda_plans`, `vianda_plan_items` | weekly | B8 |
| `app_settings`, `faq_entries`, `faq_missed`, `internal_notes`, `audit_log` | admin | B9 |
| `backup_customers_20260630` | — (sin modelo; se evalúa borrar en P6) | P6 |

Nuevas: `payment_events` (B6) y el esquema `nutrifree_meta` para Alembic (B1).

## Funciones y triggers de Postgres

| Función | Tipo | La usa hoy | Destino |
|---|---|---|---|
| `complete_sale_stocks` | RPC | `utils/stock.js` | B5, desde `SalesService` |
| `cancel_order_stocks` | RPC | `utils/stock.js` | B5 |
| `descontar_stock_pedido` | RPC | (pago web, legado) | B6 — revisar si sigue en uso |
| `adjust_product_stock` | RPC | `ProductionKanbanSection`, `ProductionLogPage` | B3, B8 |
| `adjust_ingredient_stock` | RPC | `ExpensesPage`, `IngredientsPage` | B3, B7 |
| `apply_production` | RPC | `ProductionPage` | B8 |
| `accumulate_employee_hours` | RPC | `HoursBankPage`, `ProductionLogPage` | B8 |
| `weekly_report` | RPC | `WeeklyReportPage` | B9 |
| `validate_coupon` | RPC (anon) | `utils/coupons.js` | B6 |
| `create_web_order` | RPC (anon, `SECURITY DEFINER`) | `utils/createWebOrder.js` | B6 |
| `handle_new_auth_user` | trigger en `auth.users` | Auth | B1 (se conserva) |
| `sync_customer_balance` | trigger | `account_payments` | B1 (se conserva) |
| `update_ingredients_updated_at` | trigger | `ingredients` | B1 (se conserva) |

## Integraciones

| Qué | Hoy | Destino |
|---|---|---|
| Supabase Auth | `supabase.auth` en `App.jsx` | Proxy en la API (B2) |
| Supabase Realtime | 10 canales en `App.jsx` | Polling + invalidación (F2–F9) |
| Supabase Storage | bucket `invoices` (público) en `BillingPage`, `WeeklyMenuPage` | `StorageBackend` (B5, B8); privado en P6 |
| MercadoPago | Edge Functions `create-preference`, `mp-webhook` | API (B6) |
| EmailJS | `utils/emailAlerts.js` desde el navegador | Front en v1, API después (DP-4) |
| Excel (`xlsx`) | `ImportPage`, `utils/priceImport.js` | `openpyxl` en la API (B9) |

## Páginas

| Página legado | Líneas | Roles | API | Web |
|---|---|---|---|---|
| `LandingPage` | 110 | público | B6 | F6 |
| `MenuPage` | 728 | público | B6 | F6 |
| `WholesaleMenuPage` | 370 | público con código | B6 | F6 |
| `PagoResultadoPage` | 75 | público | B6 | F6 |
| `DashboardPage` | 313 | admin, vendor | B9 | F9 |
| `POSPage` | 627 | admin, vendor | B5 | F5 |
| `WeeklyMenuPage` | 243 | admin, vendor, cocina | B8 | F8 |
| `OrdersKanbanPage` (Calendario de Pedidos) | 1147 | admin, vendor, cocina | B5 | F5 |
| `OrdersPage` | 328 | admin, vendor | B5 | F5 |
| `BillingPage` | 425 | admin, vendor | B5 | F5 |
| `CustomersPage` | 913 | admin, vendor | B4 | F4 |
| `ProductsPage` | 298 | admin, vendor | B3 | F3 |
| `RecipesPage` | 633 | admin, vendor, cocina | B3 | F3 |
| `IngredientsPage` | 460 | admin, vendor | B3 | F3 |
| `ProductionPage` | 133 | admin, vendor, cocina | B8 | F8 |
| `ProductionLogPage` | 406 | admin, vendor, cocina | B8 | F8 |
| `HoursBankPage` | 211 | admin | B8 | F8 |
| `CashShiftPage` | 445 | admin, vendor | B7 | F7 |
| `ExpensesPage` | 749 | admin, vendor | B7 | F7 |
| `SuppliersPage` | 308 | admin, vendor | B7 | F7 |
| `ImportPage` | 639 | admin | B9 | F9 |
| `ReportsPage` | 968 | admin | B9 | F9 |
| `WeeklyReportPage` | 309 | admin | B9 | F9 |
| `HelpAdminPage` | 252 | admin, cocina | B9 | F9 |
| `SettingsPage` | 1011 | admin, vendor (subsecciones por rol) | B2, B6, B9 | F9 |
| "Menú del Día" (modal del sidebar) | — | admin, vendor, cocina | B8 | F8 |

## Tests del legado a portar

| Test | API | Web |
|---|---|---|
| `stock`, `orderPricing`, `duplicateSale`, `money` | B5 | — |
| `costTier`, `supabase.costTier`, `recipeIngredients`, `productImages` | B3 | F3 (`productImages`) |
| `supplierAccount` | B7 | — |
| `coupons`, `createWebOrder`, `webOrder` | B6 | — |
| `weeklyMenu`, `weeklyMenuRules`, `weeklyProduction`, `dates` | B8 | — |
| `priceImport` | B9 | — |
| `paths` | B2 (matriz de roles) | F2 |
| `supabasePagination`, `supabaseEnvironment` | B0 (guarda de entorno) | — |
| `ProductionKanbanSection` | B8 | F8 |
| `WeeklyCostRulePanel`, `WeeklyIngredientsPanel`, `weeklyMenuImage`, `emailAlerts.weeklyMenu` | — | F8 |
| `emailRecipients` | — | F9 |

## Ramas sin mergear en `nutrifree-pos`

No están en `main` y **no** entran al plan salvo que se mergeen antes de la fase
correspondiente:

- `origin/feat/proyeccion-viandas` (nivel de servicio y proyección de viandas → B8/F8)
- `origin/claude/add-terracota-color` (color → F1)
- `origin/claude/backup-completo-0zsyjq` (backup → B9)
