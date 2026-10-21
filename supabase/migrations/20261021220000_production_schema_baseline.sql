


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accumulate_employee_hours"("p_employee_id" "uuid", "p_cooking_delta" double precision, "p_packaging_delta" double precision) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.accumulate_employee_hours(
    p_employee_id,
    p_cooking_delta,
    p_packaging_delta
  );
$$;


ALTER FUNCTION "public"."accumulate_employee_hours"("p_employee_id" "uuid", "p_cooking_delta" double precision, "p_packaging_delta" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_ingredient_stock"("p_id" "uuid", "p_delta" numeric, "p_unit_cost" numeric DEFAULT NULL::numeric) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
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


ALTER FUNCTION "public"."adjust_ingredient_stock"("p_id" "uuid", "p_delta" numeric, "p_unit_cost" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_product_stock"("p_id" "text", "p_delta" numeric) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
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


ALTER FUNCTION "public"."adjust_product_stock"("p_id" "text", "p_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_production"("p_product_id" "text", "p_qty" numeric, "p_movement_id" "uuid", "p_movement_name" "text", "p_ing_deltas" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_product_stock  numeric;
  v_ing            record;
  v_ing_stock      numeric;
  v_ing_results    jsonb := '[]'::jsonb;
BEGIN

  UPDATE products
  SET stock = stock + p_qty
  WHERE id = p_product_id
  RETURNING stock INTO v_product_stock;

  INSERT INTO stock_movements (id, product_id, product_name, qty, type, notes, created_at)
  VALUES (p_movement_id, p_product_id, p_movement_name, p_qty, 'production', '', NOW());

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


ALTER FUNCTION "public"."apply_production"("p_product_id" "text", "p_qty" numeric, "p_movement_id" "uuid", "p_movement_name" "text", "p_ing_deltas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_order_stocks"("p_restore_deltas" "jsonb", "p_sale_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
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
    UPDATE products
    SET stock = stock + v_prod.delta
    WHERE id = v_prod.id
    RETURNING stock INTO v_new_stock;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('id', v_prod.id, 'stock', v_new_stock)
    );

    INSERT INTO stock_movements (id, product_id, product_name, qty, type, notes, created_at)
    VALUES (gen_random_uuid(), v_prod.id, v_prod.name, v_prod.delta, 'cancelación', 'Pedido ' || p_sale_id, NOW());
  END LOOP;

  RETURN v_results;
END;
$$;


ALTER FUNCTION "public"."cancel_order_stocks"("p_restore_deltas" "jsonb", "p_sale_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_sale_stocks"("p_stock_deltas" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
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


ALTER FUNCTION "public"."complete_sale_stocks"("p_stock_deltas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descontar_stock_pedido"("p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
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


ALTER FUNCTION "public"."descontar_stock_pedido"("p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  BEGIN
    INSERT INTO public.business_users (email, name, domain, role)
    VALUES (
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
      SPLIT_PART(NEW.email, '@', 2),
      CASE WHEN NEW.email ILIKE 'admin%' THEN 'admin' ELSE 'vendor' END
    )
    ON CONFLICT (email) DO NOTHING;
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_customer_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE v_cust text;
BEGIN
  v_cust := COALESCE(NEW.customer_id, OLD.customer_id);
  UPDATE customers SET balance = COALESCE((
    SELECT SUM(CASE WHEN type='payment' THEN amount ELSE -amount END)
    FROM account_payments WHERE customer_id = v_cust
  ), 0) WHERE id = v_cust;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_customer_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ingredients_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ingredients_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."weekly_report"("p_week_start" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  ws date;
  we date;
  prev_ws date;
  prev_we date;
  result jsonb;
BEGIN
  -- Semana: lunes a domingo. Si no se pasa fecha, usa la semana actual.
  ws := COALESCE(p_week_start, date_trunc('week', CURRENT_DATE)::date);
  we := ws + 6;
  prev_ws := ws - 7;
  prev_we := ws - 1;

  SELECT jsonb_build_object(
    'semana', jsonb_build_object('desde', ws, 'hasta', we),
    'generado', now(),

    -- 1. VENTAS DE LA SEMANA
    'ventas', (
      SELECT jsonb_build_object(
        'actual', jsonb_build_object(
          'cantidad', COALESCE(COUNT(*), 0),
          'ingreso', COALESCE(SUM(total), 0),
          'ticket_promedio', ROUND(COALESCE(AVG(total), 0))
        ),
        'anterior', (
          SELECT jsonb_build_object(
            'cantidad', COALESCE(COUNT(*), 0),
            'ingreso', COALESCE(SUM(total), 0),
            'ticket_promedio', ROUND(COALESCE(AVG(total), 0))
          )
          FROM sales
          WHERE status NOT IN ('cancelled')
            AND created_at::date >= prev_ws AND created_at::date <= prev_we
        ),
        'variacion_pct', ROUND(
          CASE WHEN (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status NOT IN ('cancelled') AND created_at::date >= prev_ws AND created_at::date <= prev_we) > 0
          THEN ((COALESCE(SUM(total), 0) - (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status NOT IN ('cancelled') AND created_at::date >= prev_ws AND created_at::date <= prev_we))
            / (SELECT SUM(total) FROM sales WHERE status NOT IN ('cancelled') AND created_at::date >= prev_ws AND created_at::date <= prev_we)) * 100
          ELSE NULL END, 1
        )
      )
      FROM sales
      WHERE status NOT IN ('cancelled')
        AND created_at::date >= ws AND created_at::date <= we
    ),

    -- 2. TOP 10 PRODUCTOS
    'top_productos', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.unidades DESC), '[]'::jsonb)
      FROM (
        SELECT
          item->>'name' as nombre,
          item->>'category' as categoria,
          SUM((item->>'qty')::numeric) as unidades,
          SUM((item->>'subtotal')::numeric) as facturado
        FROM sales, jsonb_array_elements(items) as item
        WHERE status NOT IN ('cancelled')
          AND created_at::date >= ws AND created_at::date <= we
        GROUP BY item->>'name', item->>'category'
        ORDER BY unidades DESC
        LIMIT 10
      ) t
    ),

    -- 3. CLIENTES NUEVOS (primera compra en la semana)
    'clientes_nuevos', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      FROM (
        SELECT customer_id, customer_name, MIN(created_at) as primera_compra
        FROM sales
        WHERE customer_id IS NOT NULL AND status NOT IN ('cancelled')
        GROUP BY customer_id, customer_name
        HAVING MIN(created_at)::date >= ws AND MIN(created_at)::date <= we
        ORDER BY primera_compra
      ) t
    ),

    -- 4. CAMBIOS DE PRECIO EN INGREDIENTES
    'ingredientes_actualizados', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      FROM (
        SELECT name as nombre, unit_cost as costo_actual, unit as unidad, updated_at
        FROM ingredients
        WHERE updated_at::date >= ws AND updated_at::date <= we
          AND updated_at != created_at
        ORDER BY updated_at DESC
      ) t
    ),

    -- 5. GASTOS POR CATEGORÍA
    'gastos', (
      SELECT jsonb_build_object(
        'total', COALESCE(SUM(total), 0),
        'por_categoria', COALESCE((
          SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.total DESC)
          FROM (
            SELECT category as categoria, COUNT(*) as cantidad, SUM(total) as total
            FROM expenses
            WHERE date >= ws AND date <= we
            GROUP BY category
            ORDER BY total DESC
          ) t
        ), '[]'::jsonb)
      )
      FROM expenses
      WHERE date >= ws AND date <= we
    ),

    -- 6. MAYORISTA VS MINORISTA
    'canales', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(price_list, 'retail') as canal,
          COUNT(*) as cantidad,
          SUM(total) as ingreso,
          ROUND(AVG(total)) as ticket_promedio
        FROM sales
        WHERE status NOT IN ('cancelled')
          AND created_at::date >= ws AND created_at::date <= we
        GROUP BY COALESCE(price_list, 'retail')
      ) t
    ),

    -- 7. MÉTODOS DE PAGO
    'metodos_pago', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(payment_method, 'otro') as metodo,
          COUNT(*) as cantidad,
          SUM(total) as total
        FROM sales
        WHERE status NOT IN ('cancelled')
          AND created_at::date >= ws AND created_at::date <= we
        GROUP BY payment_method
        ORDER BY total DESC
      ) t
    ),

    -- 8. CAMBIOS DE PRECIO EN PRODUCTOS (audit_log)
    'cambios_precios_productos', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      FROM (
        SELECT action, detail as detalle, created_at
        FROM audit_log
        WHERE entity = 'producto'
          AND detail ILIKE '%precio%'
          AND created_at::date >= ws AND created_at::date <= we
        ORDER BY created_at DESC
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."weekly_report"("p_week_start" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "text" NOT NULL,
    "sale_id" "text",
    "amount" numeric NOT NULL,
    "type" "text" NOT NULL,
    "payment_method" "text",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."account_payments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."account_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_customers_20260630" (
    "id" "text",
    "name" "text",
    "phone" "text",
    "address" "text",
    "notes" "text",
    "price_list" "text",
    "balance" numeric,
    "discount_pct" numeric,
    "email" "text",
    "cuit" "text",
    "default_billing" boolean
);


ALTER TABLE "public"."backup_customers_20260630" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "domain" "text" NOT NULL,
    "role" "text" DEFAULT 'vendor'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'vendor'::"text", 'cocina'::"text"])))
);


