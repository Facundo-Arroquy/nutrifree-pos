-- adjust_product_stock nunca se había aplicado a producción, pero
-- ProductionLogPage la llama para sumar stock al registrar una producción
-- manual. La llamada fallaba ("function does not exist"), y como el error se
-- propaga al catch, la producción quedaba registrada y las horas acumuladas,
-- pero el stock del producto NO subía ni se registraba el movimiento de stock.
--
-- Ya estaba definida en supabase-concurrency-fixes.sql; esta migración la deja
-- efectivamente aplicada. Ajuste relativo para que dos producciones o ventas
-- simultáneas no se pisen.
CREATE OR REPLACE FUNCTION adjust_product_stock(
  p_id    text,
  p_delta numeric
)
RETURNS numeric   -- nuevo stock
LANGUAGE plpgsql
AS $$
DECLARE v_stock numeric;
BEGIN
  UPDATE products
  SET stock = stock + p_delta
  WHERE id = p_id
  RETURNING stock INTO v_stock;
  RETURN v_stock;
END;
$$;
