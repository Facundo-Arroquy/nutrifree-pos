import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const accessToken = Deno.env.get("MP_ACCESS_TOKEN")!;

  try {
    const body = await req.json();
    console.log("[mp-webhook] Recibido:", JSON.stringify(body));

    // MP envía topic=payment con el id del pago
    if (body.type !== "payment" || !body.data?.id) {
      return new Response("ok", { headers: CORS });
    }

    // Verificar el pago con MP
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!payRes.ok) {
      console.error("[mp-webhook] No se pudo consultar el pago:", body.data.id);
      return new Response("error consultando pago", { status: 502, headers: CORS });
    }

    const payment = await payRes.json();
    console.log("[mp-webhook] Pago status:", payment.status, "ref:", payment.external_reference);

    const saleId = payment.external_reference;
    if (!saleId) {
      console.warn("[mp-webhook] Sin external_reference, ignorando");
      return new Response("ok", { headers: CORS });
    }

    if (payment.status === "approved") {
      // Obtener la venta para leer sus items
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .select("id, status, items")
        .eq("id", saleId)
        .single();

      if (saleErr || !sale) {
        console.error("[mp-webhook] Venta no encontrada:", saleId);
        return new Response("venta no encontrada", { status: 404, headers: CORS });
      }

      // Idempotencia: si ya está pagada no repetir
      if (sale.status === "paid" || sale.status === "preparing" || sale.status === "ready") {
        console.log("[mp-webhook] Pago ya procesado para sale:", saleId);
        return new Response("ok", { headers: CORS });
      }

      // Descontar stock atómicamente con RPC
      const items = sale.items as Array<{ productId: string; qty: number; name: string }>;
      const { error: stockErr } = await supabase.rpc("descontar_stock_pedido", {
        p_items: items.map(i => ({ id: i.productId, qty: i.qty, name: i.name })),
      });

      if (stockErr) {
        console.error("[mp-webhook] Error al descontar stock:", stockErr.message);
        // Reembolsar automáticamente
        await reembolsarPago(accessToken, body.data.id, payment.transaction_amount);
        // Cancelar la venta
        await supabase.from("sales").update({ status: "cancelled", notes: `Cancelado: sin stock al pagar (MP ${body.data.id})` }).eq("id", saleId);
        return new Response("sin stock, pago reembolsado", { status: 409, headers: CORS });
      }

      // Marcar venta como pagada y lista para retirar
      await supabase
        .from("sales")
        .update({
          status: "ready",
          payment_method: "mercadopago",
          paid_at: new Date().toISOString(),
          notes: `Pago MP aprobado | ID: ${body.data.id}`,
        })
        .eq("id", saleId);

      console.log("[mp-webhook] Pedido confirmado:", saleId);
    } else if (payment.status === "rejected" || payment.status === "cancelled") {
      await supabase
        .from("sales")
        .update({ status: "cancelled", notes: `Pago ${payment.status} (MP ${body.data.id})` })
        .eq("id", saleId);

      console.log("[mp-webhook] Pago rechazado/cancelado, venta cancelada:", saleId);
    }
    // pending: no hacemos nada, esperamos otro webhook

    return new Response("ok", { headers: CORS });
  } catch (err) {
    console.error("[mp-webhook] Error inesperado:", err);
    return new Response("error interno", { status: 500, headers: CORS });
  }
});

async function reembolsarPago(accessToken: string, paymentId: string, amount: number) {
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `refund-${paymentId}`,
      },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    console.log("[mp-webhook] Reembolso:", res.ok ? "OK" : "FALLÓ", JSON.stringify(data));
  } catch (e) {
    console.error("[mp-webhook] Error al reembolsar:", e);
  }
}
