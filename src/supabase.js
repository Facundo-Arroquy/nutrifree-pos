/**
 * supabase.js — Cliente Supabase y mappers DB↔App
 *
 * Exporta:
 *  - `supabase`: proxy inteligente que redirige a demoClient (localStorage) o al
 *    cliente real de Supabase según el flag `nutrifree_mode` en localStorage.
 *  - Mappers `dbTo*`: convierten filas DB (snake_case) a objetos React (camelCase).
 *  - Mappers `*ToDb`: convierten objetos React (camelCase) a filas DB (snake_case).
 */
import { createClient } from "@supabase/supabase-js";
import { demoClient } from "./demoSupabase.js";

// ─── Credenciales desde variables de entorno (.env) ─────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE;
// ────────────────────────────────────────────────────────────────────────────

const _prod = createClient(SUPABASE_URL, SUPABASE_KEY);

// Smart client: routes to demo (localStorage) or production (Supabase) at call time.
// auth y channel siempre apuntan al cliente real (no aplica al modo demo).
export const supabase = {
  from: (table) => {
    const isDemo = typeof localStorage !== "undefined" && localStorage.getItem("nutrifree_mode") === "demo";
    return isDemo ? demoClient.from(table) : _prod.from(table);
  },
  rpc: (fn, args) => {
    const isDemo = typeof localStorage !== "undefined" && localStorage.getItem("nutrifree_mode") === "demo";
    return isDemo ? demoClient.rpc(fn, args) : _prod.rpc(fn, args);
  },
  auth: _prod.auth,
  storage: _prod.storage,
  channel: (...args) => _prod.channel(...args),
  removeChannel: (...args) => _prod.removeChannel(...args),
};

// ─── MAPPERS: DB (snake_case) ↔ App (camelCase) ───────────────────────────
// Cada entidad tiene un par dbTo*(row) → objeto App y *ToDb(obj) → fila DB.

export const dbToProduct = r => ({
  id: r.id, name: r.name, category: r.category,
  priceRetail: r.price_retail, priceWholesale: r.price_wholesale,
  unit: r.unit, stock: r.stock, active: r.active,
  photo: r.photo, description: r.description,
  kitItems: r.kit_items || [],
  isFavorite: r.is_favorite ?? false,
});

export const productToDb = p => ({
  id: p.id, name: p.name, category: p.category,
  price_retail: p.priceRetail, price_wholesale: p.priceWholesale,
  unit: p.unit, stock: p.stock, active: p.active,
  photo: p.photo, description: p.description,
  kit_items: p.kitItems || [],
  is_favorite: p.isFavorite ?? false,
});

export const dbToCustomer = r => ({
  id: r.id, name: r.name, phone: r.phone, address: r.address,
  notes: r.notes, priceList: r.price_list,
  discountPct: r.discount_pct || 0,
  email: r.email || "", cuit: r.cuit || "",
  defaultBilling: r.default_billing || false,
});

export const customerToDb = c => ({
  id: c.id, name: c.name, phone: c.phone, address: c.address,
  notes: c.notes, price_list: c.priceList,
  discount_pct: Number(c.discountPct) || 0,
  email: c.email || "", cuit: c.cuit || "",
  default_billing: c.defaultBilling || false,
});

export const dbToSale = r => ({
  id: r.id, customerId: r.customer_id, customerName: r.customer_name,
  items: r.items, total: r.total, priceList: r.price_list,
  paymentMethod: r.payment_method, status: r.status, notes: r.notes,
  createdAt: r.created_at,
  discountType: r.discount_type || "pct",
  discountValue: r.discount_value || 0,
  discountAmount: r.discount_amount || 0,
  deliveryDate: r.delivery_date || null,
  needsBilling: r.needs_billing || false,
  billingStatus: r.billing_status || null,
});