ALTER TABLE "public"."business_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opened_by" "text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "initial_cash" numeric DEFAULT 0 NOT NULL,
    "sales_cash" numeric DEFAULT 0,
    "sales_transfer" numeric DEFAULT 0,
    "sales_card" numeric DEFAULT 0,
    "sales_account" numeric DEFAULT 0,
    "expenses_cash" numeric DEFAULT 0,
    "expected_cash" numeric DEFAULT 0,
    "counted_cash" numeric DEFAULT 0,
    "difference" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."cash_shifts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."cash_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "name" "text" NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_inactive_dismissed" (
    "customer_id" "text" NOT NULL,
    "last_sale_at" "text" NOT NULL,
    "dismissed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dismissed_by" "text" DEFAULT ''::"text" NOT NULL
);

ALTER TABLE ONLY "public"."customer_inactive_dismissed" REPLICA IDENTITY FULL;


ALTER TABLE "public"."customer_inactive_dismissed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "address" "text",
    "notes" "text",
    "price_list" "text" DEFAULT 'retail'::"text",
    "balance" numeric DEFAULT 0,
    "discount_pct" numeric DEFAULT 0,
    "email" "text" DEFAULT ''::"text",
    "cuit" "text" DEFAULT ''::"text",
    "default_billing" boolean DEFAULT false
);

