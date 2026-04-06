-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECCIONES DE CONCURRENCIA — NutriFree POS
--
-- Ejecutar este script en el SQL Editor de Supabase.
-- Estas funciones reemplazan las operaciones de lectura-modificación-escritura
-- separadas por actualizaciones ATÓMICAS (stock = stock + delta), eliminando
-- las race conditions entre múltiples usuarios simultáneos.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. PRODUCCIÓN: incrementa stock de producto + registra movimiento +
--    descuenta ingredientes. Todo en una sola transacción atómica.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_production(
  p_product_id    text,
  p_qty           numeric,
  p_movement_id   uuid,
  p_movement_name text,
  p_ing_deltas    jsonb    -- [{"id": "<uuid>", "delta": <numeric>}, ...]
)
RETURNS jsonb              -- {"product_stock": N, "ingredient_stocks": [{"id":..., "stock":...}]}
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_stock  numeric;
  v_ing            record;
  v_ing_stock      numeric;
  v_ing_results    jsonb := '[]'::jsonb;
BEGIN
  -- 1. Incrementar stock del producto de forma relativa
  UPDATE products
  SET stock = stock + p_qty
  WHERE id = p_product_id
  RETURNING stock INTO v_product_stock;

  -- 2. Registrar movimiento de stock
  INSERT INTO stock_movements (id, product_id, product_name, qty, type, notes, created_at)
  VALUES (p_movement_id, p_product_id, p_movement_name, p_qty, 'production', '', NOW());

  -- 3. Decrementar stock de cada ingrediente de forma relativa
  FOR v_ing IN
    SELECT x.id, x.delta
    FROM jsonb_to_recordset(COALESCE(p_ing_deltas, '[]'::jsonb)) AS x(id uuid, delta numeric)
  LOOP
    UPDATE ingredients
    SET stock = stock - v_ing.delta
    WHERE id = v_ing.id
    RETURNING stock INTO v_ing_stock;

    v_ing_results := v_ing_results || jsonb_build_array(
      jsonb_build_object('id', v_ing.id, 'stock', v_ing_stock)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'product_stock',     v_product_stock,
    'ingredient_stocks', v_ing_results
  );
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. VENTA: descuenta stock de productos de forma atómica y relativa.
--    Usa GREATEST(0, ...) para no dejar stock negativo.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_sale_stocks(
  p_stock_deltas jsonb   -- [{"id": "<text>", "delta": <numeric>}, ...]
)
RETURNS jsonb            -- [{"id": "<text>", "stock": <numeric>}, ...]
LANGUAGE plpgsql
AS $$
DECLARE
  v_prod      record;
  v_new_stock numeric;
  v_results   jsonb := '[]'::jsonb;
BEGIN
  FOR v_prod IN
    SELECT x.id, x.delta
    FROM jsonb_to_recordset(COALESCE(p_stock_deltas, '[]'::jsonb)) AS x(id text, delta numeric)
  LOOP
    UPDATE products
    SET stock = GREATEST(0, stock - v_prod.delta)
    WHERE id = v_prod.id
    RETURNING stock INTO v_new_stock;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('id', v_prod.id, 'stock', v_new_stock)
    );
  END LOOP;

  RETURN v_results;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. CANCELACIÓN DE PEDIDO: restaura stock + registra movimientos.
--    Todo en una sola transacción atómica.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_order_stocks(
  p_restore_deltas jsonb,  -- [{"id": "<text>", "delta": <numeric>, "name": "<text>"}, ...]
  p_sale_id        text
)
RETURNS jsonb              -- [{"id": "<text>", "stock": <numeric>}, ...]
LANGUAGE plpgsql
AS $$
DECLARE
  v_prod      record;
  v_new_stock numeric;
  v_results   jsonb := '[]'::jsonb;
BEGIN
  FOR v_prod IN
    SELECT x.id, x.delta, x.name
    FROM jsonb_to_recordset(COALESCE(p_restore_deltas, '[]'::jsonb)) AS x(id text, delta numeric, name text)
  LOOP
    -- Restaurar stock de forma relativa
    UPDATE products
    SET stock = stock + v_prod.delta
    WHERE id = v_prod.id
    RETURNING stock INTO v_new_stock;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('id', v_prod.id, 'stock', v_new_stock)
    );

    -- Registrar movimiento de cancelación
    INSERT INTO stock_movements (id, product_id, product_name, qty, type, notes, created_at)
    VALUES (gen_random_uuid(), v_prod.id, v_prod.name, v_prod.delta, 'cancelación', 'Pedido ' || p_sale_id, NOW());
  END LOOP;

  RETURN v_results;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. INGREDIENTE: ajuste relativo de stock (y opcionalmente unit_cost).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_ingredient_stock(
  p_id        uuid,
  p_delta     numeric,
  p_unit_cost numeric DEFAULT NULL
)
RETURNS numeric   -- nuevo stock
LANGUAGE plpgsql
AS $$
DECLARE v_stock numeric;
BEGIN
  UPDATE ingredients
  SET
    stock     = stock + p_delta,
    unit_cost = COALESCE(p_unit_cost, unit_cost)
  WHERE id = p_id
  RETURNING stock INTO v_stock;
  RETURN v_stock;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. CLIENTE: ajuste relativo de balance (cuenta corriente).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_customer_balance(p_id text, p_delta numeric)
RETURNS numeric   -- nuevo balance
LANGUAGE plpgsql
AS $$
DECLARE v_balance numeric;
BEGIN
  UPDATE customers
  SET balance = balance + p_delta
  WHERE id = p_id
  RETURNING balance INTO v_balance;
  RETURN v_balance;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- Permisos: permitir que usuarios autenticados ejecuten las funciones
-- ───────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION apply_production         TO authenticated;
GRANT EXECUTE ON FUNCTION complete_sale_stocks     TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_order_stocks      TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_ingredient_stock  TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_customer_balance  TO authenticated;
