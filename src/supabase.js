import { createClient } from "@supabase/supabase-js";

// ─── STEP 4: Paste your values from Supabase > Project Settings > API ──────
const SUPABASE_URL  = "https://lasiauvrppslxumksggz.supabase.co";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhc2lhdXZycHBzbHh1bWtzZ2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDk1MTEsImV4cCI6MjA4Nzg4NTUxMX0.-HYGsPvzMzff3DDppOrwBllgM05kUuMM38l1jGbI1to";
// ────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── MAPPERS: DB (snake_case) ↔ App (camelCase) ───────────────────────────

export const dbToProduct = r => ({
  id: r.id, name: r.name, category: r.category,
  priceRetail: r.price_retail, priceWholesale: r.price_wholesale,
  unit: r.unit, stock: r.stock, active: r.active,
  photo: r.photo, description: r.description,
});

export const productToDb = p => ({
  id: p.id, name: p.name, category: p.category,
  price_retail: p.priceRetail, price_wholesale: p.priceWholesale,
  unit: p.unit, stock: p.stock, active: p.active,
  photo: p.photo, description: p.description,
});

export const dbToCustomer = r => ({
  id: r.id, name: r.name, phone: r.phone, address: r.address,
  notes: r.notes, priceList: r.price_list, balance: r.balance,
  discountPct: r.discount_pct || 0,
});

export const customerToDb = c => ({
  id: c.id, name: c.name, phone: c.phone, address: c.address,
  notes: c.notes, price_list: c.priceList, balance: c.balance,
  discount_pct: Number(c.discountPct) || 0,
});

export const dbToSale = r => ({
  id: r.id, customerId: r.customer_id, customerName: r.customer_name,
  items: r.items, total: r.total, priceList: r.price_list,
  paymentMethod: r.payment_method, status: r.status, notes: r.notes,
  createdAt: r.created_at,
  discountType: r.discount_type || "pct",
  discountValue: r.discount_value || 0,
  discountAmount: r.discount_amount || 0,
});

export const saleToDb = s => ({
  id: s.id, customer_id: s.customerId, customer_name: s.customerName,
  items: s.items, total: s.total, price_list: s.priceList,
  payment_method: s.paymentMethod, status: s.status, notes: s.notes,
  created_at: s.createdAt,
  discount_type: s.discountType || "pct",
  discount_value: s.discountValue || 0,
  discount_amount: s.discountAmount || 0,
});

export const dbToRecipe = r => ({
  id: r.id, productId: r.product_id, prepTime: r.prep_time,
  cookTime: r.cook_time, yield: r.yield, notes: r.notes,
  ingredients: r.ingredients, steps: r.steps,
});

export const recipeToDb = r => ({
  id: r.id, product_id: r.productId, prep_time: r.prepTime,
  cook_time: r.cookTime, yield: r.yield, notes: r.notes,
  ingredients: r.ingredients, steps: r.steps,
});

export const dbToExpense = r => ({
  id: r.id, date: r.date, supplier: r.supplier, concept: r.concept,
  quantity: r.quantity, unit: r.unit, unitPrice: r.unit_price,
  total: r.total, paymentMethod: r.payment_method,
  paymentStatus: r.payment_status, category: r.category, notes: r.notes,
  createdAt: r.created_at,
});

export const expenseToDb = e => ({
  id: e.id, date: e.date, supplier: e.supplier, concept: e.concept,
  quantity: e.quantity, unit: e.unit, unit_price: e.unitPrice,
  total: e.total, payment_method: e.paymentMethod,
  payment_status: e.paymentStatus, category: e.category, notes: e.notes,
});

export const dbToIngredient = r => ({
  id: r.id, name: r.name, category: r.category, unit: r.unit,
  stock: r.stock, stockMin: r.stock_min, unitCost: r.unit_cost,
  supplier: r.supplier, notes: r.notes, createdAt: r.created_at,
});

export const ingredientToDb = i => ({
  id: i.id, name: i.name, category: i.category, unit: i.unit,
  stock: i.stock, stock_min: i.stockMin, unit_cost: i.unitCost,
  supplier: i.supplier, notes: i.notes,
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
