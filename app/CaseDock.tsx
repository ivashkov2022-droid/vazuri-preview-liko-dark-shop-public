"use client";

import { useEffect, useRef, useState } from "react";

type CaseDockProps = {
  onBrief: () => void;
};

export default function CaseDock({ onBrief }: CaseDockProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const outlineRef = useRef<SVGPathElement>(null);
  const completionShown = useRef(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("return") || "ru-project-nightshift";
    if (!/^(ru|en)-(project|case)-(nightshift|hotel|urban|revive|slides|skyvilla|altera|scrollsync|relief)$/.test(token)) return;
    const language = token.slice(0, 2);
    const anchor = token.replace(/^(ru|en)-/, "");
    backLinkRef.current?.setAttribute("href", `${window.location.origin}${language === "en" ? "/en" : "/"}?fromCase=${encodeURIComponent(token)}#${anchor}`);
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const scrollingElement = document.scrollingElement || document.documentElement;
      const viewportHeight = scrollingElement.clientHeight || window.innerHeight;
      const available = Math.max(scrollingElement.scrollHeight - viewportHeight, 1);
      const scrollTop = Math.max(window.scrollY, scrollingElement.scrollTop);
      const remaining = Math.max(0, available - scrollTop);
      const progress = Math.max(0, Math.min(1, scrollTop / available));
      if (outlineRef.current) outlineRef.current.style.strokeDashoffset = (1 - progress).toFixed(4);
      rootRef.current?.querySelectorAll<SVGGraphicsElement>("[data-sole-lug]").forEach((lug) => {
        const start = Number(lug.dataset.start || 0);
        const end = Number(lug.dataset.end || 1);
        const segmentProgress = Math.max(0, Math.min(1, (progress - start) / Math.max(end - start, 0.01)));
        const easedProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress);
        lug.style.opacity = easedProgress.toFixed(3);
        lug.style.transform = `scale(${(0.84 + easedProgress * 0.16).toFixed(3)})`;
      });
      if (scrollTop > 0 && remaining <= Math.max(32, viewportHeight * 0.04) && !completionShown.current) {
        completionShown.current = true;
        setOpen(true);
      }
    };
    const scheduleProgress = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };
    updateProgress();
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    window.addEventListener("scrollend", scheduleProgress);
    window.addEventListener("touchend", scheduleProgress, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleProgress);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      window.removeEventListener("scrollend", scheduleProgress);
      window.removeEventListener("touchend", scheduleProgress);
      window.visualViewport?.removeEventListener("resize", scheduleProgress);
    };
  }, []);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (open && !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <aside
      ref={rootRef}
      className={`v2-console v2-console--nightshift${open ? " is-open" : ""}`}
      aria-label="Навигация VAZURI"
      onPointerEnter={() => {
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setOpen(true);
      }}
      onPointerLeave={() => {
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setOpen(false);
      }}
    >
      <div className="v2-console__panel" hidden={!open}>
        <div className="v2-console__head">
          <div>
            <p>VAZURI / CASE CHANNEL</p>
            <strong>NIGHTSHIFT</strong>
          </div>
          <span className="v2-console__status">Live case</span>
        </div>
        <nav className="v2-console__actions" aria-label="Действия с кейсом">
          <a ref={backLinkRef} className="v2-console__action" href="https://vazuri.io/#projects">
            <span>Все проекты</span><span aria-hidden="true">←</span>
          </a>
          <button className="v2-console__action" type="button" onClick={() => { setOpen(false); onBrief(); }}>
            <span>Обсудить проект</span><span aria-hidden="true">↗</span>
          </button>
        </nav>
      </div>
      <button
        className="v2-console__toggle"
        type="button"
        aria-expanded={open}
        aria-label={open ? "Закрыть навигацию VAZURI" : "Открыть навигацию VAZURI"}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="v2-console__beacon" aria-hidden="true">
          <svg className="v2-sole" viewBox="0 0 40 62" focusable="false">
            <defs>
              <clipPath id="v2-nightshift-sole-clip">
                <path d="M20 1.3c7.8 0 12.4 4.8 12.7 12 .2 5.5-2.2 9.5-1.5 14.7.7 5.1 3.8 10.1 3.1 16.3-.8 7.6-5.7 13.4-12.5 14.7-6.3 1.2-12-2-13.8-7.6-1.7-5.3 1.4-10 1.9-14.9.5-5.1-2.6-10.2-2.7-16.2C7 9.6 11.3 1.3 20 1.3Z" />
              </clipPath>
            </defs>
            <g clipPath="url(#v2-nightshift-sole-clip)">
              <g className="v2-sole__lug" data-sole-lug data-start="0" data-end="0.18"><path d="M10.3 7.6C12.4 4 15.4 2.1 18.8 2l-.7 7.4-5.6 2.8Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.04" data-end="0.22"><path d="m21.7 52.8 7.2-2.9c-.9 4-3.4 6.7-7.5 7.8Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.1" data-end="0.28"><path d="M21.2 2.1c4.2.4 7.2 2.5 8.8 5.8l-3.4 4.5-5.9-3Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.16" data-end="0.34"><path d="m11.2 52.9 8.2-.8-.7 5.7c-3.2-.5-5.8-2.1-7.5-4.9Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.22" data-end="0.4"><path d="m8.2 13.8 9.5-2.6.1 6.6-9.8 3.7Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.28" data-end="0.46"><path d="m21.9 44.2 8.1.9-1 6.2-7.7-1.9Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.34" data-end="0.52"><path d="m21.1 11.4 9.6 2.1-.1 7.3-9.8-3.2Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.4" data-end="0.58"><path d="m10.5 45.1 8.4-1.1.9 5.6-8.8 1.4Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.46" data-end="0.64"><path d="m7.9 24 8.9-4.1 2.1 5.7-8.3 5.9Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.52" data-end="0.7"><path d="m21.6 34.9 7.7-2.3-.5 5.1-6.9 3.8-2-4.3Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.58" data-end="0.76"><path d="m21.3 20.1 10 3.1-2.5 7.5-8.3-5.2Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.64" data-end="0.82"><path d="m11 32.9 6.4-4.7 2.1 4.9-5.9 5.8-3.5-1.5Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.72" data-end="0.9"><path d="m12.2 40.1 5.8-4.4 1.8 5.3-5.8 3.3-2.9-1.7Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.8" data-end="0.98"><path d="m21.8 40.2 6.5-.8 1.3 3.8-7.5-.8Z" /></g>
            </g>
          </svg>
        </span>
        <svg className="v2-console__outline" viewBox="0 0 56 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path ref={outlineRef} pathLength="1" d="M55.5 63.5H.5V.5H55.5V63.5" />
        </svg>
      </button>
    </aside>
  );
}