ALTER TABLE ONLY "public"."customers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_hours" (
    "employee_id" "uuid" NOT NULL,
    "cooking_hours" double precision DEFAULT 0 NOT NULL,
    "packaging_hours" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."employee_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "name" "text" NOT NULL
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expense_subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "supplier" "text",
    "concept" "text" NOT NULL,
    "quantity" numeric DEFAULT 1,
    "unit" "text" DEFAULT 'unidades'::"text",
    "unit_price" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "category" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supplier_id" "uuid",
    "ingredient_lines" "jsonb",
    "subcategory" "text"
);

ALTER TABLE ONLY "public"."expenses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faq_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."faq_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faq_missed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."faq_missed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "unit" "text" DEFAULT 'g'::"text" NOT NULL,
    "stock" numeric DEFAULT 0 NOT NULL,
    "stock_min" numeric DEFAULT 0 NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "supplier" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "calories" numeric,
    "protein" numeric,
    "carbs" numeric,
    "fat" numeric,
    "fiber" numeric,
    "sugar" numeric,
    "sodium" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."ingredients" REPLICA IDENTITY FULL;


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "involved" "text",
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "production_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "hours" double precision DEFAULT 0 NOT NULL,
    CONSTRAINT "production_employees_role_check" CHECK (("role" = ANY (ARRAY['cooking'::"text", 'packaging'::"text"])))
);


