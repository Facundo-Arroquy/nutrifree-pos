-- Agregar columna batches a productions
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE productions ADD COLUMN IF NOT EXISTS batches INT NOT NULL DEFAULT 1;
