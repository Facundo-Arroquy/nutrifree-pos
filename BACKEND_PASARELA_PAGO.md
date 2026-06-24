# Backend — Pasarela de Pago MercadoPago (rediseño profesional)

> Plan por fases para reescribir el backend del cobro online con foco en
> **consistencia del dinero**, **idempotencia**, **concurrencia segura** y
> **observabilidad**. Diseñado para Supabase (Postgres + Edge Functions Deno).

---

## 0. Principios de diseño

1. **Server-authoritative pricing.** El cliente nunca dicta precios ni totales.
2. **Idempotencia por evento.** Cada interacción con MP usa una clave única e irrepetible.
3. **Single source of truth.** El estado del pago vive en Postgres, no en logs ni en `notes`.
4. **State machine explícita.** Las transiciones de `sales.status` están codificadas en SQL.
5. **Saga + Compensación.** Si una etapa falla, se compensa (refund) de forma persistente y reintenable.
6. **Trust no input.** Validación de firma, validación de monto, validación de stock. Siempre.
7. **Observabilidad de primera clase.** Cada paso del pago se persiste en `payment_events` (event sourcing ligero) para reconciliación.

---

## 1. Modelo de datos

### 1.1 Migraciones nuevas

```sql
-- ── 1) Estado del pago en la sale ───────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN mp_preference_id   text,
  ADD COLUMN mp_payment_id      text,
  ADD COLUMN mp_status          text,           -- approved | rejected | refunded | …
  ADD COLUMN paid_amount        numeric(12,2),
  ADD COLUMN payment_completed_at timestamptz,
  ADD COLUMN refunded_at        timestamptz,
  ADD COLUMN refund_amount      numeric(12,2),
  ADD COLUMN expires_at         timestamptz;    -- TTL del checkout

-- Idempotencia: un payment_id no puede asociarse a 2 sales distintas.
CREATE UNIQUE INDEX sales_mp_payment_id_uniq
  ON sales (mp_payment_id) WHERE mp_payment_id IS NOT NULL;

CREATE INDEX sales_status_created_idx ON sales (status, created_at);

-- ── 2) Event sourcing del pago (auditoría completa) ─────────────────────
CREATE TABLE payment_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  mp_payment_id   text,
  event_type      text NOT NULL,        -- preference_created | webhook_received |
                                        -- payment_approved | payment_rejected |
                                        -- stock_deducted | refund_requested |
                                        -- refund_completed | refund_failed
  payload         jsonb NOT NULL,
  mp_request_id   text,                 -- header x-request-id
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mp_request_id, event_type)    -- evita doble procesamiento del mismo webhook
);

CREATE INDEX payment_events_sale_idx ON payment_events (sale_id, created_at);

-- ── 3) Cola de reembolsos (saga de compensación) ────────────────────────
CREATE TABLE refund_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid NOT NULL REFERENCES sales(id),
  mp_payment_id   text NOT NULL,
  amount          numeric(12,2) NOT NULL,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',  -- pending | done | failed
  attempts        int  NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  done_at         timestamptz,
  UNIQUE (mp_payment_id)
);

-- ── 4) Reserva de stock para evitar el "vendí dos veces el último" ─────
-- Versión simple: contador `reserved` en products que el carrito incrementa
-- al crear la preferencia y decrementa al fallar/expirar.
ALTER TABLE products ADD COLUMN reserved int NOT NULL DEFAULT 0;
-- stock disponible real = stock - reserved
```

### 1.2 RLS (Row-Level Security)

```sql
-- El cliente anónimo NO puede insertar / actualizar / leer sales directamente.
-- Toda la lógica online pasa por Edge Functions con service_role.
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_anon_insert ON sales;
-- (Mantener la policy del POS para usuarios autenticados del staff.)

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_queue   ENABLE ROW LEVEL SECURITY;
-- Sin policies para anon → acceso solo desde service_role.
```

