import { useState, useEffect, useMemo } from "react";
import { supabase, dbToProduct } from "../supabase.js";
import { availableStock } from "../utils/stock.js";
import {
  cartRequiresPreparation, decreaseOrderQuantity, initialOrderQuantity, isPublishedMenuProduct,
} from "../utils/webOrder.js";
import ProductImage from "../components/ProductImage.jsx";
import {
  CartDrawer, CartIcon, CheckoutModal, ConfirmationScreen, QtyControl, WppIcon,
  formatPrice,
} from "./MenuPage.jsx";
import "../menu.css";

const WA_NUMBER = "5492281588834";
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=Hola%20NUTRIFREE!%20Quisiera%20hacer%20un%20pedido%20mayorista%20%F0%9F%8D%9E`;

const ENVIO_GRATIS_MINIMO = 75000;
const MIN_WHOLESALE_QTY = 4;

const CAT_IMAGES = {
  "Tortas": "/imagenes/tortas.png",
  "Postres": "/imagenes/landing/brownie.png",
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

// ── Menú mayorista ─────────────────────────────────────────────────────────────
function WholesaleMenu() {
  const [products, setProducts] = useState([]);
  const [kitComponents, setKitComponents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const MENU_COLS = "id,name,category,price_retail,price_wholesale,stock,photo,kit_items,active,show_in_menu";
    Promise.all([
      supabase.from("categories").select("name").order("name"),
      supabase.from("products").select(MENU_COLS).eq("active", true).eq("show_in_menu", true).order("name"),
    ]).then(async ([{ data: cats }, { data: prods }]) => {
      const mapped = (prods ?? [])
        .map(dbToProduct)
        .filter(product => isPublishedMenuProduct(product) && product.priceWholesale > 0);
      setCategories(cats?.map(c => c.name) ?? []);
      setProducts(mapped);

      const componentIds = [...new Set(
        mapped.flatMap(product => (product.kitItems || []).map(item => item.productId))
      )].filter(id => id && !mapped.some(product => product.id === id));
      if (componentIds.length) {
        const { data: components } = await supabase.from("products").select("id,stock,kit_items").in("id", componentIds);
        setKitComponents(components?.map(dbToProduct) ?? []);
      }
      setLoading(false);
    }).catch(err => {
      console.error("[WholesaleMenuPage] Error al cargar datos:", err);
      setLoading(false);
    });
  }, []);

  const stockCatalog = useMemo(() => [...products, ...kitComponents], [products, kitComponents]);
  const stockOf = product => availableStock(product, stockCatalog);

  const handleAdd = product => {
    const stock = stockOf(product);
    setCart(previous => {
      const current = previous[product.id] ?? 0;
      const nextQuantity = initialOrderQuantity(current, MIN_WHOLESALE_QTY);
      if (current > 0 && stock > 0 && nextQuantity > stock) return previous;
      return { ...previous, [product.id]: nextQuantity };
    });
  };

  const handleRemove = product => {
    setCart(previous => {
      const nextQuantity = decreaseOrderQuantity(previous[product.id] ?? 0, MIN_WHOLESALE_QTY);
      const next = { ...previous };
      if (nextQuantity === 0) delete next[product.id];
      else next[product.id] = nextQuantity;
      return next;
    });
  };

  const handleQtyChange = (productId, delta) => {
    const product = products.find(candidate => candidate.id === productId);
    if (!product) return;
    if (delta > 0) handleAdd(product);
    else handleRemove(product);
  };

  const cartItems = useMemo(() => Object.entries(cart).map(([productId, qty]) => {
    const product = products.find(candidate => candidate.id === productId);
    if (!product || qty < MIN_WHOLESALE_QTY) return null;
    const price = product.priceWholesale;
    return {
      productId,
      name: product.name,
      qty,
      price,
      originalPrice: price,
      priceOverridden: false,
      subtotal: price * qty,
      isKit: (product.kitItems?.length ?? 0) > 0,
      kitItems: product.kitItems || [],
      includeInTicket: true,
      category: product.category,
      frozen: false,
    };
  }).filter(Boolean), [cart, products]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const requiresPreparation = cartRequiresPreparation(cartItems, products, stockOf);

  const grouped = categories
    .map(cat => ({
      cat,
      prods: products.filter(p => p.category === cat),
    }))
    .filter(g => g.prods.length > 0);

  if (confirmation) {
    return (
      <ConfirmationScreen
        info={confirmation}
        onBack={() => {
          setConfirmation(null);
          setCart({});
        }}
      />
    );
  }

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
            <a className="wholesale-back-link" href="/menu">← Menú minorista</a>
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
        <button className="hero-cta wholesale-order-cta" type="button" onClick={() => {
          document.querySelector(".main-content")?.scrollIntoView({ behavior: "smooth" });
        }}>
          Armar pedido
        </button>
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
              {prods.map(prod => {
                const qty = cart[prod.id] ?? 0;
                const stock = stockOf(prod);
                return (
                <div key={prod.id} className={`product-card${stock <= 0 ? " product-card--sin-stock" : ""}`}>
                  <ProductImage product={prod} />
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
                    <div className="product-card-actions">
                      {stock < MIN_WHOLESALE_QTY && <span className="sin-stock-badge">A elaborar · 48 h</span>}
                      <QtyControl
                        qty={qty}
                        stock={stock}
                        addLabel="+ Agregar 4"
                        onAdd={() => handleAdd(prod)}
                        onRemove={() => handleRemove(prod)}
                      />
                    </div>
                  </div>
                </div>
                );
              })}
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
          <a href="/menu" style={{ color: "rgba(168,200,232,0.75)", fontFamily: "Arial, sans-serif", fontSize: 12, textDecoration: "none" }}>
            ← Ver menú minorista
          </a>
        </div>
      </footer>

      {cartCount > 0 ? (
        <button className="cart-fab wholesale-cart-fab" onClick={() => setShowCart(true)}>
          <CartIcon count={cartCount} />
          <span>Ver pedido · {formatPrice(cartTotal)}</span>
        </button>
      ) : (
        <a className="wpp-fab" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          <WppIcon />
          Consultar por WhatsApp
        </a>
      )}

      {showCart && (
        <CartDrawer
          cartItems={cartItems}
          products={products}
          stockOf={stockOf}
          onClose={() => setShowCart(false)}
          onQtyChange={handleQtyChange}
          onCheckout={() => { setShowCart(false); setShowCheckout(true); }}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          cartItems={cartItems}
          subtotal={cartTotal}
          requiresPreparation={requiresPreparation}
          priceList="wholesale"
          onClose={() => setShowCheckout(false)}
          onSuccess={info => {
            setShowCheckout(false);
            setConfirmation(info);
          }}
        />
      )}
    </div>
  );
}

// ── Componente raíz ───────────────────────────────────────────────────────────
export default function WholesaleMenuPage() {
  return <WholesaleMenu />;
}