ALTER TABLE "public"."production_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_kanban" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "qty_requested" integer DEFAULT 0 NOT NULL,
    "qty_stock" integer DEFAULT 0 NOT NULL,
    "qty_to_produce" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stock_updated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "production_kanban_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'ready'::"text"])))
);


ALTER TABLE "public"."production_kanban" OWNER TO "postgres";


COMMENT ON TABLE "public"."production_kanban" IS 'Tarjetas del Kanban de producción para cocina. status: pending → in_progress → ready. Al pasar a ready se incrementa el stock del producto (stock_updated = true). Al volver atrás, se revierte. El tablero se limpia manualmente por un admin (las filas se eliminan, sin revertir stock).';



CREATE TABLE IF NOT EXISTS "public"."productions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "batches" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."productions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "price_retail" numeric DEFAULT 0,
    "price_wholesale" numeric DEFAULT 0,
    "unit" "text" DEFAULT 'unit'::"text",
    "stock" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "photo" "text",
    "description" "text",
    "kit_items" "jsonb" DEFAULT '[]'::"jsonb",
    "is_favorite" boolean DEFAULT false NOT NULL,
    "show_in_menu" boolean DEFAULT false NOT NULL,
    "freezable" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."products" REPLICA IDENTITY FULL;


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."freezable" IS 'El producto es APTO PARA FREEZER. Es una propiedad del producto, no su estado de venta: no indica si hoy se vende fresco o congelado.';



CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "text" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "qty" numeric NOT NULL,
    "unit" "text",
    "cost" numeric DEFAULT 0
);

ALTER TABLE ONLY "public"."recipe_ingredients" REPLICA IDENTITY FULL;


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "text" NOT NULL,
    "product_id" "text",
    "prep_time" integer DEFAULT 0,
    "cook_time" integer DEFAULT 0,
    "yield" integer DEFAULT 1,
    "notes" "text",
    "steps" "jsonb" DEFAULT '[]'::"jsonb",
    "min_margin" numeric,
    "needs_review" boolean DEFAULT false NOT NULL,
    "review_reason" "text",
    "packaging_time" integer DEFAULT 0 NOT NULL,
    "is_favorite" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."recipes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "text" NOT NULL,
    "customer_id" "text",
    "customer_name" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "total" numeric DEFAULT 0,
    "price_list" "text" DEFAULT 'retail'::"text",
    "payment_method" "text",
    "status" "text" DEFAULT 'open'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "discount_type" "text" DEFAULT 'pct'::"text",
    "discount_value" numeric DEFAULT 0,
    "discount_amount" numeric DEFAULT 0,
    "delivery_date" "date",
    "needs_billing" boolean DEFAULT false,
    "billing_status" "text",
    "paid_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."sales" REPLICA IDENTITY FULL;


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "qty" numeric NOT NULL,
    "type" "text" DEFAULT 'production'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."stock_movements" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "expense_id" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "type" "text" NOT NULL,
    "payment_method" "text",
    "date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."supplier_payments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."supplier_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."suppliers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vianda_plan_items" (
    "id" "text" NOT NULL,
    "plan_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "forecast_qty" numeric DEFAULT 0 NOT NULL,
    "recommended_qty" numeric DEFAULT 0 NOT NULL,
    "produced_qty" numeric,
    "actual_qty" numeric,
    "confidence" "text",
    "forecast_detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vianda_plan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vianda_plans" (
    "id" "text" NOT NULL,
    "week_start" "date" NOT NULL,
    "safety_margin_pct" numeric DEFAULT 18 NOT NULL,
    "notes" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_level_pct" numeric DEFAULT 90 NOT NULL
);


ALTER TABLE "public"."vianda_plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vianda_plans"."service_level_pct" IS 'Nivel de servicio objetivo: % de días en que la producción del día debe alcanzar para cubrir la demanda. Reemplaza a safety_margin_pct, que queda por compatibilidad.';