---

## 2. Máquina de estados de `sales` (online)

```
                       (cliente confirma)
                              │
                              ▼
        ┌───────── pending_payment ─────────┐
        │              │                    │
   (paga ok)      (rechazo / timeout)    (cancel)
        │              │                    │
        ▼              ▼                    ▼
     paid          cancelled            cancelled
        │
   (descuento OK)
        │
        ▼
     ready ─── (entregado) ───▶ closed
        │
   (refund)
        ▼
    refunded
```

Codificada en una **función SQL `assert_transition`** que centraliza qué saltos son válidos. Cualquier `UPDATE sales SET status = ...` pasa por ahí.

```sql
CREATE FUNCTION assert_transition(p_from text, p_to text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
    (p_from = 'pending_payment' AND p_to IN ('paid','cancelled')) OR
    (p_from = 'paid'            AND p_to IN ('ready','refunded')) OR
    (p_from = 'ready'           AND p_to IN ('closed','refunded')) OR
    (p_from = 'closed'          AND p_to =  'refunded')
  ) THEN
    RAISE EXCEPTION 'Transición inválida: % → %', p_from, p_to;
  END IF;
END $$;
```

---

## 3. Fases del rediseño

### Fase 1 — Server-authoritative checkout (bloqueante)
**Objetivo:** que ningún precio ni `sale_id` venga del navegador.

**Por qué:** el bug #2 del documento de bugs es la **base de todo fraude posible**. Mientras el frontend dicte precios, cualquier atacante manipula `unit_price` con DevTools (o un proxy) y paga $1 por un pedido de $50.000. Confiar en el cliente es la antítesis del principio "trust no input": el navegador del cliente es por definición territorio hostil. Resolver esto sirve para resolver simultáneamente bug #6 (saleId desde el cliente → cualquiera inserta filas en `sales` con el anon key) y bug #13. La decisión arquitectónica es trasladar la **autoridad de precios y de ID** al servidor (Edge Function + DB), donde el atacante no llega. Costo de no hacerlo: pérdida directa y escalable de dinero.

Pasos:
1. Migración con columnas nuevas en `sales` + `payment_events` (sección 1.1).
2. Reescribir `create-preference`:
   - Recibir `{ items: [{productId, qty}], customerName, phone, deliveryDate }`.
   - Cargar productos desde DB con `service_role`.
   - Validar `active`, `show_in_menu`, `stock - reserved >= qty`, `price_retail > 0`.
   - Calcular `total` en el servidor.
   - **Reservar stock atómicamente** con la RPC `reservar_stock(p_items)` (FOR UPDATE).
   - Insertar `sales` con `status='pending_payment'`, `expires_at = now() + 30 min`.
   - Crear preferencia MP con `external_reference = sale.id` y `expiration_date_to`.
   - Insertar evento `preference_created` en `payment_events`.
3. Quitar el `supabase.from("sales").insert(...)` del `MenuPage.jsx`. El frontend ahora solo recibe `{ init_point, sale_id }`.

Patrón: **Application Service** (orquestación: validación → reserva → persistencia → integración externa) con **Transactional Outbox** (la fila de `payment_events` se guarda en la misma transacción que la `sale`).

### Fase 2 — Webhook seguro e idempotente (bloqueante)
**Objetivo:** ningún POST falso puede tocarnos; ningún POST duplicado puede tocarnos dos veces.

