-- Unifica el modelo de descuento de stock de ventas y pedidos.
--
-- Contexto: había dos modelos coexistiendo (descontar al crear la venta vs.
-- descontar al pasar a "Listo para Retirar"), lo que dejaba pedidos cerrados
-- sin descontar stock —típicamente los de cuenta corriente, que se cobran desde
-- la página de Pedidos sin pasar por el Kanban—, dobles descuentos y
-- restauraciones de stock que nunca se había descontado.
-- El modelo único ahora es: se descuenta al pasar a "ready" (o al cerrar, si el
-- pedido nunca pasó por ahí). La lógica de cliente vive en src/utils/stock.js.
--
-- Esta migración corrige las dos RPC de descuento, que tenían políticas
-- opuestas ante falta de stock, y arregla el tipo de qty.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. complete_sale_stocks (operación interna: POS, pedidos)
--    Sigue sin lanzar excepción —marcar un pedido como listo no debe
--    bloquearse por stock— pero ahora INFORMA el faltante en 'shortfall' en
--    lugar de clamparlo a 0 en silencio, y marca con 'missing' los productos
--    inexistentes, que antes se ignoraban sin ningún aviso.
--    El SELECT ... FOR UPDATE bloquea la fila hasta el commit, así que leer el
--    stock previo y actualizarlo sigue siendo atómico frente a concurrencia.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_sale_stocks(
  p_stock_deltas jsonb   -- [{"id": "<text>", "delta": <numeric>}, ...]
)
RETURNS jsonb            -- [{"id","stock","shortfall","missing"}, ...]
LANGUAGE plpgsql
AS $$
DECLARE
  v_prod       record;
  v_prev_stock numeric;
  v_new_stock  numeric;
  v_results    jsonb := '[]'::jsonb;
BEGIN
  FOR v_prod IN
    SELECT x.id, x.delta
    FROM jsonb_to_recordset(COALESCE(p_stock_deltas, '[]'::jsonb)) AS x(id text, delta numeric)
  LOOP
    SELECT stock INTO v_prev_stock FROM products WHERE id = v_prod.id FOR UPDATE;

    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('id', v_prod.id, 'missing', true)
      );
      CONTINUE;
    END IF;

    UPDATE products
    SET stock = GREATEST(0, v_prev_stock - v_prod.delta)
    WHERE id = v_prod.id
    RETURNING stock INTO v_new_stock;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'id',        v_prod.id,
        'stock',     v_new_stock,
        'shortfall', GREATEST(0, v_prod.delta - v_prev_stock),
        'missing',   false
      )
    );
  END LOOP;

  RETURN v_results;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. descontar_stock_pedido (pago web aprobado por MercadoPago)
--    Acá SÍ corresponde fallar: el pedido ya está pagado y sin stock hay que
--    reembolsar, cosa que el webhook hace al capturar la excepción.
--    Cambios: qty pasa de int a numeric para no redondear en el cast antes de
--    comparar contra el stock disponible. Ojo: products.stock es integer, así
--    que el valor guardado se redondea igual — esto no habilita cantidades
--    fraccionarias, solo hace correcta la comparación.
--    Se distingue además "producto inexistente" de "sin stock", que antes daban
--    el mismo mensaje engañoso.
--    products.id es TEXT (los genera uid() en el front, no son UUID): comparar
--    contra ::uuid rompe la función.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION descontar_stock_pedido(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item     jsonb;
  v_qty    numeric;
  v_id     text;
  v_exists boolean;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (item->>'qty')::numeric;
    v_id  := item->>'id';

    -- SELECT INTO deja la variable en NULL si no hay filas, así que se resetea
    -- en cada vuelta del loop.
    SELECT true INTO v_exists FROM products WHERE id = v_id;
    IF v_exists IS NULL THEN
      RAISE EXCEPTION 'Producto inexistente: %', item->>'name';
    END IF;

    UPDATE products
    SET stock = stock - v_qty
    WHERE id = v_id
      AND stock >= v_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sin stock suficiente para: %', item->>'name';
    END IF;
  END LOOP;
END;
$$;
