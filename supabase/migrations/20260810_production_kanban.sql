-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo de Producción Kanban
-- Tablero de elaboración para cocina: consolidación de pedidos → tarjetas Kanban
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_kanban (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      TEXT         NOT NULL,
  product_name    TEXT         NOT NULL,
  qty_requested   INTEGER      NOT NULL DEFAULT 0,   -- total solicitado en pedidos activos
  qty_stock       INTEGER      NOT NULL DEFAULT 0,   -- stock al momento de crear/actualizar
  qty_to_produce  INTEGER      NOT NULL DEFAULT 0,   -- max(0, qty_requested - qty_stock)
  status          TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'in_progress', 'ready')),
  stock_updated   BOOLEAN      NOT NULL DEFAULT false, -- true cuando se sumó stock al pasar a 'ready'
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE production_kanban ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden leer y escribir (admin y cocina operan el tablero)
CREATE POLICY "authenticated_rw" ON production_kanban
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE production_kanban IS
  'Tarjetas del Kanban de producción para cocina. status: pending → in_progress → ready. Al pasar a ready se incrementa el stock del producto (stock_updated = true). Al volver atrás, se revierte. El tablero se limpia manualmente por un admin (las filas se eliminan, sin revertir stock).';
