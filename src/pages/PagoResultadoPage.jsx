import "../menu.css";

const CONFIGS = {
  "/pago-exitoso": {
    icon: "🎉",
    title: "¡Pago recibido!",
    sub: "Tu pedido fue confirmado y ya está en preparación.\nTe vamos a avisar cuando esté listo.",
    color: "#1a3a36",
    btnLabel: "Volver al menú",
  },
  "/pago-fallido": {
    icon: "😕",
    title: "El pago no se pudo completar",
    sub: "No se realizó ningún cobro. Podés intentarlo de nuevo o escribirnos por WhatsApp.",
    color: "#c0392b",
    btnLabel: "Volver al menú",
  },
  "/pago-pendiente": {
    icon: "⏳",
    title: "Pago pendiente",
    sub: "Tu pago está siendo procesado. Cuando se acredite confirmamos tu pedido automáticamente.",
    color: "#e67e22",
    btnLabel: "Volver al menú",
  },
};

const WA_NUMBER = "5492281588834";

export default function PagoResultadoPage() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const saleId = params.get("sale_id");
  const cfg = CONFIGS[path] ?? CONFIGS["/pago-fallido"];

  const waText = encodeURIComponent(
    saleId
      ? `Hola NUTRIFREE! Consulta sobre mi pedido web\nReferencia: #${saleId.slice(0, 7).toUpperCase()}`
      : "Hola NUTRIFREE! Consulta sobre mi pedido web"
  );

  return (
    <div className="confirmation-screen">
      <div className="confirmation-card">
        <div className="confirmation-icon">{cfg.icon}</div>
        <h2 style={{ color: cfg.color }}>{cfg.title}</h2>
        <p className="confirmation-sub" style={{ whiteSpace: "pre-line" }}>{cfg.sub}</p>

        {saleId && (
          <div className="confirmation-details">
            <div className="conf-row">
              <span>Referencia</span>
              <strong>#{saleId.slice(0, 7).toUpperCase()}</strong>
            </div>
          </div>
        )}

        <a
          href={`https://wa.me/${WA_NUMBER}?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-wpp-confirm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Contactar por WhatsApp
        </a>

        <button className="btn-back-menu" onClick={() => window.location.href = "/"}>
          {cfg.btnLabel}
        </button>
      </div>
    </div>
  );
}