CREATE TABLE IF NOT EXISTS "public"."weekly_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "product_id" "text",
    "product_name" "text" NOT NULL,
    "target_qty" numeric DEFAULT 0 NOT NULL,
    "unit_label" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "days" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weekly_menus_days_is_object" CHECK (("jsonb_typeof"("days") = 'object'::"text")),
    CONSTRAINT "weekly_menus_starts_monday" CHECK ((EXTRACT(isodow FROM "week_start") = (1)::numeric))
);


ALTER TABLE "public"."weekly_menus" OWNER TO "postgres";


COMMENT ON TABLE "public"."weekly_menus" IS 'Planificacion de almuerzos y cenas, de lunes a viernes. week_start siempre es lunes.';



ALTER TABLE ONLY "public"."account_payments"
    ADD CONSTRAINT "account_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."business_users"
    ADD CONSTRAINT "business_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."customer_inactive_dismissed"
    ADD CONSTRAINT "customer_inactive_dismissed_pkey" PRIMARY KEY ("customer_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_hours"
    ADD CONSTRAINT "employee_hours_pkey" PRIMARY KEY ("employee_id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."expense_subcategories"
    ADD CONSTRAINT "expense_subcategories_name_category_name_key" UNIQUE ("name", "category_name");



ALTER TABLE ONLY "public"."expense_subcategories"
    ADD CONSTRAINT "expense_subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faq_entries"
    ADD CONSTRAINT "faq_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faq_missed"
    ADD CONSTRAINT "faq_missed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_employees"
    ADD CONSTRAINT "production_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_kanban"
    ADD CONSTRAINT "production_kanban_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productions"
    ADD CONSTRAINT "productions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vianda_plan_items"
    ADD CONSTRAINT "vianda_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vianda_plans"
    ADD CONSTRAINT "vianda_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vianda_plans"
    ADD CONSTRAINT "vianda_plans_week_start_key" UNIQUE ("week_start");



ALTER TABLE ONLY "public"."weekly_goals"
    ADD CONSTRAINT "weekly_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_menus"
    ADD CONSTRAINT "weekly_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_menus"
    ADD CONSTRAINT "weekly_menus_week_start_key" UNIQUE ("week_start");



CREATE UNIQUE INDEX "uniq_ap_sale_charge" ON "public"."account_payments" USING "btree" ("sale_id") WHERE (("type" = 'charge'::"text") AND ("sale_id" IS NOT NULL));



CREATE UNIQUE INDEX "uniq_sp_expense_charge" ON "public"."supplier_payments" USING "btree" ("expense_id") WHERE (("type" = 'charge'::"text") AND ("expense_id" IS NOT NULL));



CREATE INDEX "vianda_plan_items_date_idx" ON "public"."vianda_plan_items" USING "btree" ("date");



CREATE UNIQUE INDEX "vianda_plan_items_date_product_uidx" ON "public"."vianda_plan_items" USING "btree" ("date", "product_id");



CREATE INDEX "vianda_plan_items_plan_idx" ON "public"."vianda_plan_items" USING "btree" ("plan_id");



CREATE OR REPLACE TRIGGER "trg_ingredients_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredients_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_customer_balance" AFTER INSERT OR DELETE OR UPDATE ON "public"."account_payments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_customer_balance"();



ALTER TABLE ONLY "public"."employee_hours"
    ADD CONSTRAINT "employee_hours_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."business_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."production_employees"
    ADD CONSTRAINT "production_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."business_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_employees"
    ADD CONSTRAINT "production_employees_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."productions"
    ADD CONSTRAINT "productions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."vianda_plan_items"
    ADD CONSTRAINT "vianda_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."vianda_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_goals"
    ADD CONSTRAINT "weekly_goals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_menus"
    ADD CONSTRAINT "weekly_menus_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admin: actualizar dominio" ON "public"."business_users" FOR UPDATE USING (((("auth"."jwt"() ->> 'email'::"text") ~~* 'admin%'::"text") AND ("domain" = "split_part"(("auth"."jwt"() ->> 'email'::"text"), '@'::"text", 2))));



CREATE POLICY "Admin: eliminar dominio" ON "public"."business_users" FOR DELETE USING (((("auth"."jwt"() ->> 'email'::"text") ~~* 'admin%'::"text") AND ("domain" = "split_part"(("auth"."jwt"() ->> 'email'::"text"), '@'::"text", 2))));



CREATE POLICY "Admin: leer dominio" ON "public"."business_users" FOR SELECT USING (((("auth"."jwt"() ->> 'email'::"text") ~~* 'admin%'::"text") AND ("domain" = "split_part"(("auth"."jwt"() ->> 'email'::"text"), '@'::"text", 2))));



CREATE POLICY "Admin: leer employee_hours" ON "public"."employee_hours" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") ~~* 'admin%'::"text"));



CREATE POLICY "Autenticados pueden insertar notas" ON "public"."internal_notes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Autenticados pueden leer notas" ON "public"."internal_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Autenticados: insertar producción" ON "public"."productions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Autenticados: insertar production_employees" ON "public"."production_employees" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Autenticados: leer producciones" ON "public"."productions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Autenticados: leer production_employees" ON "public"."production_employees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Propio registro: acceso total" ON "public"."business_users" USING ((("auth"."jwt"() ->> 'email'::"text") = "email")) WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = "email"));



CREATE POLICY "Usuarios activos pueden actualizar menus semanales" ON "public"."weekly_menus" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))) AND ("bu"."active" = true) AND ("bu"."role" = ANY (ARRAY['admin'::"text", 'vendor'::"text", 'cocina'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))) AND ("bu"."active" = true) AND ("bu"."role" = ANY (ARRAY['admin'::"text", 'vendor'::"text", 'cocina'::"text"]))))));



