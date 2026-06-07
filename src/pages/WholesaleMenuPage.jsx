import { useState, useEffect } from "react";
import { supabase, dbToProduct } from "../supabase.js";
import "../menu.css";

// ── Código de acceso mayorista (cambiar según necesidad) ──────────────────────
const WHOLESALE_CODE = "NUTRIFREE-27";

const WA_NUMBER = "5492281588834";
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=Hola%20NUTRIFREE!%20Quisiera%20hacer%20un%20pedido%20mayorista%20%F0%9F%8D%9E`;

const ENVIO_GRATIS_MINIMO = 75000;

const CAT_IMAGES = {
  "Tortas": "/imagenes/tortas.png",
  "Postres": "/imagenes/brownie.png",
  "Pastelería": "/imagenes/pasteleria.svg",
  "Panadería": "/imagenes/panaderia.png",
  "Panadería Grandes": "/imagenes/panaderia-grandes.svg",
  "Salado": "/imagenes/panaderia.svg",
  "Viandas": "/imagenes/menu-del-dia.png",
};

function toSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function formatPrice(price) {
  return "$ " + price.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function WppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Pantalla de acceso ────────────────────────────────────────────────────────
function AccessScreen({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.trim().toUpperCase() === WHOLESALE_CODE) {
      onUnlock();
    } else {
      setError(true);
      setCode("");
      setTimeout(() => setError(false), 2500);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #2d5f8a 0%, #1a3a5c 50%, #0d2035 70%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <img src="/imagenes/logo.png" alt="NUTRIFREE" style={{ height: 70, marginBottom: 32, opacity: 0.95 }} />

      <div style={{
        background: "white",
        borderRadius: 20,
        padding: "40px 36px",
        maxWidth: 380,
        width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#e8f0f8",
          borderRadius: 30,
          padding: "6px 16px",
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 14 }}>🏢</span>
          <span style={{ fontSize: 12, fontWeight: "bold", letterSpacing: 2, textTransform: "uppercase", color: "#2d5f8a", fontFamily: "Arial, sans-serif" }}>
            Acceso Mayoristas
          </span>
        </div>

        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.5rem", color: "#1a3a5c", marginBottom: 8 }}>
          Lista de Precios
        </h2>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: "#6b8baa", marginBottom: 28, lineHeight: 1.6 }}>
          Ingresá el código de acceso<br />para ver los precios mayoristas.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Código de acceso"
            autoFocus
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: 12,
              border: error ? "2px solid #e53e3e" : "2px solid #d0e4f5",
              fontFamily: "Arial, sans-serif",
              fontSize: 15,
              outline: "none",
              textAlign: "center",
              letterSpacing: 3,
              textTransform: "uppercase",
              background: error ? "#fff5f5" : "#f7fbff",
              color: "#1a3a5c",
              marginBottom: 8,
              transition: "border-color 0.2s, background 0.2s",
            }}
          />
          {error && (
            <p style={{ color: "#e53e3e", fontFamily: "Arial, sans-serif", fontSize: 12, marginBottom: 12 }}>
              Código incorrecto. Intentá de nuevo.
            </p>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              background: "linear-gradient(135deg, #2d5f8a, #1a3a5c)",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontFamily: "Arial, sans-serif",
              fontSize: 15,
              fontWeight: "bold",
              cursor: "pointer",
              marginTop: 8,
              transition: "opacity 0.2s",
            }}
            onMouseOver={e => e.target.style.opacity = "0.9"}
            onMouseOut={e => e.target.style.opacity = "1"}
          >
            Ingresar
          </button>
        </form>
      </div>

      <a
        href="/"
        style={{
          marginTop: 24,
          color: "rgba(255,255,255,0.55)",
          fontFamily: "Arial, sans-serif",
          fontSize: 12,
          textDecoration: "none",
        }}
      >
        ← Volver al menú minorista
      </a>
    </div>
  );
}

// ── Menú mayorista ─────────────────────────────────────────────────────────────
function WholesaleMenu() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
    ]).then(([{ data: cats }, { data: prods }]) => {
      const mapped = (prods ?? []).map(dbToProduct).filter(p => p.priceWholesale > 0);
      setCategories(cats?.map(c => c.name) ?? []);
      setProducts(mapped);
      setLoading(false);
    }).catch(err => {
      console.error("[WholesaleMenuPage] Error al cargar datos:", err);
      setLoading(false);
    });
  }, []);

  const grouped = categories
    .map(cat => ({
      cat,
      prods: products.filter(p => p.category === cat),
    }))
    .filter(g => g.prods.length > 0);

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh",
        background: "linear-gradient(135deg, #2d5f8a 0%, #1a3a5c 50%, #0d2035 70%)",
        flexDirection: "column", gap: 16,
      }}>
        <img src="/imagenes/logo.png" style={{ height: 60, opacity: 0.7 }} alt="NutriFree" />
        <div style={{ fontFamily: "Arial, sans-serif", fontSize: ".9em", color: "#7aadcf" }}>
          Cargando lista de precios…
        </div>
      </div>
    );
  }

  return (
    <div className="wholesale-menu">
      {/* ── HEADER ── */}
      <header style={{ background: "linear-gradient(135deg, #2d5f8a 0%, #1a3a5c 50%, #0d2035 70%)" }}>
        <div className="header-inner">
          <img src="/imagenes/logo.png" alt="NUTRIFREE" className="header-logo" />
          <nav>
            {grouped.map(({ cat }) => (
              <a key={cat} href={`#${toSlug(cat)}`}>{cat}</a>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: "#2d5f8a",
              color: "white",
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "6px 14px",
              borderRadius: 20,
              fontFamily: "Arial, sans-serif",
              fontWeight: "bold",
              border: "2px solid rgba(255,255,255,0.25)",
              whiteSpace: "nowrap",
            }}>
              Mayorista
            </span>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="hero" style={{ background: "linear-gradient(135deg, #2d5f8a 0%, #1a3a5c 50%, #0d2035 70%)" }}>
        <p className="hero-sub" style={{ color: "#a8c8e8" }}>Panadería &amp; Pastelería</p>
        <h1>Lista Mayorista</h1>
        <p className="hero-desc">
          Precios especiales para revendedores y distribuidores.<br />
          Pedido mínimo: <strong>4 unidades por producto</strong>.
        </p>
        <a className="hero-cta" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          <WppIcon />
          Consultar pedido
        </a>
      </div>

      {/* ── BANNER ENVÍOS ── */}
      <div style={{
        background: "#1a3a5c",
        color: "white",
        textAlign: "center",
        padding: "14px 24px",
        fontFamily: "Arial, sans-serif",
        fontSize: 13,
        lineHeight: 1.8,
        borderBottom: "3px solid #2d5f8a",
      }}>
        <span style={{ background: "#2d5f8a", borderRadius: 6, padding: "2px 10px", marginRight: 10, fontWeight: "bold" }}>
          🚚 Envíos
        </span>
        <strong>Ciudad de Azul y Prov. de Buenos Aires:</strong> envío gratis en compras mayores a {formatPrice(ENVIO_GRATIS_MINIMO)}.
        &nbsp;
        <span style={{ color: "#a8c8e8" }}>Otras localidades: consultar.</span>
      </div>

      {/* ── PRODUCTOS POR CATEGORÍA ── */}
      <main className="main-content" style={{ paddingTop: 48 }}>
        {grouped.map(({ cat, prods }) => (
          <section key={cat} className="category-section" id={toSlug(cat)}>
            <div className="category-header">
              {CAT_IMAGES[cat] ? (
                <img
                  src={CAT_IMAGES[cat]}
                  alt={cat}
                  className="category-img-thumb"
                  style={{ borderColor: "#2d5f8a" }}
                />
              ) : (
                <div
                  className="category-img-thumb"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", borderColor: "#2d5f8a" }}
                >
                  <span style={{ fontSize: "2rem" }}>🌿</span>
                </div>
              )}
              <div className="category-title-block">
                <h2 style={{ color: "#1a3a5c" }}>{cat}</h2>
                <div className="category-divider" style={{ background: "linear-gradient(90deg, #2d5f8a, transparent)" }} />
              </div>
            </div>
            <div className="product-grid">
              {prods.map(prod => (
                <div key={prod.id} className="product-card">
                  <div className="product-card-accent" style={{ background: "linear-gradient(90deg, #2d5f8a, #7aadcf)" }} />
                  <div className="product-card-body">
                    <p className="product-name">{prod.name}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span className="product-price" style={{ color: "#1a3a5c" }}>
                        {formatPrice(prod.priceWholesale)}
                      </span>
                      <span style={{
                        background: "#e8f0f8",
                        color: "#2d5f8a",
                        fontSize: 10,
                        fontWeight: "bold",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontFamily: "Arial, sans-serif",
                        whiteSpace: "nowrap",
                      }}>
                        mín. 4 u.
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#0d2035" }}>
        <strong>NUTRIFREE — Mayoristas</strong>
        Panadería &amp; Pastelería Sin TACC<br />
        Pedido mínimo 4 unidades por producto
        <div style={{ marginTop: 8 }}>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#25D366", textDecoration: "none", fontWeight: "bold" }}
          >
            WhatsApp: +54 9 2281 588834
          </a>
        </div>
        <span className="footer-singluten" style={{ background: "#2d5f8a", marginTop: 12 }}>100% Sin Gluten</span>
        <div style={{ marginTop: 14 }}>
          <a href="/" style={{ color: "rgba(168,200,232,0.55)", fontFamily: "Arial, sans-serif", fontSize: 11, textDecoration: "none" }}>
            ← Ver menú minorista
          </a>
        </div>
      </footer>

      {/* ── FAB WhatsApp ── */}
      <a className="wpp-fab" href={WA_LINK} target="_blank" rel="noopener noreferrer">
        <WppIcon />
        Consultar pedido
      </a>
    </div>
  );
}

// ── Componente raíz ───────────────────────────────────────────────────────────
export default function WholesaleMenuPage() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <AccessScreen onUnlock={() => setUnlocked(true)} />;
  }

  return <WholesaleMenu />;
}
