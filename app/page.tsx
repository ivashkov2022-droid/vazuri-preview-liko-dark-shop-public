"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

const products = [
  {
    code: "01",
    name: "VECTOR 01",
    kind: "Trail sneaker",
    price: "$240",
    image: "/images/shop-category-1.jpg",
  },
  {
    code: "02",
    name: "STATIC PINK",
    kind: "Oversized jersey",
    price: "$110",
    image: "/images/shop-category-2.jpg",
  },
  {
    code: "03",
    name: "PHASE SET",
    kind: "Movement system",
    price: "$185",
    image: "/images/shop-category-3.jpg",
  },
];

export default function Home() {
  const [bagCount, setBagCount] = useState(0);
  const [briefOpen, setBriefOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [selectedSize, setSelectedSize] = useState("42");
  const [menuOpen, setMenuOpen] = useState(false);
  const dropRef = useRef<HTMLElement>(null);
  const prompted = useRef(false);

  useEffect(() => {
    const node = dropRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !prompted.current) {
          prompted.current = true;
          window.setTimeout(() => setBriefOpen(true), 700);
        }
      },
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBriefOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function addToBag() {
    setBagCount((count) => count + 1);
  }

  function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Nightshift home">
          NIGHT<span>/</span>SHIFT
        </a>
        <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Main navigation">
          <a href="#shop" onClick={() => setMenuOpen(false)}>Shop</a>
          <a href="#drop" onClick={() => setMenuOpen(false)}>Drop 02</a>
          <button onClick={() => { setBriefOpen(true); setMenuOpen(false); }}>Build your store</button>
        </nav>
        <div className="header-actions">
          <button className="bag-button" onClick={() => setBriefOpen(true)}>
            Bag <span>({String(bagCount).padStart(2, "0")})</span>
          </button>
          <button
            className="menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <Image
          className="hero-image"
          src="/images/shop-slider-1.jpg"
          alt="Runner wearing bright red technical footwear"
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-wash" />
        <div className="hero-meta">
          <span>Drop 02 / 2026</span>
          <span>Field test 55.7558° N</span>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Technical footwear for the off-hours</p>
          <h1>
            <span>RUN</span>
            <span className="outline">AFTER</span>
            <span>DARK</span>
          </h1>
          <div className="hero-bottom">
            <p>
              Built for motion when the city switches off. Limited systems,
              tested between dusk and first light.
            </p>
            <a className="round-link" href="#shop" aria-label="Shop the drop">
              <span>Shop</span>
              <b>↘</b>
            </a>
          </div>
        </div>
        <div className="ticker" aria-hidden="true">
          <div>
            NIGHT RUNNING SYSTEMS — WORLDWIDE SHIPPING — DROP 02 LIVE —
            NIGHT RUNNING SYSTEMS — WORLDWIDE SHIPPING — DROP 02 LIVE —
          </div>
        </div>
      </section>

      <section className="shop-section" id="shop">
        <div className="section-intro">
          <p className="section-label">01 / Field wardrobe</p>
          <h2>BUILT FOR THE<br />HOURS NO ONE SEES.</h2>
          <p className="section-note">
            Three modular silhouettes. No seasons, no noise — only equipment
            for bodies in motion.
          </p>
        </div>

        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.name}>
              <div className="product-image-wrap">
                <Image
                  className="product-image"
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
                <span className="product-code">NS/{product.code}</span>
                <button onClick={addToBag} aria-label={`Add ${product.name} to bag`}>
                  +
                </button>
              </div>
              <div className="product-info">
                <div>
                  <h3>{product.name}</h3>
                  <p>{product.kind}</p>
                </div>
                <strong>{product.price}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="drop-section" id="drop" ref={dropRef}>
        <div className="drop-visual">
          <Image
            src="/images/shop-banner-1.jpg"
            alt="Grey technical sneaker floating in a dark studio"
            fill
            sizes="(max-width: 900px) 100vw, 55vw"
          />
          <span className="vertical-note">GRIP TEST / ASPHALT / 04:17</span>
          <span className="drop-number">04</span>
        </div>

        <div className="drop-panel">
          <p className="section-label">02 / Object study</p>
          <div>
            <p className="drop-kicker">OBJECT 04 — CONCRETE</p>
            <h2>ZERO LIGHT.<br /><em>MAX GRIP.</em></h2>
            <p className="drop-description">
              A low-profile night runner with a carbon heel cage, reactive
              tread and weatherproof mono-shell. Made in a run of 400.
            </p>
          </div>
          <div className="size-block">
            <div className="size-heading">
              <span>EU size</span>
              <button>Size guide ↗</button>
            </div>
            <div className="sizes">
              {["39", "40", "41", "42", "43", "44", "45"].map((size) => (
                <button
                  className={selectedSize === size ? "active" : ""}
                  key={size}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <button className="add-button" onClick={addToBag}>
            <span>Add Object 04 — EU {selectedSize}</span>
            <strong>$260 ↗</strong>
          </button>
          <div className="service-row">
            <span>Free shipping over $200</span>
            <span>30 day field test</span>
            <span>Numbered edition</span>
          </div>
        </div>
      </section>

      <footer>
        <div>
          <span>Nightshift®</span>
          <span>Independent running systems</span>
        </div>
        <button onClick={() => setBriefOpen(true)}>Want a site like this? ↗</button>
      </footer>

      {briefOpen && (
        <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="brief-title">
          <button className="modal-backdrop" onClick={() => setBriefOpen(false)} aria-label="Close form" />
          <div className="brief-modal">
            <div className="brief-poster">
              <span>VZR / PREVIEW 05</span>
              <h2>BUILD<br />THE NEXT<br /><em>CULT STORE.</em></h2>
              <p>Strategy / Art direction / Development</p>
            </div>
            <div className="brief-form-wrap">
              <button className="modal-close" onClick={() => setBriefOpen(false)}>Close ×</button>
              {sent ? (
                <div className="sent-state">
                  <span>Transmission received / 05</span>
                  <h2>YOUR PROJECT<br />IS ON OUR RADAR.</h2>
                  <p>We will send selected concepts and next steps shortly.</p>
                  <button onClick={() => setBriefOpen(false)}>Back to the drop</button>
                </div>
              ) : (
                <form onSubmit={submitBrief}>
                  <p className="form-index">Project access / 01—04</p>
                  <h2 id="brief-title">WANT THE FULL<br />EXPERIENCE?</h2>
                  <p className="form-lead">
                    Leave your details. We will send more selected work and a
                    direction for your project.
                  </p>
                  <label>
                    <span>01 / Your name</span>
                    <input name="name" placeholder="Name or company" required />
                  </label>
                  <label>
                    <span>02 / Contact</span>
                    <input name="contact" placeholder="Email or Telegram" required />
                  </label>
                  <label>
                    <span>03 / What are we building?</span>
                    <select name="project" defaultValue="E-commerce">
                      <option>E-commerce</option>
                      <option>Brand website</option>
                      <option>Product launch</option>
                      <option>Something new</option>
                    </select>
                  </label>
                  <button className="submit-button" type="submit">
                    Send project <span>↗</span>
                  </button>
                  <small>By sending, you agree to a very short, very human conversation.</small>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
