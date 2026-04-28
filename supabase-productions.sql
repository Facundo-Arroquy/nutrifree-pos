-- =============================================================
-- Nutrifree POS — Producción y Banco de Horas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================

-- ─── 1. Alter recipes: agregar tiempo de empaque ──────────────
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS packaging_time INT NOT NULL DEFAULT 0;

-- ─── 2. Tabla: productions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS productions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  TEXT        REFERENCES recipes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE productions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados: insertar producción"
  ON productions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados: leer producciones"
  ON productions FOR SELECT TO authenticated USING (true);

-- ─── 3. Tabla: production_employees ───────────────────────────
-- Nota: se agrega columna `hours` para registrar las horas acreditadas
-- al momento de la producción. Evita recalcular en reportes.
CREATE TABLE IF NOT EXISTS production_employees (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID  NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  employee_id   UUID  NOT NULL REFERENCES business_users(id) ON DELETE CASCADE,
  role          TEXT  NOT NULL CHECK (role IN ('cooking', 'packaging')),
  hours         FLOAT NOT NULL DEFAULT 0
);

ALTER TABLE production_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados: insertar production_employees"
  ON production_employees FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados: leer production_employees"
  ON production_employees FOR SELECT TO authenticated USING (true);

-- ─── 4. Tabla: employee_hours ─────────────────────────────────
-- Una fila por empleado. Acumula horas totales de cocina y empaque.
CREATE TABLE IF NOT EXISTS employee_hours (
  employee_id      UUID  PRIMARY KEY REFERENCES business_users(id) ON DELETE CASCADE,
  cooking_hours    FLOAT NOT NULL DEFAULT 0,
  packaging_hours  FLOAT NOT NULL DEFAULT 0
);

ALTER TABLE employee_hours ENABLE ROW LEVEL SECURITY;

-- Solo admin puede leer (visibilidad del banco de horas)
CREATE POLICY "Admin: leer employee_hours"
  ON employee_hours FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') ILIKE 'admin%');

-- ─── 5. Función RPC: acumular horas ───────────────────────────
-- SECURITY DEFINER bypasea RLS para INSERT/UPDATE en employee_hours.
-- Llamada desde el cliente (anon key). Acepta deltas negativos para descuentos.
CREATE OR REPLACE FUNCTION accumulate_employee_hours(
  p_employee_id     UUID,
  p_cooking_delta   FLOAT,
  p_packaging_delta FLOAT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO employee_hours (employee_id, cooking_hours, packaging_hours)
  VALUES (p_employee_id, p_cooking_delta, p_packaging_delta)
  ON CONFLICT (employee_id) DO UPDATE
    SET cooking_hours   = employee_hours.cooking_hours   + EXCLUDED.cooking_hours,
        packaging_hours = employee_hours.packaging_hours + EXCLUDED.packaging_hours;
END;
$$;

GRANT EXECUTE ON FUNCTION accumulate_employee_hours TO authenticated;
