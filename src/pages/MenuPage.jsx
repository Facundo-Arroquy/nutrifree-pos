import { useState, useEffect, useMemo } from "react";
import { supabase, dbToProduct, saleToDb } from "../supabase.js";
import { uid, todayStr } from "../shared.jsx";
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function formatPrice(price) {
  return "$ " + price.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// Devuelve el próximo día hábil (lun-sab) a partir de mañana
function nextBusinessDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) { // 0 = domingo
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function isBusinessDay(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() !== 0; // no domingo
}

function WppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CartIcon({ count }) {
  return (
    <div className="cart-fab-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.97-1.67L23 6H6"/>
      </svg>
      {count > 0 && <span className="cart-fab-badge">{count}</span>}
    </div>
  );
}

// ── Selector de cantidad en tarjeta ──────────────────────────────────────────
function QtyControl({ qty, stock, onAdd, onRemove }) {
  if (stock <= 0) {
    return <span className="sin-stock-badge">Sin Stock</span>;
  }
  if (qty === 0) {
    return (
      <button className="btn-add-cart" onClick={onAdd} title="Agregar al carrito">
        + Agregar
      </button>
    );
  }
  return (
    <div className="qty-control">
      <button onClick={onRemove}>−</button>
      <span>{qty}</span>
      <button onClick={onAdd} disabled={qty >= stock}>+</button>
    </div>
  );
}

// ── Drawer del carrito ───────────────────────────────────────────────────────
function CartDrawer({ cartItems, products, onClose, onQtyChange, onCheckout }) {
  const total = cartItems.reduce((s, i) => s + i.subtotal, 0);

  return (
    <>
      <div className="cart-overlay" onClick={onClose} />
      <div className="cart-drawer">
        <div className="cart-drawer-header">
          <h3>Tu pedido</h3>
          <button className="cart-drawer-close" onClick={onClose}>✕</button>
        </div>

        {cartItems.length === 0 ? (
          <div className="cart-empty">
            <span style={{ fontSize: 48 }}>🛒</span>
            <p>Agregá productos para comenzar</p>
          </div>
        ) : (
          <>
            <div className="cart-items-list">
              {cartItems.map(item => {
                const prod = products.find(p => p.id === item.productId);
                return (
                  <div key={item.productId} className="cart-item">
                    <div className="cart-item-info">
                      <span className="cart-item-name">{item.name}</span>
                      <span className="cart-item-price">{formatPrice(item.price)} c/u</span>
                    </div>
                    <div className="cart-item-right">
                      <div className="qty-control">
                        <button onClick={() => onQtyChange(item.productId, -1)}>−</button>
                        <span>{item.qty}</span>
                        <button
                          onClick={() => onQtyChange(item.productId, 1)}
                          disabled={item.qty >= (prod?.stock ?? 0)}
                        >+</button>
                      </div>
                      <span className="cart-item-subtotal">{formatPrice(item.subtotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="cart-drawer-footer">
              <div className="cart-total-row">
                <span>Total</span>
                <strong>{formatPrice(total)}</strong>
              </div>
              <button className="btn-checkout" onClick={onCheckout}>
                Confirmar pedido →
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Modal de checkout ────────────────────────────────────────────────────────
function CheckoutModal({ cartItems, total, onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(nextBusinessDay());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const minDate = nextBusinessDay();
  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().slice(0, 10);
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Ingresá tu nombre."); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 8) {
      setError("Ingresá un teléfono válido."); return;
    }
    if (!date) { setError("Seleccioná una fecha de entrega."); return; }
    if (!isBusinessDay(date)) { setError("El domingo no es día hábil. Elegí otro día."); return; }
    if (date < minDate) { setError("La fecha mínima es mañana."); return; }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const saleId = uid();

      // 1. Crear la venta en Supabase con status "pending" (esperando pago)
      const sale = {
        id: saleId,
        customerId: null,
        customerName: name.trim(),
        items: cartItems,
        total,
        priceList: "retail",
        paymentMethod: "mercadopago",
        status: "pending",
        notes: `Pedido web | Tel: ${phone.trim()}`,
        createdAt: now,
        paidAt: null,
        discountType: "pct",
        discountValue: 0,
        discountAmount: 0,
        deliveryDate: date,
        needsBilling: false,
        billingStatus: null,
      };

      const { error: dbErr } = await supabase.from("sales").insert(saleToDb(sale));
      if (dbErr) throw dbErr;

      // 2. Pedir la preferencia de pago a la Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const fnUrl = `${supabaseUrl}/functions/v1/create-preference`;
      const anonKey = import.meta.env.VITE_SUPABASE;

      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          saleId,
          items: cartItems.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
          customerName: name.trim(),
          customerPhone: phone.trim(),
          deliveryDate: date,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.init_point) throw new Error(data.error || "Error al generar el pago");

      // 3. Redirigir a MercadoPago
      window.location.href = data.init_point;
    } catch (err) {
      console.error("[Checkout] Error:", err);
      setError("Hubo un error al procesar el pago. Por favor intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="cart-overlay" onClick={onClose} />
      <div className="checkout-modal">
        <div className="checkout-modal-header">
          <h3>Completá tu pedido</h3>
          <button className="cart-drawer-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="checkout-form">
          <label>
            Nombre completo
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: María García"
              autoFocus
            />
          </label>

          <label>
            Teléfono (WhatsApp)
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Ej: 2281 588834"
            />
          </label>

          <label>
            Fecha de entrega <span className="checkout-date-hint">(lun–sáb)</span>
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={e => setDate(e.target.value)}
            />
          </label>

          <div className="checkout-summary">
            <span>{cartItems.length} {cartItems.length === 1 ? "producto" : "productos"}</span>
            <strong>{formatPrice(total)}</strong>
          </div>

          {error && <p className="checkout-error">{error}</p>}

          <button type="submit" className="btn-checkout" disabled={submitting}>
            {submitting ? "Registrando…" : "Confirmar pedido →"}
          </button>
        </form>
      </div>
    </>
  );
}

// ── Pantalla de confirmación ─────────────────────────────────────────────────
function ConfirmationScreen({ info, onBack }) {
  const waMsgText = encodeURIComponent(
    `Hola NUTRIFREE! Acabo de hacer un pedido web 🍞\n` +
    `Nombre: ${info.name}\n` +
    `Fecha de entrega: ${info.date}\n` +
    `Total: ${formatPrice(info.total)}\n` +
    `Referencia: #${info.saleId.slice(0, 7).toUpperCase()}`
  );
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waMsgText}`;

  return (
    <div className="confirmation-screen">
      <div className="confirmation-card">
        <div className="confirmation-icon">🎉</div>
        <h2>¡Pedido registrado!</h2>
        <p className="confirmation-sub">
          Tu pedido fue recibido correctamente.<br />
          Nos comunicaremos para coordinar el pago.
        </p>

        <div className="confirmation-details">
          <div className="conf-row">
            <span>Referencia</span>
            <strong>#{info.saleId.slice(0, 7).toUpperCase()}</strong>
          </div>
          <div className="conf-row">
            <span>Nombre</span>
            <strong>{info.name}</strong>
          </div>
          <div className="conf-row">
            <span>Entrega</span>
            <strong>{new Date(info.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</strong>
          </div>
          <div className="conf-row">
            <span>Total</span>
            <strong>{formatPrice(info.total)}</strong>
          </div>
        </div>

        <a className="btn-wpp-confirm" href={waLink} target="_blank" rel="noopener noreferrer">
          <WppIcon />
          Avisarnos por WhatsApp
        </a>

        <button className="btn-back-menu" onClick={onBack}>
          Volver al menú
        </button>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MenuPage({ onGoToLogin }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Carrito: { [productId]: qty }
  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmation, setConfirmation] = useState(null); // { saleId, name, date, total }

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("products").select("*").eq("show_in_menu", true).order("name"),
    ]).then(([{ data: cats }, { data: prods }]) => {
      setCategories(cats?.map(c => c.name) ?? []);
      setProducts(prods?.map(dbToProduct) ?? []);
      setLoading(false);
    }).catch(err => {
      console.error("[MenuPage] Error al cargar datos:", err);
      setLoading(false);
    });
  }, []);

  // ── Helpers del carrito ──────────────────────────────────────────────────
  const handleAdd = (prod) => {
    if (prod.stock <= 0) return;
    setCart(prev => {
      const current = prev[prod.id] ?? 0;
      if (current >= prod.stock) return prev;
      return { ...prev, [prod.id]: current + 1 };
    });
  };

  const handleRemove = (prod) => {
    setCart(prev => {
      const current = prev[prod.id] ?? 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[prod.id];
        return next;
      }
      return { ...prev, [prod.id]: current - 1 };
    });
  };

  const handleQtyChange = (productId, delta) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    if (delta > 0) handleAdd(prod);
    else handleRemove(prod);
  };

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return null;
        const price = prod.priceRetail;
        return {
          productId,
          name: prod.name,
          qty,
          price,
          originalPrice: price,
          priceOverridden: false,
          subtotal: price * qty,
          isKit: false,
          kitItems: [],
          includeInTicket: true,
          category: prod.category,
          frozen: false,
        };
      })
      .filter(Boolean);
  }, [cart, products]);

  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.subtotal, 0);

  const clearCart = () => setCart({});

  // ── Menú del día ──────────────────────────────────────────────────────────
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

  const MENU_DIA_NAMES = ["almuerzo del día", "almuerzo del dia", "almuerzo + cena", "almuerzo+cena"];
  const isMenuDia = p => MENU_DIA_NAMES.some(n => p.name.toLowerCase().includes(n));

  const grouped = categories
    .map(cat => ({
      cat,
      prods: products.filter(p => p.category === cat && !isMenuDia(p)),
    }))
    .filter(g => g.prods.length > 0);

  // ── Pantalla de confirmación ──────────────────────────────────────────────
  if (confirmation) {
    return (
      <ConfirmationScreen
        info={confirmation}
        onBack={() => {
          setConfirmation(null);
          clearCart();
        }}
      />
    );
  }

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
            {showMenuDia && <a href="#menu-dia">Menú del día</a>}
            {grouped.map(({ cat }) => (
              <a key={cat} href={`#${toSlug(cat)}`}>{cat}</a>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge-singluten">Sin Gluten</span>
            <a
              href="/menu-mayorista"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.3)",
                color: "rgba(255,255,255,0.85)",
                fontFamily: "Arial, sans-serif",
                fontSize: 12,
                fontWeight: "bold",
                letterSpacing: 1,
                textTransform: "uppercase",
                padding: "6px 14px",
                borderRadius: 20,
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "background 0.2s, color 0.2s",
              }}
              onMouseOver={e => { e.target.style.background = "rgba(255,255,255,0.22)"; e.target.style.color = "white"; }}
              onMouseOut={e => { e.target.style.background = "rgba(255,255,255,0.12)"; e.target.style.color = "rgba(255,255,255,0.85)"; }}
            >
              🏢 Mayoristas
            </a>
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
                <img src={CAT_IMAGES[cat]} alt={cat} className="category-img-thumb" />
              ) : (
                <div className="category-img-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "2rem" }}>🌿</span>
                </div>
              )}
              <div className="category-title-block">
                <h2>{cat}</h2>
                <div className="category-divider" />
              </div>
            </div>
            <div className="product-grid">
              {prods.map(prod => {
                const qty = cart[prod.id] ?? 0;
                const hasPrice = prod.priceRetail > 0;
                return (
                  <div key={prod.id} className={`product-card${prod.stock <= 0 ? " product-card--sin-stock" : ""}`}>
                    <div className="product-card-accent" />
                    <div className="product-card-body">
                      <p className="product-name">{prod.name}</p>
                      <div className="product-price-row">
                        {hasPrice ? (
                          <span className="product-price">{formatPrice(prod.priceRetail)}</span>
                        ) : (
                          <span className="product-price consultar">Consultar precio</span>
                        )}
                        <span className="singluten-dot" title="Sin TACC" />
                      </div>
                      {hasPrice && (
                        <div className="product-card-actions">
                          <QtyControl
                            qty={qty}
                            stock={prod.stock}
                            onAdd={() => handleAdd(prod)}
                            onRemove={() => handleRemove(prod)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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

      {/* ── FAB carrito ── */}
      {cartCount > 0 && (
        <button className="cart-fab" onClick={() => setShowCart(true)}>
          <CartIcon count={cartCount} />
          <span>Ver pedido · {formatPrice(cartTotal)}</span>
        </button>
      )}

      {/* ── FAB WhatsApp (solo sin carrito) ── */}
      {cartCount === 0 && (
        <a className="wpp-fab" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          <WppIcon />
          Hacer pedido
        </a>
      )}

      {/* ── Drawer del carrito ── */}
      {showCart && (
        <CartDrawer
          cartItems={cartItems}
          products={products}
          onClose={() => setShowCart(false)}
          onQtyChange={handleQtyChange}
          onCheckout={() => { setShowCart(false); setShowCheckout(true); }}
        />
      )}

      {/* ── Modal checkout ── */}
      {showCheckout && (
        <CheckoutModal
          cartItems={cartItems}
          total={cartTotal}
          onClose={() => setShowCheckout(false)}
          onSuccess={(info) => {
            setShowCheckout(false);
            setConfirmation(info);
          }}
        />
      )}
    </>
  );
}
