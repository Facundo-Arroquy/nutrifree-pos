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
      // Obtener la venta y preservar los datos cargados desde la web.
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .select("id, status, paid_at, notes")
        .eq("id", saleId)
        .single();

      if (saleErr || !sale) {
        console.error("[mp-webhook] Venta no encontrada:", saleId);
        return new Response("venta no encontrada", { status: 404, headers: CORS });
      }

      // Idempotencia: si ya está pagada no repetir
      if (sale.paid_at) {
        console.log("[mp-webhook] Pago ya procesado para sale:", saleId);
        return new Response("ok", { headers: CORS });
      }

      // El pago no implica que el pedido esté listo. Permanece en la columna
      // Pendiente y el stock se descuenta al moverlo a "Listo para Retirar",
      // igual que los pedidos creados dentro del sistema. Esto permite vender
      // productos que deben elaborarse sin cancelar ni reembolsar la compra.
      await supabase
        .from("sales")
        .update({
          status: "open",
          payment_method: "mercadopago",
          paid_at: new Date().toISOString(),
          notes: `${sale.notes || "[WEB]"} | Pago MP aprobado | ID: ${body.data.id}`,
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
