-- =============================================================
-- Nutrifree POS — Row Level Security + Audit Log
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================

-- ─── 1. Habilitar RLS en todas las tablas ────────────────────
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales              ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements    ENABLE ROW LEVEL SECURITY;

-- Proveedores (si existen)
ALTER TABLE suppliers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments  ENABLE ROW LEVEL SECURITY;

-- ─── 2. Políticas: solo usuarios autenticados ─────────────────
-- Una política por tabla permitiendo todas las operaciones a usuarios autenticados.

CREATE POLICY "solo_autenticados" ON products
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON customers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON sales
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON recipes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON recipe_ingredients
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON ingredients
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON expenses
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON categories
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON expense_categories
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON account_payments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON stock_movements
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON suppliers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "solo_autenticados" ON supplier_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 3. Tabla audit_log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text NOT NULL,
  action      text NOT NULL,   -- 'sale', 'production', 'delete', 'view', etc.
  entity      text NOT NULL,   -- 'sales', 'products', 'ingredients', etc.
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS en audit_log: usuarios autenticados pueden insertar y leer
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insertar_propio" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "leer_autenticados" ON audit_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── 4. Configuración de Supabase Auth (manual en Dashboard) ──
-- Dashboard → Authentication → Settings:
--   • Deshabilitar "Allow new user signups"
-- Dashboard → Authentication → Users → "Invite user":
--   • Crear usuarios manualmente
-- Dashboard → Authentication → Users → editar usuario → User Metadata:
--   • { "role": "admin" }   ← para administradores
--   • { "role": "vendor" }  ← para vendedores
