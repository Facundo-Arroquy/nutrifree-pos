// Inventario de tablas a respaldar. Orden = orden de restauración (padres antes que hijos).
export const TABLES = [
  // Catálogos base
  'app_settings',
  'categories',
  'expense_categories',
  'expense_subcategories',
  'business_users',
  // Maestros
  'suppliers',
  'customers',
  'products',
  'ingredients',
  'recipes',
  'recipe_ingredients',
  // Movimientos
  'sales',
  'account_payments',
  'expenses',
  'supplier_payments',
  'stock_movements',
  'cash_shifts',
  'productions',
  'production_employees',
  'employee_hours',
  'production_kanban',
  'vianda_plans',
  'vianda_plan_items',
  'weekly_goals',
  'customer_inactive_dismissed',
  'internal_notes',
  // Soporte / auditoría
  'faq_entries',
  'faq_missed',
  'audit_log',
];

// Tablas cuyo contenido es información personal de clientes, proveedores o
// usuarios del negocio. El manifiesto público nunca incluye muestras de estas.
export const SENSITIVE_TABLES = new Set([
  'customers',
  'suppliers',
  'business_users',
  'sales',
  'account_payments',
  'supplier_payments',
  'audit_log',
  'internal_notes',
  'employee_hours',
  'customer_inactive_dismissed',
]);
