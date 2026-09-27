import { useEffect, useState } from "react";
import "../landing.css";

const WA_LINK = "https://wa.me/5492281588834?text=Hola%20NUTRIFREE!%20Quisiera%20hacer%20una%20consulta%20%F0%9F%8C%BF";

// Reemplazar `src` por las fotos definitivas del local cuando estén disponibles.
const LOCAL_SLIDES = [
  { id: 1, src: "/imagenes/landing/local-frente.webp.jpeg", label: "Nuestro espacio", caption: "Construcción de nuestra cocina en Azul" },
  { id: 2, src: "/imagenes/landing/local-cocina.webp.png", label: "Nuestra cocina", caption: "Nuestro espacio exclusivo de elaboración" },
  { id: 3, src: null, label: "Hecho en Azul", caption: "Foto del interior del local" },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function LandingPage({ onGoToLogin }) {
  const [localSlide, setLocalSlide] = useState(0);
  const [sliderPaused, setSliderPaused] = useState(false);

  useEffect(() => {
    const nodes = document.querySelectorAll(".landing [data-reveal]");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(node => node.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sliderPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      setLocalSlide(current => (current + 1) % LOCAL_SLIDES.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [sliderPaused]);

  const handleHeroPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--pointer-x", x.toFixed(2));
    event.currentTarget.style.setProperty("--pointer-y", y.toFixed(2));
  };

  return (
    <div className="landing">
      <header className="landing-nav">
        <a href="#inicio" className="landing-logo" aria-label="NutriFree, inicio">
          <img src="/imagenes/logo.png" alt="NutriFree" />
        </a>
        <nav aria-label="Navegación principal">
          <a href="#nosotros">Quiénes somos</a>
          <a href="#propuesta">Lo que hacemos</a>
          <a href="#ubicacion">Dónde estamos</a>
        </nav>
        <a className="landing-nav-cta" href="/menu">Ver catálogo <Arrow /></a>
      </header>

      <main>
        <section className="landing-hero" id="inicio" onMouseMove={handleHeroPointer}>
          <div className="landing-hero-copy" data-reveal>
            <p className="landing-kicker"><i /> Panadería y pastelería sin gluten</p>
            <h1>Comer rico<br />se siente <em>bien.</em></h1>
            <p>Productos artesanales sin TACC, hechos en Azul con ingredientes seleccionados y muchísimo sabor.</p>
            <div className="landing-actions">
              <a className="landing-btn landing-btn--primary" href="/menu">Ver catálogo minorista <Arrow /></a>
              <a className="landing-btn landing-btn--ghost" href="/menu-mayorista">Soy mayorista</a>
            </div>
          </div>
          <div className="landing-hero-art" data-reveal>
            <div className="landing-shape" />
            <img className="landing-hero-img" src="/imagenes/landing/hero-productos.webp.png" alt="Selección de productos artesanales NutriFree" />
            <div className="landing-float landing-float--one">100% sin gluten <b>✓</b></div>
            <div className="landing-float landing-float--two">Hecho con amor <b>♡</b></div>
          </div>
          <a className="landing-scroll" href="#nosotros">Conocenos <span>↓</span></a>
        </section>

        <section className="landing-story" id="nosotros">
          <div className="landing-story-images" data-reveal>
            <img src="/imagenes/landing/quienes-somos.webp.png" alt="Elaboración artesanal en nuestra cocina sin gluten" />
            <img src="/imagenes/landing/detalle-artesanal.webp.png" alt="Detalle de terminación artesanal de un brownie" />
            <span>Desde<br /><strong>Azul</strong></span>
          </div>
          <div className="landing-story-copy" data-reveal>
            <p className="landing-eyebrow">Quiénes somos</p>
            <h2>Creemos que cuidarte no debería hacerte renunciar al sabor.</h2>
            <p className="landing-first-kitchen"><span>01</span><strong>Somos la primera cocina 100% libre de gluten de la ciudad de Azul.</strong></p>
            <p>En NutriFree elaboramos alimentos libres de gluten con una mirada artesanal. Cada receta nace para que compartir una mesa vuelva a ser simple, seguro y delicioso.</p>
            <p>Trabajamos en pequeñas producciones, cuidando los ingredientes y cada detalle del proceso.</p>
            <a href="/menu">Conocé nuestros productos <Arrow /></a>
          </div>
        </section>

        <section className="landing-local" aria-labelledby="local-title">
          <div className="landing-local-heading" data-reveal>
            <div><p className="landing-eyebrow">Nuestro lugar</p><h2 id="local-title">Una cocina pensada<br />para hacer las cosas bien.</h2></div>
            <p>Un espacio dedicado exclusivamente a la elaboración sin gluten, en el corazón de Azul.</p>
          </div>
          <div
            className="landing-local-slider"
            data-reveal
            onMouseEnter={() => setSliderPaused(true)}
            onMouseLeave={() => setSliderPaused(false)}
            onFocus={() => setSliderPaused(true)}
            onBlur={() => setSliderPaused(false)}
          >
            <div className="landing-local-track" style={{ transform: `translateX(-${localSlide * 100}%)` }}>
              {LOCAL_SLIDES.map((slide, index) => (
                <article className={`landing-local-slide landing-local-slide--${index + 1}`} key={slide.id} aria-hidden={localSlide !== index}>
                  {slide.src ? <img src={slide.src} alt={slide.caption} /> : (
                    <div className="landing-photo-placeholder" role="img" aria-label={`${slide.caption}, pendiente de agregar`}>
                      <span>Próximamente</span><strong>{slide.label}</strong><small>{slide.caption}</small>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <div className="landing-slider-ui">
              <p><strong>0{localSlide + 1}</strong> / 0{LOCAL_SLIDES.length}</p>
              <div className="landing-slider-dots" aria-label="Seleccionar imagen del local">
                {LOCAL_SLIDES.map((slide, index) => (
                  <button key={slide.id} className={localSlide === index ? "is-active" : ""} onClick={() => setLocalSlide(index)} aria-label={`Ver ${slide.caption}`} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-offer" id="propuesta">
          <div className="landing-section-title" data-reveal>
            <p className="landing-eyebrow">Lo que hacemos</p>
            <h2>Una opción para cada momento.</h2>
          </div>
          <div className="landing-offer-grid">
            <a href="/menu" className="landing-offer-card" data-reveal>
              <span>01</span><img src="/imagenes/tortas.png" alt="Catálogo minorista" />
              <div><h3>Para tu mesa</h3><p>Panadería, pastelería, tortas, postres y viandas para disfrutar todos los días.</p><b>Ver catálogo <Arrow /></b></div>
            </a>
            <a href="/menu-mayorista" className="landing-offer-card landing-offer-card--dark" data-reveal>
              <span>02</span><img src="/imagenes/panaderia-grandes.svg" alt="Catálogo mayorista" />
              <div><h3>Para tu negocio</h3><p>Una propuesta mayorista confiable para sumar productos sin gluten a tu comercio.</p><b>Ver catálogo mayorista <Arrow /></b></div>
            </a>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="landing-offer-card landing-offer-card--lime" data-reveal>
              <span>03</span><img src="/imagenes/menu-del-dia.png" alt="Pedidos especiales" />
              <div><h3>Pedidos especiales</h3><p>¿Tenés una celebración o una idea? Escribinos y armamos algo rico para vos.</p><b>Hablemos <Arrow /></b></div>
            </a>
          </div>
        </section>

        <section className="landing-values">
          <p>RICO <i>✦</i> ARTESANAL <i>✦</i> SIN GLUTEN <i>✦</i> HECHO EN AZUL <i>✦</i> RICO <i>✦</i> ARTESANAL</p>
        </section>

        <section className="landing-location" id="ubicacion">
          <div className="landing-location-copy" data-reveal>
            <p className="landing-eyebrow">Dónde estamos</p>
            <h2>Somos de Azul,<br />Buenos Aires.</h2>
            <p>Coordiná tu pedido y retiro directamente con nosotros. También podés consultarnos por entregas y disponibilidad.</p>
            <div className="landing-location-actions">
              <a className="landing-btn landing-btn--primary" href={WA_LINK} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp <Arrow /></a>
              <a href="https://www.google.com/maps/search/?api=1&query=Arenales%20724%2C%20B7300%20Azul%2C%20Provincia%20de%20Buenos%20Aires" target="_blank" rel="noopener noreferrer">Ver zona en el mapa <Arrow /></a>
            </div>
          </div>
          <div className="landing-map" data-reveal>
            <div className="landing-map-lines" />
            <div className="landing-pin"><i /><strong>NutriFree</strong><span>Azul, Buenos Aires</span></div>
          </div>
        </section>

        <section className="landing-closing" data-reveal>
          <p>¿Qué vas a probar hoy?</p>
          <h2>Tu próximo favorito<br />está acá.</h2>
          <a className="landing-btn landing-btn--light" href="/menu">Explorar el catálogo <Arrow /></a>
        </section>
      </main>

      <footer className="landing-footer">
        <img src="/imagenes/logo.png" alt="NutriFree" />
        <p>Panadería &amp; pastelería sin gluten · Azul, Buenos Aires</p>
        <div><a href="/menu">Minorista</a><a href="/menu-mayorista">Mayorista</a><a href={WA_LINK}>WhatsApp</a><button onClick={onGoToLogin}>Acceso interno</button></div>
      </footer>
    </div>
  );
}
