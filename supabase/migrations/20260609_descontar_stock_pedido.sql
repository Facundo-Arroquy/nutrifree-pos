-- Descuenta stock de múltiples productos en una sola transacción.
-- Lanza excepción si algún producto no tiene stock suficiente (el webhook lo captura y reembolsa).
CREATE OR REPLACE FUNCTION descontar_stock_pedido(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    UPDATE products
    SET stock = stock - (item->>'qty')::int
    WHERE id = (item->>'id')::uuid
      AND stock >= (item->>'qty')::int;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sin stock suficiente para: %', item->>'name';
    END IF;
  END LOOP;
END;
$$;
