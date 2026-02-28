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
});

export const customerToDb = c => ({
  id: c.id, name: c.name, phone: c.phone, address: c.address,
  notes: c.notes, price_list: c.priceList, balance: c.balance,
});

export const dbToSale = r => ({
  id: r.id, customerId: r.customer_id, customerName: r.customer_name,
  items: r.items, total: r.total, priceList: r.price_list,
  paymentMethod: r.payment_method, status: r.status, notes: r.notes,
  createdAt: r.created_at,
});

export const saleToDb = s => ({
  id: s.id, customer_id: s.customerId, customer_name: s.customerName,
  items: s.items, total: s.total, price_list: s.priceList,
  payment_method: s.paymentMethod, status: s.status, notes: s.notes,
  created_at: s.createdAt,
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
