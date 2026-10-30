-- =============================================================
-- Migración: Subcategorías de gastos
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1. Nueva tabla expense_subcategories
CREATE TABLE IF NOT EXISTS expense_subcategories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  category_name text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, category_name)
);

-- 2. RLS
ALTER TABLE expense_subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solo_autenticados" ON expense_subcategories
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. Columna subcategory en expenses (nivel de gasto, para categorías no-Ingredientes)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS subcategory text;

-- 4. La subcategoría por línea de ingredientes queda dentro de ingredient_lines (jsonb),
--    no requiere cambio de schema. Cada objeto del array puede tener el campo "subcategory".
