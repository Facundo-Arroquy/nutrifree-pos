import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { items, customerName, customerPhone, deliveryDate, saleId } = await req.json();

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "Sin items" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!accessToken) throw new Error("MP_ACCESS_TOKEN no configurado");

    const baseUrl = "https://nutrifree.lat";

    const preference = {
      items: items.map((item: { name: string; qty: number; price: number }) => ({
        title: item.name,
        quantity: item.qty,
        unit_price: item.price,
        currency_id: "ARS",
      })),
      payer: {
        name: customerName,
        phone: { number: customerPhone },
      },
      back_urls: {
        success: `${baseUrl}/pago-exitoso?sale_id=${saleId}`,
        failure: `${baseUrl}/pago-fallido?sale_id=${saleId}`,
        pending: `${baseUrl}/pago-pendiente?sale_id=${saleId}`,
      },
      auto_return: "approved",
      notification_url: `https://lasiauvrppslxumksggz.supabase.co/functions/v1/mp-webhook`,
      external_reference: saleId,
      statement_descriptor: "NUTRIFREE",
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" },      // efectivo
          { id: "bank_transfer" },
        ],
        installments: 1,
      },
      metadata: {
        sale_id: saleId,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_date: deliveryDate,
      },
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preference),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[create-preference] MP error:", JSON.stringify(data));
      throw new Error("Error al crear preferencia en MercadoPago");
    }

    const isProd = !accessToken.startsWith("TEST-");
    const initPoint = isProd ? data.init_point : data.sandbox_init_point;

    return new Response(
      JSON.stringify({ init_point: initPoint, preference_id: data.id }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[create-preference] Error:", err);
    return new Response(
      JSON.stringify({ error: "No se pudo procesar el pago. Intentá de nuevo." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