export const saleToDb = s => ({
  id: s.id, customer_id: s.customerId, customer_name: s.customerName,
  items: s.items, total: s.total, price_list: s.priceList,
  payment_method: s.paymentMethod, status: s.status, notes: s.notes,
  created_at: s.createdAt,
  discount_type: s.discountType || "pct",
  discount_value: s.discountValue || 0,
  discount_amount: s.discountAmount || 0,
  delivery_date: s.deliveryDate || null,
  needs_billing: s.needsBilling || false,
  billing_status: s.billingStatus || null,
});

export const dbToRecipe = r => ({
  id: r.id, productId: r.product_id, prepTime: r.prep_time,
  cookTime: r.cook_time, packagingTime: r.packaging_time || 0,
  yield: r.yield, notes: r.notes,
  minMargin: r.min_margin ?? null,
  needsReview: r.needs_review ?? false,
  reviewReason: r.review_reason ?? null,
  isFavorite: r.is_favorite ?? false,
  ingredients: [], steps: r.steps,
});

export const recipeToDb = r => ({
  id: r.id, product_id: r.productId, prep_time: r.prepTime,
  cook_time: r.cookTime, packaging_time: r.packagingTime || 0,
  yield: r.yield, notes: r.notes,
  min_margin: r.minMargin != null && r.minMargin !== "" ? Number(r.minMargin) : null,
  needs_review: r.needsReview ?? false,
  review_reason: r.reviewReason ?? null,
  is_favorite: r.isFavorite ?? false,
  steps: r.steps,
});

export const dbToRecipeIngredient = (ri, ingredientsCatalog = []) => {
  const ing = ingredientsCatalog.find(i => i.id === ri.ingredient_id);
  return {
    id: ri.id, recipeId: ri.recipe_id, ingredientId: ri.ingredient_id,
    name: ing?.name || "", qty: ri.qty,
    unit: ri.unit || ing?.unit || "", cost: ri.cost || 0,
  };
};

export const recipeIngredientToDb = (ri, recipeId) => ({
  id: ri.id, recipe_id: recipeId, ingredient_id: ri.ingredientId,
  qty: ri.qty, unit: ri.unit, cost: ri.cost || 0,
});

export const dbToExpense = r => ({
  id: r.id, date: r.date, supplier: r.supplier, concept: r.concept,
  quantity: r.quantity, unit: r.unit, unitPrice: r.unit_price,
  total: r.total, paymentMethod: r.payment_method,
  paymentStatus: r.payment_status, category: r.category, notes: r.notes,
  createdAt: r.created_at, supplierId: r.supplier_id || null,
  ingredientLines: r.ingredient_lines || null,
});

export const expenseToDb = e => ({
  id: e.id, date: e.date, supplier: e.supplier, concept: e.concept,
  quantity: e.quantity, unit: e.unit, unit_price: e.unitPrice,
  total: e.total, payment_method: e.paymentMethod,
  payment_status: e.paymentStatus, category: e.category, notes: e.notes,
  supplier_id: e.supplierId || null,
  ingredient_lines: e.ingredientLines?.filter(l => l.ingredientId) || null,
});

export const dbToSupplier = r => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email,
  address: r.address, notes: r.notes, createdAt: r.created_at,
});

export const supplierToDb = s => ({
  id: s.id, name: s.name, phone: s.phone, email: s.email,
  address: s.address, notes: s.notes,
});

export const dbToSupplierPayment = r => ({
  id: r.id, supplierId: r.supplier_id, expenseId: r.expense_id,
  amount: r.amount, type: r.type, paymentMethod: r.payment_method,
  date: r.date, notes: r.notes, createdAt: r.created_at,
});

export const supplierPaymentToDb = p => ({
  id: p.id, supplier_id: p.supplierId, expense_id: p.expenseId,
  amount: p.amount, type: p.type, payment_method: p.paymentMethod,
  date: p.date, notes: p.notes,
});

