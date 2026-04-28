-- Tabla: internal_notes
-- Notas / Fichas internas de uso exclusivo para administradores.
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS internal_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  text        NOT NULL,
  involved    text,
  description text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: solo usuarios autenticados pueden leer/escribir sus propias notas.
-- Como la validación de rol es a nivel de aplicación, aquí habilitamos RLS
-- y permitimos acceso solo a sesiones autenticadas.
ALTER TABLE internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden leer notas"
  ON internal_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados pueden insertar notas"
  ON internal_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);