CREATE POLICY "Usuarios activos pueden crear menus semanales" ON "public"."weekly_menus" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))) AND ("bu"."active" = true) AND ("bu"."role" = ANY (ARRAY['admin'::"text", 'vendor'::"text", 'cocina'::"text"])))))));



CREATE POLICY "Usuarios activos pueden eliminar menus semanales" ON "public"."weekly_menus" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))) AND ("bu"."active" = true) AND ("bu"."role" = ANY (ARRAY['admin'::"text", 'vendor'::"text", 'cocina'::"text"]))))));



CREATE POLICY "Usuarios activos pueden leer menus semanales" ON "public"."weekly_menus" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."business_users" "bu"
  WHERE (("bu"."email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))) AND ("bu"."active" = true) AND ("bu"."role" = ANY (ARRAY['admin'::"text", 'vendor'::"text", 'cocina'::"text"]))))));



ALTER TABLE "public"."account_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow all" ON "public"."ingredients" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_account_payments" ON "public"."account_payments" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_categories" ON "public"."categories" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_customers" ON "public"."customers" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_expense_categories" ON "public"."expense_categories" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_expenses" ON "public"."expenses" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_ingredients" ON "public"."ingredients" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_products" ON "public"."products" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_recipes" ON "public"."recipes" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_sales" ON "public"."sales" USING (true) WITH CHECK (true);



CREATE POLICY "anon_read_active_products" ON "public"."products" FOR SELECT TO "anon" USING (("show_in_menu" = true));



CREATE POLICY "anon_read_categories" ON "public"."categories" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_full_access" ON "public"."customer_inactive_dismissed" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access" ON "public"."vianda_plan_items" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access" ON "public"."vianda_plans" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_read_all_categories" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_read_all_products" ON "public"."products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated full access" ON "public"."weekly_goals" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_rw" ON "public"."production_kanban" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."backup_customers_20260630" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_inactive_dismissed" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_subcategories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."faq_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."faq_missed" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insertar_propio" ON "public"."audit_log" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."internal_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leer_autenticados" ON "public"."audit_log" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."production_employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_kanban" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."productions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solo_autenticados" ON "public"."account_payments" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."app_settings" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."cash_shifts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."categories" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."customers" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."expense_categories" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."expense_subcategories" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."expenses" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."faq_entries" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."faq_missed" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."ingredients" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."products" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."recipe_ingredients" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."recipes" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."sales" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."stock_movements" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."supplier_payments" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "solo_autenticados" ON "public"."suppliers" USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vianda_plan_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vianda_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_menus" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accumulate_employee_hours"("p_employee_id" "uuid", "p_cooking_delta" double precision, "p_packaging_delta" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accumulate_employee_hours"("p_employee_id" "uuid", "p_cooking_delta" double precision, "p_packaging_delta" double precision) TO "authenticated";




REVOKE ALL ON FUNCTION "public"."adjust_ingredient_stock"("p_id" "uuid", "p_delta" numeric, "p_unit_cost" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock"("p_id" "uuid", "p_delta" numeric, "p_unit_cost" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock"("p_id" "uuid", "p_delta" numeric, "p_unit_cost" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_product_stock"("p_id" "text", "p_delta" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_product_stock"("p_id" "text", "p_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_product_stock"("p_id" "text", "p_delta" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_production"("p_product_id" "text", "p_qty" numeric, "p_movement_id" "uuid", "p_movement_name" "text", "p_ing_deltas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_production"("p_product_id" "text", "p_qty" numeric, "p_movement_id" "uuid", "p_movement_name" "text", "p_ing_deltas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_production"("p_product_id" "text", "p_qty" numeric, "p_movement_id" "uuid", "p_movement_name" "text", "p_ing_deltas" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_order_stocks"("p_restore_deltas" "jsonb", "p_sale_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_order_stocks"("p_restore_deltas" "jsonb", "p_sale_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order_stocks"("p_restore_deltas" "jsonb", "p_sale_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_sale_stocks"("p_stock_deltas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_sale_stocks"("p_stock_deltas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_sale_stocks"("p_stock_deltas" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."descontar_stock_pedido"("p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."descontar_stock_pedido"("p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_auth_user"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."sync_customer_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_customer_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_customer_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."weekly_report"("p_week_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."weekly_report"("p_week_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."weekly_report"("p_week_start" "date") TO "service_role";



GRANT ALL ON TABLE "public"."account_payments" TO "anon";
GRANT ALL ON TABLE "public"."account_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."account_payments" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."backup_customers_20260630" TO "service_role";



GRANT ALL ON TABLE "public"."business_users" TO "anon";
GRANT ALL ON TABLE "public"."business_users" TO "authenticated";
GRANT ALL ON TABLE "public"."business_users" TO "service_role";



GRANT ALL ON TABLE "public"."cash_shifts" TO "anon";
GRANT ALL ON TABLE "public"."cash_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."customer_inactive_dismissed" TO "anon";
GRANT ALL ON TABLE "public"."customer_inactive_dismissed" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_inactive_dismissed" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."employee_hours" TO "anon";
GRANT ALL ON TABLE "public"."employee_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_hours" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expense_subcategories" TO "anon";
GRANT ALL ON TABLE "public"."expense_subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."faq_entries" TO "anon";
GRANT ALL ON TABLE "public"."faq_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."faq_entries" TO "service_role";



GRANT ALL ON TABLE "public"."faq_missed" TO "anon";
GRANT ALL ON TABLE "public"."faq_missed" TO "authenticated";
GRANT ALL ON TABLE "public"."faq_missed" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."internal_notes" TO "anon";
GRANT ALL ON TABLE "public"."internal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_notes" TO "service_role";



GRANT ALL ON TABLE "public"."production_employees" TO "anon";
GRANT ALL ON TABLE "public"."production_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."production_employees" TO "service_role";



GRANT ALL ON TABLE "public"."production_kanban" TO "anon";
GRANT ALL ON TABLE "public"."production_kanban" TO "authenticated";
GRANT ALL ON TABLE "public"."production_kanban" TO "service_role";



GRANT ALL ON TABLE "public"."productions" TO "anon";
GRANT ALL ON TABLE "public"."productions" TO "authenticated";
GRANT ALL ON TABLE "public"."productions" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payments" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."vianda_plan_items" TO "anon";
GRANT ALL ON TABLE "public"."vianda_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."vianda_plan_items" TO "service_role";



GRANT ALL ON TABLE "public"."vianda_plans" TO "anon";
GRANT ALL ON TABLE "public"."vianda_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."vianda_plans" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_goals" TO "anon";
GRANT ALL ON TABLE "public"."weekly_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_goals" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_menus" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