export const dbToIngredient = r => ({
  id: r.id, name: r.name, category: r.category, unit: r.unit,
  stock: r.stock, stockMin: r.stock_min, unitCost: r.unit_cost,
  supplier: r.supplier, notes: r.notes, createdAt: r.created_at,
  calories: r.calories ?? null, protein: r.protein ?? null,
  carbs: r.carbs ?? null, fat: r.fat ?? null,
  fiber: r.fiber ?? null, sugar: r.sugar ?? null, sodium: r.sodium ?? null,
});

const toNutr = v => (v != null && v !== "") ? Number(v) : null;

export const ingredientToDb = i => ({
  id: i.id, name: i.name, category: i.category, unit: i.unit,
  stock: i.stock, stock_min: i.stockMin, unit_cost: i.unitCost,
  supplier: i.supplier, notes: i.notes,
  calories: toNutr(i.calories), protein: toNutr(i.protein),
  carbs: toNutr(i.carbs), fat: toNutr(i.fat),
  fiber: toNutr(i.fiber), sugar: toNutr(i.sugar), sodium: toNutr(i.sodium),
});

export const dbToAccountPayment = r => ({
  id: r.id, customerId: r.customer_id, saleId: r.sale_id,
  amount: r.amount, type: r.type, paymentMethod: r.payment_method,
  date: r.date, notes: r.notes, createdAt: r.created_at,
});

export const accountPaymentToDb = p => ({
  id: p.id, customer_id: p.customerId, sale_id: p.saleId,
  amount: p.amount, type: p.type, payment_method: p.paymentMethod,
  date: p.date, notes: p.notes,
});

export const dbToFaqEntry = r => ({ id: r.id, question: r.question, answer: r.answer, createdAt: r.created_at });
export const faqEntryToDb = e => ({ id: e.id, question: e.question, answer: e.answer });

export const dbToFaqMissed = r => ({ id: r.id, question: r.question, date: r.created_at });

export const dbToStockMovement = r => ({
  id: r.id, productId: r.product_id, productName: r.product_name,
  qty: r.qty, type: r.type, notes: r.notes, createdAt: r.created_at,
});

export const stockMovementToDb = m => ({
  id: m.id, product_id: m.productId, product_name: m.productName,
  qty: m.qty, type: m.type, notes: m.notes,
});

export const dbToCashShift = r => ({
  id: r.id, openedBy: r.opened_by, openedAt: r.opened_at,
  closedAt: r.closed_at, status: r.status, initialCash: r.initial_cash,
  salesCash: r.sales_cash, salesTransfer: r.sales_transfer,
  salesCard: r.sales_card, salesAccount: r.sales_account,
  expensesCash: r.expenses_cash, expectedCash: r.expected_cash,
  countedCash: r.counted_cash, difference: r.difference,
  notes: r.notes, createdAt: r.created_at,
});

export const cashShiftToDb = s => ({
  id: s.id, opened_by: s.openedBy, opened_at: s.openedAt,
  closed_at: s.closedAt, status: s.status, initial_cash: s.initialCash,
  sales_cash: s.salesCash, sales_transfer: s.salesTransfer,
  sales_card: s.salesCard, sales_account: s.salesAccount,
  expenses_cash: s.expensesCash, expected_cash: s.expectedCash,
  counted_cash: s.countedCash, difference: s.difference, notes: s.notes,
});

// ─── PRODUCCIONES & BANCO DE HORAS ────────────────────────────────────────
export const dbToProduction = r => ({
  id: r.id, recipeId: r.recipe_id, createdAt: r.created_at,
});

export const dbToProductionEmployee = r => ({
  id: r.id, productionId: r.production_id, employeeId: r.employee_id,
  role: r.role, hours: r.hours || 0,
});

export const dbToEmployeeHours = r => ({
  employeeId: r.employee_id,
  cookingHours: r.cooking_hours || 0,
  packagingHours: r.packaging_hours || 0,
});
