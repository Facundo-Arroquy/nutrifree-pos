# Bugs e inconsistencias — Pasarela de Pago MercadoPago

> Auditoría del commit `7c52cef feat(pasarela): integrar MercadoPago Checkout Pro`.
> Foco: cualquier inconsistencia en el ingreso/egreso de dinero (cobros indebidos,
> reembolsos perdidos, doble descuento de stock, ventas no contabilizadas en caja).

Archivos auditados:
- `supabase/functions/create-preference/index.ts`
- `supabase/functions/mp-webhook/index.ts`
- `supabase/migrations/20260609_descontar_stock_pedido.sql`
- `src/pages/MenuPage.jsx` (checkout)
- `src/pages/PagoResultadoPage.jsx`
- `src/supabase.js` (`saleToDb` / `dbToSale`)

Leyenda de severidad:

| Sev | Significado |
|-----|-------------|
| 🔴 **CRÍTICO** | Pérdida directa de dinero o cobro indebido posible HOY. Bloqueante para producción. |
| 🟠 **ALTO**    | Inconsistencia contable, descalce de stock, reembolsos perdidos. |
| 🟡 **MEDIO**   | UX rota, datos inconsistentes, baja resiliencia. |
| 🔵 **BAJO**    | Limpieza / hardening. |

---

## Resumen ejecutivo

| # | Severidad | Bug | Impacto monetario |
|---|-----------|-----|------------------|
| 1 | 🔴 | Webhook sin verificación de firma (`x-signature`) | Cualquiera marca ventas como pagadas / dispara reembolsos falsos |
| 2 | 🔴 | Precios viajan desde el navegador y no se revalidan | Comprar productos a $1 manipulando el body |
| 3 | 🔴 | No se compara `transaction_amount` vs `sales.total` | Pagos con monto alterado pasan como válidos |
| 4 | 🔴 | Reembolso sin verificar `res.ok` ni reintento | Se cobra al cliente sin poder entregarle (sin stock) |
| 5 | 🟠 | Race condition entre webhooks duplicados del mismo `payment.id` | Doble descuento de stock / doble cambio de estado |
| 6 | 🟠 | No se persiste `mp_payment_id` ni `mp_preference_id` en columnas dedicadas | Imposible reconciliar / detectar duplicados |
| 7 | 🟠 | Ventas online quedan en `status="ready"`, fuera del corte de caja | Ingresos no aparecen en `CashShift` ni reportes por método |
| 8 | 🟠 | Inconsistencia de estados: el código revisa `"paid" / "preparing" / "ready"` pero solo setea `"ready"` | Idempotencia frágil, valor `"paid"` jamás se escribe |
| 9 | 🟠 | RPC `descontar_stock_pedido` no registra `stock_movements` | Auditoría de stock desincronizada vs POS |
| 10 | 🟠 | Eventos `rejected` / `cancelled` pisan ventas ya aprobadas | Una sale `ready` puede caer a `cancelled` por un evento tardío |
| 11 | 🟡 | `back_urls` hardcoded a `https://nutrifree.lat` | Pruebas en preview rompen retorno |
| 12 | 🟡 | `VITE_SUPABASE` (nombre incompleto) en lugar de `VITE_SUPABASE_ANON_KEY` | Build frágil, fácil de romper |
| 13 | 🟡 | `saleId` se genera en el frontend con `uid()` | Cliente puede reusar IDs; sin auditoría server-side |
| 14 | 🟡 | Preferencia MP sin `expiration_date_to` | Sales `pending` huérfanas sin TTL |
| 15 | 🔵 | Falta rate limit en `create-preference` | Spam de ventas `pending` |
| 16 | 🔵 | El webhook devuelve 404 si no encuentra la sale | MP reintenta indefinidamente |

---

## 1. 🔴 Webhook acepta cualquier POST — falta verificación de `x-signature`

**Evidencia:** `supabase/functions/mp-webhook/index.ts:10-46`. El handler procesa el body sin validar HMAC.

