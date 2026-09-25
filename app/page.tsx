"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

const assetBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const products = [
  {
    code: "01",
    name: "VECTOR 01",
    kind: "Trail sneaker",
    price: "$240",
    image: `${assetBase}/images/shop-category-1.jpg`,
  },
  {
    code: "02",
    name: "STATIC PINK",
    kind: "Oversized jersey",
    price: "$110",
    image: `${assetBase}/images/shop-category-2.jpg`,
  },
  {
    code: "03",
    name: "PHASE SET",
    kind: "Movement system",
    price: "$185",
    image: `${assetBase}/images/shop-category-3.jpg`,
  },
];

export default function Home() {
  const [bagCount, setBagCount] = useState(0);
  const [briefOpen, setBriefOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "error">("idle");
  const [selectedSize, setSelectedSize] = useState("42");
  const [menuOpen, setMenuOpen] = useState(false);
  const dropRef = useRef<HTMLElement>(null);
  const prompted = useRef(false);

  useEffect(() => {
    const node = dropRef.current;
    if (!node) return;

    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || prompted.current) return;
        prompted.current = true;
        timer = window.setTimeout(() => {
          setSent(false);
          setFormStatus("idle");
          setBriefOpen(true);
        }, 700);
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
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

  useEffect(() => {
    if (!briefOpen) return;
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    const previousRootOverflow = root.style.overflow;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    root.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      root.style.overflow = previousRootOverflow;
      Object.assign(body.style, previousBodyStyles);
      window.scrollTo(0, scrollY);
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, [briefOpen]);

  function openBrief() {
    prompted.current = true;
    setSent(false);
    setFormStatus("idle");
    setBriefOpen(true);
  }

  function addToBag() {
    setBagCount((count) => count + 1);
  }

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFormStatus("sending");

    try {
      const response = await fetch("https://vazuri.ru/lead.php", {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({
          source: "behance",
          website: data.get("website") || "",
          name: data.get("name") || "",
          contact: data.get("contact") || "",
          company: "",
          message: `Материалы по кейсу NIGHTSHIFT. Интерес: ${data.get("project") || "визуальное решение"}.`,
          consent: data.get("consent") || "",
        }),
      });
      if (response.type !== "opaque" && !response.ok) throw new Error("send_failed");
      form.reset();
      setSent(true);
      setFormStatus("idle");
    } catch {
      setFormStatus("error");
    }
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
          <button onClick={() => { openBrief(); setMenuOpen(false); }}>Case notes</button>
        </nav>
        <div className="header-actions">
          <button className="bag-button" type="button">
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
          src={`${assetBase}/images/shop-slider-1.jpg`}
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
            src={`${assetBase}/images/shop-banner-1.jpg`}
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
      </footer>

      {briefOpen && (
        <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="brief-title">
          <button className="modal-backdrop" onClick={() => setBriefOpen(false)} aria-label="Close form" />
          <div className="brief-modal">
            <div className="brief-poster">
              <span>VAZURI / КЕЙС 01</span>
              <h2>СОЗДАДИМ<br />ВАШ ЦИФРОВОЙ<br /><em>ОБРАЗ.</em></h2>
              <p>Стратегия / арт-дирекшн / разработка</p>
            </div>
            <div className="brief-form-wrap">
              <button className="modal-close" onClick={() => setBriefOpen(false)}>Закрыть ×</button>
              {sent ? (
                <div className="sent-state">
                  <span>Запрос принят / 01</span>
                  <h2>МАТЕРИАЛЫ<br />УЖЕ В ПУТИ.</h2>
                  <p>Свяжемся с вами и предложим следующий логичный шаг.</p>
                  <button onClick={() => setBriefOpen(false)}>Вернуться к проекту</button>
                </div>
              ) : (
                <form onSubmit={submitBrief}>
                  <p className="form-index">Материалы по кейсу / NIGHTSHIFT</p>
                  <h2 id="brief-title">ХОТИТЕ РАЗОБРАТЬ<br />ЭТО РЕШЕНИЕ?</h2>
                  <p className="form-lead">
                    Оставьте контакт — отправим краткий разбор визуальной системы
                    и подскажем, как применить похожий подход в вашем проекте.
                  </p>
                  <input className="website-field" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                  <label>
                    <span>01 / Ваше имя</span>
                    <input name="name" autoComplete="name" placeholder="Имя или компания" required />
                  </label>
                  <label>
                    <span>02 / Как с вами связаться?</span>
                    <input name="contact" autoComplete="email" placeholder="Email или Telegram" required />
                  </label>
                  <label>
                    <span>03 / Что вам интересно?</span>
                    <select name="project" defaultValue="Разбор визуального решения">
                      <option>Разбор визуального решения</option>
                      <option>Сайт бренда</option>
                      <option>Запуск продукта</option>
                      <option>Другое</option>
                    </select>
                  </label>
                  <label className="consent-row">
                    <input name="consent" type="checkbox" required />
                    <span>Соглашаюсь на обработку персональных данных</span>
                  </label>
                  <button className="submit-button" type="submit">
                    {formStatus === "sending" ? "Отправляем…" : "Получить материалы"} <span>↗</span>
                  </button>
                  {formStatus === "error" && (
                    <small className="form-error">Не удалось отправить. Напишите нам: hello@vazuri.ru</small>
                  )}
                  <small>Никакой рассылки — только материалы по кейсу и ответ по вашему запросу.</small>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
