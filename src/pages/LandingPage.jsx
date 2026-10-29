import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../landing.css";

const HERO_PHOTOS = [
  { src: "/imagenes/landing/hero-cookies.jpg", alt: "Cookies artesanales NutriFree" },
  { src: "/imagenes/landing/hero-chipa.jpg", alt: "Chipá artesanal NutriFree" },
  { src: "/imagenes/landing/hero-pizza.jpg", alt: "Pizza individual NutriFree" },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function LandingPage() {
  const [heroPhoto, setHeroPhoto] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroPhoto(current => (current + 1) % HERO_PHOTOS.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

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
          <Link to="/menu">Menú minorista</Link>
          <Link to="/menu-mayorista">Menú mayorista</Link>
        </nav>
        <Link className="landing-nav-cta" to="/menu">Ver menú <Arrow /></Link>
      </header>

      <main>
        <section className="landing-hero" id="inicio" onMouseMove={handleHeroPointer}>
          <div className="landing-hero-copy" data-reveal>
            <p className="landing-kicker"><i /> Panadería y pastelería sin gluten</p>
            <h1>Comer rico<br />se siente <em>bien.</em></h1>
            <p>Productos artesanales sin TACC, hechos en Azul con ingredientes seleccionados y muchísimo sabor.</p>
            <div className="landing-actions">
              <Link className="landing-btn landing-btn--primary" to="/menu">Ver menú minorista <Arrow /></Link>
              <Link className="landing-btn landing-btn--ghost" to="/menu-mayorista">Ver menú mayorista</Link>
            </div>
          </div>
          <div className="landing-hero-art" data-reveal>
            <div className="landing-shape" />
            <img
              className="landing-hero-img is-active"
              src={HERO_PHOTOS[heroPhoto].src}
              alt={HERO_PHOTOS[heroPhoto].alt}
            />
            <div className="landing-float landing-float--one">100% sin gluten <b>✓</b></div>
            <div className="landing-float landing-float--two">Hecho con amor <b>♡</b></div>
          </div>
          <a className="landing-scroll" href="#nosotros">Conocenos <span>↓</span></a>
        </section>

        <section className="landing-story" id="nosotros">
          <div className="landing-story-images" data-reveal>
            <img src="/imagenes/landing/quienes-somos-collage.jpg" alt="Collage artesanal de una persona amasando entre recortes de papel" />
            <img src="/imagenes/landing/detalle-artesanal.jpg" alt="Detalle de terminación artesanal de un brownie" />
            <span>Desde<br /><strong>Azul</strong></span>
          </div>
          <div className="landing-story-copy" data-reveal>
            <p className="landing-eyebrow">Quiénes somos</p>
            <h2>Creemos que cuidarte no debería hacerte renunciar al sabor.</h2>
            <p className="landing-first-kitchen"><span>01</span><strong>Somos la primera cocina 100% libre de gluten de la ciudad de Azul.</strong></p>
            <p>En NutriFree elaboramos alimentos libres de gluten con una mirada artesanal. Cada receta nace para que compartir una mesa vuelva a ser simple, seguro y delicioso.</p>
            <p>Trabajamos en pequeñas producciones, cuidando los ingredientes y cada detalle del proceso.</p>
            <Link to="/menu">Conocé nuestros productos <Arrow /></Link>
          </div>
        </section>

        {/* Las secciones restantes se retomarán en una rama futura. No se
            renderizan para evitar descargas innecesarias en la portada. */}
      </main>
    </div>
  );
}