**Impacto:**
- Un atacante que conozca el `external_reference` (= `saleId`) puede:
  - Forzar `status=approved` en MP (no), pero peor: en nuestro servidor puede simular un `payment.id` de su propio sandbox y luego pedir a MP el detalle real (no se logra), **pero** si bypassea la consulta a MP (proxy / DNS), nuestro flujo confía. Aún con la consulta a MP, alguien que descubra un `payment.id` aprobado real de OTRA tienda puede dispararlo apuntando a nuestro `external_reference` → marcaríamos `ready` sin haber cobrado nada.
  - Spam: disparar miles de webhooks que consumen rate de la API de MP (cuota de la cuenta).
- En MP Checkout Pro la verificación de firma **es obligatoria** según documentación oficial.

**Solución:**

```ts
// Header: x-signature: ts=...,v1=<hex>
// Header: x-request-id: <uuid>
// secret = MP webhook secret (configurar en dashboard de MP)

import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

async function verifyMpSignature(req: Request, body: string) {
  const sig = req.headers.get("x-signature");
  const reqId = req.headers.get("x-request-id");
  if (!sig || !reqId) return false;

  const parts = Object.fromEntries(sig.split(",").map(p => p.trim().split("=")));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // Reemplaza con dataId del body parseado (payment.id)
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") ?? JSON.parse(body)?.data?.id;

  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(Deno.env.get("MP_WEBHOOK_SECRET")!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");

  // Comparación constant-time
  return hex.length === v1.length && hex.split("").every((c, i) => c === v1[i]);
}
```

Y rechazar con `401` si falla. Configurar `MP_WEBHOOK_SECRET` en `supabase secrets`.

---

## 2. 🔴 Precios viajan desde el navegador y no se revalidan

**Evidencia:**
- `src/pages/MenuPage.jsx:216-222` envía `items: [{name, qty, price}]` al edge function.
- `supabase/functions/create-preference/index.ts:27-32` mete esos precios literales en la preferencia de MP.

**Impacto:** un atacante intercepta la request (DevTools → "Edit and Resend") y manda `price: 1`. MP cobra $1, el cliente recibe el producto entero. Pérdida directa, escalable.

**Solución (server-side authoritative pricing):**

```ts
// create-preference: aceptar SOLO {productId, qty}
const { items, customerName, customerPhone, deliveryDate } = await req.json();
// items: [{productId, qty}]

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ids = items.map(i => i.productId);
const { data: products } = await supabase
  .from("products")
  .select("id, name, price_retail, stock, show_in_menu, active")
  .in("id", ids);

const lineItems = items.map(i => {
  const p = products?.find(x => x.id === i.productId);
  if (!p || !p.show_in_menu || !p.active) throw new Error(`Producto inválido: ${i.productId}`);
  if (p.stock < i.qty) throw new Error(`Sin stock: ${p.name}`);
  if (p.price_retail <= 0) throw new Error(`Producto sin precio: ${p.name}`);
  return { title: p.name, quantity: i.qty, unit_price: Number(p.price_retail), currency_id: "ARS" };
});

const total = lineItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);

// La sale se crea AHORA en el servidor con el total calculado, no antes desde el cliente.
const saleId = crypto.randomUUID();
await supabase.from("sales").insert({
  id: saleId,
  customer_name: customerName,
  items: lineItems,
  total,
  price_list: "retail",
  payment_method: "mercadopago",
  status: "pending_payment",
  delivery_date: deliveryDate,
  notes: `Pedido web | Tel: ${customerPhone}`,
  created_at: new Date().toISOString(),
});
```

