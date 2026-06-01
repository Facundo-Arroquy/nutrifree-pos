import { useState, useEffect } from "react";
import { supabase, dbToProduct } from "../supabase.js";
import "../menu.css";

const WA_NUMBER = "5492281588834";
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=Hola%20NUTRIFREE!%20Quisiera%20hacer%20un%20pedido%20%F0%9F%8D%9E`;

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

export default function MenuPage({ onGoToLogin }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("products").select("*").eq("show_in_menu", true).order("name"),
    ]).then(([{ data: cats }, { data: prods }]) => {
      setCategories(cats?.map(c => c.name) ?? []);
      setProducts(prods?.map(dbToProduct) ?? []);
      setLoading(false);
    });
  }, []);

  // Menú del día: buscar por nombre
  const almuerzoProd = products.find(p =>
    p.name.toLowerCase().includes("almuerzo del día") ||
    p.name.toLowerCase().includes("almuerzo del dia")
  );
  const almuerzoCenaProd = products.find(p =>
    p.name.toLowerCase().includes("almuerzo + cena") ||
    p.name.toLowerCase().includes("almuerzo+cena")
  );
  const showMenuDia = !!(
    (almuerzoProd && almuerzoProd.priceRetail > 0) ||
    (almuerzoCenaProd && almuerzoCenaProd.priceRetail > 0)
  );

  // Filtrar productos del menú del día de las secciones generales
  const MENU_DIA_NAMES = ["almuerzo del día", "almuerzo del dia", "almuerzo + cena", "almuerzo+cena"];
  const isMenuDia = p => MENU_DIA_NAMES.some(n => p.name.toLowerCase().includes(n));

  // Agrupar por categoría (en el orden de categories, excluyendo productos del menú del día de sus categorías)
  const grouped = categories
    .map(cat => ({
      cat,
      prods: products.filter(p => p.category === cat && !isMenuDia(p)),
    }))
    .filter(g => g.prods.length > 0);

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#f3faf8", flexDirection: "column", gap: 16,
      }}>
        <img src="/imagenes/logo.png" style={{ height: 60, opacity: 0.7 }} alt="NutriFree" />
        <div style={{ fontFamily: "Arial, sans-serif", fontSize: ".9em", color: "#89b8ad" }}>
          Cargando menú…
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── HEADER ── */}
      <header>
        <div className="header-inner">
          <img src="/imagenes/logo.png" alt="NUTRIFREE" className="header-logo" />
          <nav>
            {showMenuDia && (
              <a href="#menu-dia">Menú del día</a>
            )}
            {grouped.map(({ cat }) => (
              <a key={cat} href={`#${toSlug(cat)}`}>{cat}</a>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge-singluten">Sin Gluten</span>
            <span
              onClick={onGoToLogin}
              title=""
              style={{ cursor: "pointer", fontSize: "18px", opacity: 0.4, userSelect: "none" }}
            >🤍</span>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="hero">
        <p className="hero-sub">Panadería &amp; Pastelería</p>
        <h1>NUTRIFREE</h1>
        <p className="hero-desc">
          Elaboramos cada producto con amor y sin gluten.<br />
          Disfrutá de sabores increíbles, cuidando tu salud.
        </p>
        <a className="hero-cta" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          <WppIcon />
          Pedir ahora
        </a>
      </div>

      {/* ── MENÚ DEL DÍA ── */}
      {showMenuDia && (
        <section className="menu-dia-section" id="menu-dia">
          <div className="menu-dia-card">
            <div className="menu-dia-img">
              <img src="/imagenes/menu-del-dia.png" alt="Menú del Día" />
            </div>
            <div className="menu-dia-body">
              <p className="section-eyebrow">Especial del día</p>
              <h2>Menú del Día</h2>
              <p>
                Almuerzo o cena elaborados con ingredientes frescos y libres de gluten.
                También podés combinar almuerzo y cena del día con un precio especial.
              </p>
              <div className="price-options">
                {almuerzoProd && almuerzoProd.priceRetail > 0 && (
                  <div className="price-chip">
                    <span className="chip-label">Almuerzo o Cena</span>
                    <span className="chip-price">{formatPrice(almuerzoProd.priceRetail)}</span>
                  </div>
                )}
                {almuerzoCenaProd && almuerzoCenaProd.priceRetail > 0 && (
                  <div className="price-chip secondary">
                    <span className="chip-label">Almuerzo + Cena del día</span>
                    <span className="chip-price">{formatPrice(almuerzoCenaProd.priceRetail)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PRODUCTOS POR CATEGORÍA ── */}
      <main className="main-content">
        {grouped.map(({ cat, prods }) => (
          <section key={cat} className="category-section" id={toSlug(cat)}>
            <div className="category-header">
              {CAT_IMAGES[cat] ? (
                <img
                  src={CAT_IMAGES[cat]}
                  alt={cat}
                  className="category-img-thumb"
                />
              ) : (
                <div
                  className="category-img-thumb"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <span style={{ fontSize: "2rem" }}>🌿</span>
                </div>
              )}
              <div className="category-title-block">
                <h2>{cat}</h2>
                <div className="category-divider" />
              </div>
            </div>
            <div className="product-grid">
              {prods.map(prod => (
                <div key={prod.id} className="product-card">
                  <div className="product-card-accent" />
                  <div className="product-card-body">
                    <p className="product-name">{prod.name}</p>
                    <div className="product-price-row">
                      {prod.priceRetail > 0 ? (
                        <span className="product-price">{formatPrice(prod.priceRetail)}</span>
                      ) : (
                        <span className="product-price consultar">Consultar precio</span>
                      )}
                      <span className="singluten-dot" title="Sin TACC" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── FOOTER ── */}
      <footer>
        <strong>NUTRIFREE</strong>
        Panadería &amp; Pastelería Sin TACC<br />
        Hecho con amor, libre de gluten
        <div>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#25D366", textDecoration: "none", fontWeight: "bold" }}
          >
            WhatsApp: +54 9 2281 588834
          </a>
        </div>
        <span className="footer-singluten">100% Sin Gluten</span>
      </footer>

      {/* ── FAB WhatsApp ── */}
      <a className="wpp-fab" href={WA_LINK} target="_blank" rel="noopener noreferrer">
        <WppIcon />
        Hacer pedido
      </a>
    </>
  );
}