**Por qué:** dos bugs distintos colapsan en una misma solución. (a) Sin verificación de firma, **cualquiera** puede mandar un POST a `/mp-webhook` y marcar ventas como pagadas — equivale a una caja con la puerta abierta. La firma HMAC es lo que prueba criptográficamente que el evento viene de MP. (b) MP reentrega notificaciones con regularidad; sin idempotencia procesamos el mismo pago N veces y duplicamos el descuento de stock y el cambio de estado. El patrón elegido (`UNIQUE(mp_request_id, event_type)` + `pg_advisory_xact_lock`) combina dos defensas:
- El UNIQUE detecta y descarta duplicados perfectos (mismo request-id) sin abrir transacción larga.
- El advisory lock serializa por `payment_id` los duplicados con request-id distinto (MP a veces los varía). Es más barato que `SERIALIZABLE` y no genera deadlocks porque la clave es estable.
Una RPC única en SQL garantiza atomicidad: o se acreditó todo (estado + stock + paid_at), o nada. Postgres es el único sitio donde "todo o nada" tiene una definición operativa: una transacción.

Pasos:
1. **Verificación HMAC `x-signature`** (ver bug #1 del documento de bugs).
2. **De-duplicación por `(x-request-id, event_type)`**: insertar primero en `payment_events`; si `UNIQUE_VIOLATION`, responder 200 inmediatamente.
3. Consultar `GET /v1/payments/{id}` con timeout y reintento (3 intentos exp backoff).
4. Despachar a **una sola RPC** que hace todo en una transacción:

```sql
CREATE FUNCTION procesar_pago(
  p_sale_id        uuid,
  p_mp_payment_id  text,
  p_mp_status      text,
  p_amount         numeric,
  p_items          jsonb
) RETURNS text                       -- 'ok' | 'already_processed' | 'amount_mismatch' | 'no_stock'
LANGUAGE plpgsql AS $$
DECLARE
  v_sale sales%ROWTYPE;
BEGIN
  -- Lock serializado por payment_id (evita carrera entre webhooks duplicados)
  PERFORM pg_advisory_xact_lock(hashtext(p_mp_payment_id));

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'sale_not_found'; END IF;

  -- Idempotencia: si ya procesamos este payment_id, no hacemos nada.
  IF v_sale.mp_payment_id = p_mp_payment_id AND v_sale.status <> 'pending_payment' THEN
    RETURN 'already_processed';
  END IF;

  IF p_mp_status IN ('rejected','cancelled') THEN
    IF v_sale.status = 'pending_payment' THEN
      PERFORM assert_transition(v_sale.status, 'cancelled');
      UPDATE sales SET status='cancelled', mp_payment_id=p_mp_payment_id,
        mp_status=p_mp_status WHERE id=p_sale_id;
      PERFORM liberar_reserva(p_items);
    END IF;
    RETURN 'ok';
  END IF;

  IF p_mp_status = 'approved' THEN
    IF abs(v_sale.total - p_amount) > 0.01 THEN
      RETURN 'amount_mismatch';
    END IF;

    -- Convierte la reserva en descuento real y registra stock_movements.
    PERFORM consumir_reserva(p_sale_id, p_items);

    PERFORM assert_transition(v_sale.status, 'paid');
    UPDATE sales SET
      status='paid', mp_payment_id=p_mp_payment_id, mp_status=p_mp_status,
      paid_amount=p_amount, payment_method='mercadopago',
      paid_at=now(), payment_completed_at=now()
    WHERE id=p_sale_id;

    RETURN 'ok';
  END IF;

  RETURN 'ignored';
END $$;
```

5. Si `procesar_pago` devuelve `amount_mismatch` o `no_stock`, **encolar refund** en `refund_queue` (en la misma request del webhook) y responder 200. El refund real lo hace el worker (Fase 3).

Patrones aplicados:
- **Idempotency key** (`mp_payment_id` único + `pg_advisory_xact_lock`).
- **Pessimistic locking** (`FOR UPDATE` sobre la sale).
- **Optimistic concurrency** (el `UNIQUE` index actúa como cheque adicional).
- **State machine** (`assert_transition`).

### Fase 3 — Worker de refunds (saga de compensación) (bloqueante)
**Objetivo:** que ningún reembolso quede sin emitir aunque MP esté caído.

**Por qué:** un reembolso fallido es **pérdida directa de dinero**: cobramos sin poder entregar y nos quedamos con la plata del cliente. El código actual hace un `fetch` y loggea el error: si MP devuelve 503, perdimos. El patrón Saga + cola persistente (`refund_queue`) convierte el reembolso en una promesa que **el sistema cumple eventualmente**, no en un best-effort. La cola separada (no la misma tx del webhook) tiene una razón concreta: si MP está caído cuando llega el webhook, no queremos abortar el webhook y dejar el pago en limbo; queremos confirmar el pago y agendar la compensación. `SKIP LOCKED` permite paralelizar workers sin doble emisión, y el `UNIQUE(mp_payment_id)` en `refund_queue` es nuestra última red anti-doble-refund. El backoff exponencial mata problemas transitorios; el dead letter después de N intentos garantiza que el equipo se entere antes de que el cliente reclame.

Pasos:
1. Nueva Edge Function `process-refund-queue`.
2. Programada con `pg_cron` cada 60 s (Supabase soporta `pg_cron`):

```sql
SELECT cron.schedule('process-refund-queue', '* * * * *',
  $$SELECT net.http_post(
      url := 'https://<proj>.supabase.co/functions/v1/process-refund-queue',
      headers := '{"Authorization":"Bearer <SUPABASE_FUNCTION_SECRET>"}'::jsonb
  )$$);
```

3. La función toma con `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10` (paraleliza workers):

```sql
SELECT * FROM refund_queue
WHERE status='pending' AND attempts < 7
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

4. Llama a MP con `X-Idempotency-Key: refund-{mp_payment_id}-{attempt}`. Marca `done` o suma `attempts` con `last_error`. Tras 7 intentos → `failed` y dispara alerta (email vía Resend / Supabase auth hooks).

Patrón: **Outbox / Background Worker** + **Exponential Backoff** + **Dead Letter** después de N intentos.

### Fase 4 — Reserva de stock con TTL (alto)
**Objetivo:** evitar overselling entre el "agregar al carrito" y el "pagar".

**Por qué:** hoy el sistema descubre que no hay stock **después** de cobrar y dispara refund. Eso funciona, pero implica fricción y pérdida de fees de MP cada vez. El patrón de reserva (`reserved`) es el estándar de la industria (Amazon, Stripe) por una razón: convierte el caso "el último pan se vendió mientras pagabas" en un error temprano y barato (antes de redirigir a MP), no en un reembolso tardío y costoso. La columna `reserved` separada de `stock` mantiene el inventario físico inmutable y permite distinguir "qué hay" de "qué está apartado". El TTL es indispensable: sin él, un cliente que abandona el checkout deja stock fantasma para siempre. La RPC con `UPDATE ... WHERE stock - reserved >= qty` es atómica por fila — Postgres garantiza la condición sin necesidad de SERIALIZABLE, lo que escala mejor.

Pasos:
1. RPC `reservar_stock(p_sale_id uuid, p_items jsonb)`:

```sql
CREATE FUNCTION reservar_stock(p_sale_id uuid, p_items jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    UPDATE products
    SET reserved = reserved + (item->>'qty')::int
    WHERE id = (item->>'productId')::uuid
      AND stock - reserved >= (item->>'qty')::int;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sin stock disponible para: %', item->>'name';
    END IF;
  END LOOP;
END $$;
```

2. RPC `consumir_reserva(p_sale_id, p_items)`:
   - `UPDATE products SET stock = stock - qty, reserved = reserved - qty`.
   - `INSERT INTO stock_movements (...)`.

3. RPC `liberar_reserva(p_items)`: `reserved = reserved - qty` (clamp ≥ 0).

4. **Cron de expiración**: cada 5 min, las `sales` `pending_payment` con `expires_at < now()` pasan a `cancelled` y se libera su reserva.

Patrón: **Inventory Reservation** (similar al de Amazon/Stripe).

### Fase 5 — Reconciliación contable (alto)
**Objetivo:** que las ventas online estén en el corte de caja como cualquier otro método.

**Por qué:** hoy las ventas MP terminan en `status='ready'`, que ni `CashShiftPage` ni `ReportsPage` reconocen como ingreso. Resultado: el dueño cierra el turno y el sistema le dice que ganó menos de lo que realmente entró. Eso, además de ser un error contable, **invalida la confianza en todo el panel**: si la caja no cierra con la realidad, el usuario empieza a hacer planillas paralelas y el sistema deja de servir. La vista `v_sales_payments` resuelve esto con un patrón CQRS-light: el read model unifica POS y online sin que el write model (`sales` con su máquina de estados) tenga que doblarse. La reconciliación nocturna contra el reporte de MP es la red de seguridad: si nuestra DB dice $X y MP dice $Y, queremos saberlo el mismo día, no en el balance fiscal.

Pasos:
1. Vista `v_sales_payments` que normaliza ventas POS (status `closed`) y ventas online (status `paid`/`ready`/`closed`) bajo un mismo formato.
2. `CashShiftPage` consume la vista en lugar de filtrar por `status='closed'`.
3. Agregar fila "MercadoPago" en el resumen del turno, separada de efectivo y transferencia.
4. Reporte de reconciliación: cada noche, comparar `SUM(sales.paid_amount WHERE mp_status='approved')` contra el reporte oficial de MP (API `/v1/payments/search`) y alertar si hay diferencia > $1.

### Fase 6 — Hardening (medio)

**Por qué:** son defensas contra abuso, no contra fraude monetario directo, pero acumulan: sin rate limit alguien spammea miles de preferencias en una hora y agota la cuota de MP; sin CORS estricto otra app puede invocar nuestra Edge Function desde el dominio del atacante; sin Turnstile o captcha el formulario de checkout se vuelve un endpoint de gratis para tests automatizados. Son baratas de implementar y eliminan toda una clase de problemas.

1. **Rate limit** en `create-preference`: tabla `checkout_rate_limit` con `INSERT ... ON CONFLICT (ip, window) DO UPDATE SET count = count + 1`. Bloquear > 10/min.
2. **Validación de teléfono** server-side (E.164).
3. **CORS estricto** (origen específico, no `*`).
4. **Cloudflare Turnstile** en el formulario de checkout.
5. **Sentry / logflare** para Edge Functions.
6. **Tests E2E** (Playwright) que simulan: pago aprobado, rechazado, sin stock, monto manipulado, webhook duplicado, webhook con firma inválida.

### Fase 7 — Observabilidad y SLOs (medio)

**Por qué:** los bugs financieros silenciosos son peores que los que rompen ruidosamente. Un webhook que tarda 30 s o un refund que falla todas las noches no se notan hasta que un cliente reclama. La observabilidad convierte cada inconsistencia en una métrica con umbral, y el umbral en una alerta. La regla de oro: lo que no se mide, no existe — y en dinero, lo que no existe pero ocurrió, es un robo silencioso.

1. Dashboard Supabase con:
   - Sales `pending_payment` con edad > 30 min (debería ser 0).
   - `refund_queue.status='failed'` (debería ser 0).
   - Diferencia entre `payment_events.payment_approved` y `sales.status='paid'` (debería ser 0).
2. SLO: 99.9% de los webhooks procesados < 5 s.
3. Alertas (Discord webhook) cuando alguno de los anteriores se rompe.

---

## 4. Cómo se ataca, fase por fase

| Orden | Fase | Esfuerzo | Riesgo si no se hace |
|-------|------|----------|---------------------|
| 1 | Fase 1 — Pricing server-side + RLS | M | Cobros indebidos |
| 2 | Fase 2 — Webhook firmado + idempotente | M | Webhooks falsos / doble cobro |
| 3 | Fase 3 — Refund worker | S | Cobros sin entrega |
| 4 | Fase 5 — Reconciliación contable | S | Cierre de caja desfasado |
| 5 | Fase 4 — Reserva de stock | M | Overselling |
| 6 | Fase 6 — Hardening | S | Abuso / spam |
| 7 | Fase 7 — Observabilidad | S | Bugs invisibles |

Las primeras 3 fases son **bloqueantes para producción**. Las demás son robustez incremental.

---

## 5. Estructura del repo propuesta

```
supabase/
  migrations/
    20260610_001_sales_mp_columns.sql
    20260610_002_payment_events.sql
    20260610_003_refund_queue.sql
    20260610_004_stock_reserved.sql
    20260610_005_assert_transition.sql
    20260610_006_procesar_pago.sql
    20260610_007_reservar_consumir_liberar.sql
    20260610_008_cron_expire_pending.sql
    20260610_009_rls_sales_online.sql

  functions/
    _shared/
      mp-client.ts        # GET /v1/payments con reintento + timeout
      mp-signature.ts     # verifyMpSignature
      logger.ts           # structured logging
      schemas.ts          # Zod schemas para inputs

    create-preference/
      index.ts            # Fase 1
    mp-webhook/
      index.ts            # Fase 2 (delgado, delega a RPC)
    process-refund-queue/
      index.ts            # Fase 3
    expire-pending-sales/
      index.ts            # Fase 4 (corre por cron)
```

Reglas:
- **Edge Functions delgadas** (validan input, llaman a la RPC, devuelven status). Toda la lógica de negocio está en SQL para garantizar atomicidad.
- **`_shared/`** centraliza la conexión a MP y el contrato (Zod), evita duplicar.
- **Sin dependencias del frontend** en las funciones (mantener portabilidad).

---

## 6. Concurrencia — checklist por escenario

| Escenario | Mecanismo |
|-----------|-----------|
| Dos clientes compran el último producto en paralelo | `reservar_stock` con `UPDATE … WHERE stock - reserved >= qty` (atómico fila por fila). El segundo recibe error y no llega a MP. |
| MP envía el mismo webhook 3 veces seguidas | `UNIQUE(mp_request_id, event_type)` en `payment_events` + `pg_advisory_xact_lock(hashtext(payment_id))` |
| Webhook `approved` y `rejected` llegan fuera de orden | `assert_transition` rechaza la regresión; `payment_events` deja traza |
| Refund worker corre 2 veces en paralelo | `SELECT … FOR UPDATE SKIP LOCKED` + `UNIQUE(mp_payment_id)` en `refund_queue` + `X-Idempotency-Key` a MP |
| `expire-pending-sales` libera reserva mientras `approved` llega | `FOR UPDATE` sobre `sales` en ambas RPC + `assert_transition` |
| Inserción concurrente con mismo `external_reference` | PK `sales.id` (uuid generado server-side) + lookup por id |

---

## 7. Patrones de diseño aplicados — y por qué cada uno

| Patrón | Dónde | Por qué este patrón y no otro |
|--------|-------|-------------------------------|
| **Application Service** | `create-preference` orquesta validación + persistencia + integración externa | Mantiene la Edge Function delgada (input → orquestación → output). La lógica de negocio vive en SQL, donde es transaccional. Alternativa descartada: lógica en el frontend → cliente hostil. |
| **Transactional Outbox** | `payment_events` se inserta en la misma tx que `sales` | Garantiza que el evento se registra si y solo si la sale se persistió. Alternativa descartada: insertar el evento después → si la red falla, el evento se pierde. |
| **State Machine** | `assert_transition` centraliza transiciones | Una sola definición de "¿qué pasos son válidos?" Imposible escribir `cancelled → paid` por accidente. Alternativa descartada: validar en cada `UPDATE` → ramificación olvidable. |
| **Idempotency Key** | `mp_payment_id` UNIQUE + `X-Idempotency-Key` a MP + `(mp_request_id, event_type)` | MP reentrega notificaciones por diseño; sin idempotencia, cada reentrega es un doble descuento. Alternativa descartada: dedupe en memoria → no sobrevive a reinicio de la función. |
| **Saga + Compensation** | `refund_queue` compensa fallos de stock | El refund es eventual; envolverlo en la tx del webhook implicaría abortar el cobro si MP refund-API está caído, lo cual es peor. Patrón Saga es estándar para flujos distribuidos. |
| **Pessimistic Locking** | `FOR UPDATE` en `sales` durante webhook | El conflicto es real (webhooks duplicados leen y escriben la misma fila). Alternativa descartada: optimistic con `version` column → más complejo y obliga retry loops. |
| **Advisory Lock** | `pg_advisory_xact_lock` para serializar por payment_id | Más barato y predecible que `SERIALIZABLE`. Solo serializa donde importa (mismo pago), no toda la tabla. |
| **Inventory Reservation** | columna `reserved` + RPC `reservar/consumir/liberar` | Mueve la detección de "sin stock" al inicio del flujo (barato), no al final (caro = refund). |
| **Worker Queue** | `refund_queue` con `SKIP LOCKED` y `pg_cron` | Permite reintentar sin perder visibilidad. `SKIP LOCKED` evita doble procesamiento sin requerir cache externo. |
| **Event Sourcing (light)** | `payment_events` permite reconstruir el historial | En auditoría financiera, "¿cuándo y cómo se aprobó este pago?" debe ser respondible siempre. Una columna no alcanza; un log de eventos sí. |
| **CQRS (light)** | vista `v_sales_payments` separa reads contables de la tabla transaccional | Los reportes evolucionan más rápido que la máquina de estados. Aislar lecturas en vistas permite optimizarlas sin tocar el modelo de escritura. |
| **Dead Letter** | `refund_queue.status='failed'` tras N intentos | Sin esto, un refund roto loopea para siempre o se descarta. La cola DL hace que el problema sea **visible y accionable** por humanos. |

---

## 8. Definición de "hecho" (Definition of Done)

Para considerar el backend de pagos listo para producción:

- [ ] Todas las migraciones aplicadas (idealmente con `supabase db push` versionado).
- [ ] `MP_WEBHOOK_SECRET` y `MP_ACCESS_TOKEN` en `supabase secrets`.
- [ ] Tests E2E pasando:
  - [ ] Pago aprobado de monto correcto → `sales.status='paid'`, stock descontado, evento `payment_approved` registrado.
  - [ ] Pago aprobado con monto alterado → refund encolado, `sales.status='cancelled'`.
  - [ ] Webhook duplicado → segundo retorno `200` sin efectos.
  - [ ] Webhook con firma inválida → `401`.
  - [ ] Stock agotado entre carrito y webhook → refund emitido, `cancelled`.
  - [ ] MP caído al refund → worker reintenta hasta éxito.
  - [ ] Sale `pending_payment` > 30 min → cron la cancela y libera reserva.
- [ ] Dashboard de salud (Fase 7) en verde por 24h.
- [ ] Reconciliación nocturna sin diferencias en 7 días seguidos.
- [ ] RLS auditado: el `anon` key no puede leer `payment_events` ni `refund_queue` ni insertar `sales`.

---

## 9. Roadmap a futuro (no bloqueante)

- **Multi-pasarela**: introducir interfaz `PaymentProvider` para sumar Modo, Naranja, etc. sin tocar el resto.
- **Webhooks salientes**: notificar al staff por Discord/WhatsApp cuando entra un pedido pago.
- **Refund parcial**: hoy el refund es total. Manejar item por item.
- **Cuotas**: hoy `installments: 1`. Permitir cuotas con costo financiero a cargo del cliente.
- **Wallets corporativas**: cuenta corriente integrada con MP Cuenta Empresa.