El frontend nunca debe insertar `sales` directamente (ver bug #13).

---

## 3. 🔴 No se compara `payment.transaction_amount` con `sales.total`

**Evidencia:** `mp-webhook/index.ts:48-92` confía en que `payment.status === "approved"` alcanza.

**Impacto:** combinado con el bug #2, o si alguna pasarela posterior cambia el monto (cupones, modificaciones manuales en MP), el sistema marcaría la venta como pagada igual.

**Solución (en el webhook, antes de descontar stock):**

```ts
const TOLERANCIA = 0.01; // centavos por redondeo MP
if (Math.abs(Number(payment.transaction_amount) - Number(sale.total)) > TOLERANCIA) {
  console.error("[mp-webhook] Monto pagado no coincide con la venta", {
    saleId, paid: payment.transaction_amount, expected: sale.total,
  });
  // Reembolsar SIEMPRE (cobro inválido) y dejar la sale en estado "amount_mismatch"
  await reembolsarPago(accessToken, body.data.id, payment.transaction_amount);
  await supabase.from("sales").update({
    status: "cancelled",
    notes: `Monto incorrecto. Pagado ${payment.transaction_amount}, esperado ${sale.total}. Reembolso emitido.`,
  }).eq("id", saleId);
  return new Response("amount mismatch", { status: 409, headers: CORS });
}
```

---

## 4. 🔴 Reembolso silencioso — sin verificar `res.ok` ni reintentar

**Evidencia:** `mp-webhook/index.ts:111-127`. Si la llamada a `/refunds` falla (timeout, 5xx, rate limit), solo se loggea. El cliente ya pagó, pero el reembolso nunca ocurre. Quedamos cobrando sin stock para entregar.

**Solución (Saga de compensación con outbox):**

1. Tabla `payment_refunds` (cola persistente):

```sql
CREATE TABLE payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  mp_payment_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | done | failed
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  UNIQUE (mp_payment_id) -- evita doble reembolso del mismo pago
);
```

2. En el webhook, ante stock fail: `INSERT INTO payment_refunds (...)`. Devolver 200.
3. Una segunda Edge Function `process-refunds` corrida por **cron de Supabase** (cada 60s) toma los `pending`, llama a MP con `X-Idempotency-Key: refund-{mp_payment_id}`, marca `done` o suma `attempts`. Tras N intentos, alerta (email / Discord) y deja `failed` para resolución manual.

Beneficio: si MP está caído, el reembolso ocurre cuando vuelve. Y el `UNIQUE(mp_payment_id)` impide doble refund si el worker corre dos veces.

---

## 5. 🟠 Race condition con webhooks duplicados del mismo `payment.id`

**Evidencia:** MercadoPago a menudo manda 2-3 notificaciones del mismo evento muy seguidas. El chequeo `if (sale.status === "paid" | "preparing" | "ready")` no es atómico con el `UPDATE` posterior. Dos instancias del webhook pueden:

1. Webhook A lee `status=pending`.
2. Webhook B lee `status=pending` (todavía no commiteó A).
3. Ambos llaman a `descontar_stock_pedido` → doble descuento.
4. Ambos hacen `update ... status=ready`.

**Solución (advisory lock o constraint de idempotencia):**

Opción A — advisory lock por `payment.id` en la RPC:

```sql
CREATE FUNCTION procesar_pago_aprobado(
  p_sale_id uuid,
  p_mp_payment_id text,
  p_amount numeric,
  p_items jsonb
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key bigint;
  v_sale sales%ROWTYPE;
BEGIN
  v_lock_key := hashtext(p_mp_payment_id);
  PERFORM pg_advisory_xact_lock(v_lock_key); -- serializa por payment_id

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF v_sale.status <> 'pending_payment' THEN
    RETURN 'already_processed';
  END IF;

  IF abs(v_sale.total - p_amount) > 0.01 THEN
    RETURN 'amount_mismatch';
  END IF;

  -- Descuento atómico con FOR UPDATE
  PERFORM descontar_stock_pedido(p_items);

  UPDATE sales SET
    status = 'paid',
    payment_method = 'mercadopago',
    paid_at = now(),
    mp_payment_id = p_mp_payment_id
  WHERE id = p_sale_id;

  RETURN 'ok';
END $$;
```

Opción B — `UNIQUE(mp_payment_id)` en `sales` + `INSERT ... ON CONFLICT DO NOTHING` en una tabla `payment_events` (event sourcing). El segundo webhook ve el conflict y retorna `200` sin hacer nada.

---

## 6. 🟠 No se persisten `mp_payment_id` / `mp_preference_id` en columnas

**Evidencia:** `mp-webhook/index.ts:89` mete el `payment.id` dentro de `notes` como string. No hay forma de:
- Reconciliar contra el panel de MP.
- Detectar duplicados eficientemente.
- Disputar un chargeback.

**Solución:** migración

```sql
ALTER TABLE sales
  ADD COLUMN mp_payment_id text,
  ADD COLUMN mp_preference_id text,
  ADD COLUMN mp_status text,
  ADD COLUMN payment_completed_at timestamptz;

CREATE UNIQUE INDEX sales_mp_payment_id_uniq
  ON sales (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
```

El `UNIQUE` parcial impide registrar el mismo pago dos veces.

---

## 7. 🟠 Ventas online quedan en `status="ready"` — quedan fuera del corte de caja

**Evidencia:**
- `mp-webhook/index.ts:84-91`: `update ... status = 'ready'`.
- `CashShiftPage.jsx:239`: el filtro del turno no reconoce `mercadopago` como método contable separado.
- En el resto del POS, `status="closed"` es el estado terminal de ventas pagadas. El webhook nunca llega a `closed`.

**Impacto:** El total de la jornada de caja **no incluye** las ventas online. Inconsistencia contable. Si el dueño liquida cierre por turno, los ingresos por MP no figuran y el balance del día está mal.

**Solución:** definir una máquina de estados explícita y mapear MP a la misma terminal del POS:

```
pending_payment → paid → preparing → ready → closed (entregado)
                     ↘ refunded
                     ↘ cancelled
```

- En el webhook, marcar `status = 'paid'` (no `ready`) y `paid_at` apenas se acredita.
- En el Kanban, mover a `preparing/ready` al armar el pedido.
- En `CashShiftPage`, incluir explícitamente `payment_method='mercadopago'` y separarlo de efectivo. Agregar línea "MercadoPago: $X" al cierre.

---

## 8. 🟠 Idempotencia que revisa estados que nunca se escriben

**Evidencia:** `mp-webhook/index.ts:62`:

```ts
if (sale.status === "paid" || sale.status === "preparing" || sale.status === "ready") {
```

Pero el mismo código solo escribe `status = "ready"`. El valor `"paid"` jamás se setea. Si en el futuro alguien renombra estados, la idempotencia se rompe silenciosamente.

**Solución:** una sola fuente de verdad. Definir constantes en `shared.jsx` y usarlas en webhook y POS. Idempotencia debería basarse en **`mp_payment_id` UNIQUE** (bug #6), no en estados.

---

## 9. 🟠 Descuento de stock sin registrar `stock_movements`

**Evidencia:** `descontar_stock_pedido` solo hace `UPDATE products SET stock = stock - X`. El POS usa `complete_sale_stocks` que (presumiblemente) sí registra el movimiento en `stock_movements` para auditoría.

**Impacto:** la pantalla de movimientos de stock muestra menos movimientos que ventas. Imposible auditar "¿por qué bajó el stock de X?" para ventas web.

**Solución:** la RPC debe insertar en `stock_movements`:

```sql
FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  UPDATE products
  SET stock = stock - (item->>'qty')::int
  WHERE id = (item->>'id')::uuid AND stock >= (item->>'qty')::int;

  IF NOT FOUND THEN RAISE EXCEPTION 'Sin stock suficiente para: %', item->>'name'; END IF;

  INSERT INTO stock_movements (product_id, qty_delta, type, notes, sale_id)
  VALUES ((item->>'id')::uuid, -(item->>'qty')::int, 'sale_online', 'Venta MP', p_sale_id);
END LOOP;
```

Y agregar `p_sale_id uuid` como parámetro.

---

## 10. 🟠 Eventos `rejected`/`cancelled` tardíos pisan ventas ya aprobadas

**Evidencia:** `mp-webhook/index.ts:94-101`:

```ts
} else if (payment.status === "rejected" || payment.status === "cancelled") {
  await supabase.from("sales").update({ status: "cancelled", ... }).eq("id", saleId);
}
```

No verifica el estado actual. Un evento tardío (re-entrega de webhook 3 horas después) podría caer encima de una venta ya `paid`/`ready`/`closed` y marcarla `cancelled`. Cliente queda sin pedido pese a haber pagado.

**Solución:** cláusula de transición segura:

```ts
await supabase.from("sales").update({ status: "cancelled", ... })
  .eq("id", saleId)
  .eq("status", "pending_payment"); // SOLO si todavía está pendiente
```

O mejor, en la RPC `procesar_pago_aprobado/rechazado` validar la transición permitida.

---

## 11. 🟡 `back_urls` y `notification_url` hardcoded

**Evidencia:** `create-preference/index.ts:24,43`.

**Solución:** leer desde `Deno.env.get("APP_BASE_URL")` y `Deno.env.get("WEBHOOK_URL")`. Una env por ambiente (preview / prod).

---

## 12. 🟡 `VITE_SUPABASE` (sin `_ANON_KEY`)

**Evidencia:** `MenuPage.jsx:208`: `import.meta.env.VITE_SUPABASE`. El nombre estándar es `VITE_SUPABASE_ANON_KEY`. Bug latente: un compañero renombra la env como dicta la doc y rompe el checkout sin que falle el build.

**Solución:** unificar en `VITE_SUPABASE_ANON_KEY`.

---

## 13. 🟡 `saleId` generado en el frontend

**Evidencia:** `MenuPage.jsx:179`: `const saleId = uid();`. El cliente luego hace `supabase.from("sales").insert(...)` con ese ID.

**Impacto:** además del riesgo de colisión / predicibilidad, **el cliente está insertando directamente en la tabla `sales`** sin pasar por validación server-side (precios, stock, RLS). Quien pueda usar el anon key puede crear ventas arbitrarias.

**Solución:**
- Mover la creación de la `sale` al edge function `create-preference` (ver bug #2).
- Bloquear `INSERT` sobre `sales` desde el cliente vía RLS: solo el `service_role` (que usan las Edge Functions) puede insertar pedidos online.

---

## 14. 🟡 Preferencia MP sin TTL

**Evidencia:** la preferencia no incluye `expiration_date_to`. Sales `pending_payment` quedan abiertas indefinidamente, contando stock "reservado" si llegamos a implementarlo.

**Solución:**

```ts
const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
// ...
preference.expiration_date_to = expires;
preference.expires = true;
```

Y un cron que cancele `sales` `pending_payment` con `created_at < now() - interval '1 hour'`.

---

## 15. 🔵 Sin rate limit en `create-preference`

Un script malicioso puede crear miles de preferencias y ensuciar `sales`. Mitigar con un middleware simple por IP + Supabase row counter, o usar Cloudflare/Turnstile delante del endpoint.

---

## 16. 🔵 Webhook devuelve 404 si no encuentra la sale

**Evidencia:** `mp-webhook/index.ts:56-59`. MP reintenta cualquier 4xx/5xx hasta 7 veces. Devolver `200` con log es más seguro: el problema queda registrado pero MP no nos satura.

---

## Tabla de control para el merge

| # | Bug | Fix obligatorio antes de prod | Fix recomendado primera iteración |
|---|-----|:--:|:--:|
| 1 | Verificación firma | ✅ | |
| 2 | Pricing server-side | ✅ | |
| 3 | Validación de monto | ✅ | |
| 4 | Reembolsos persistentes + reintento | ✅ | |
| 5 | Lock por `payment_id` | ✅ | |
| 6 | Columnas `mp_*` + UNIQUE | ✅ | |
| 7 | Estados unificados + cash shift | ✅ | |
| 8 | Idempotencia por payment_id | | ✅ |
| 9 | `stock_movements` | | ✅ |
| 10 | Transiciones de estado seguras | ✅ | |
| 11 | URLs por env | | ✅ |
| 12 | Nombre de env | | ✅ |
| 13 | sale_id server-side + RLS | ✅ | |
| 14 | TTL de preferencia | | ✅ |
| 15 | Rate limit | | ✅ |
| 16 | Webhook siempre 200 | | ✅ |

**Bugs 1, 2, 3, 4, 5, 6, 7, 10 y 13 son bloqueantes** — sin ellos resueltos, el sistema puede cobrar mal, perder dinero por reembolsos no emitidos, o aprobar ventas fraudulentas.
