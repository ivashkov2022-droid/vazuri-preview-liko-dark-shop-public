"use client";

import { useEffect, useRef, useState } from "react";

type CaseDockProps = {
  onBrief: () => void;
};

export default function CaseDock({ onBrief }: CaseDockProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const meterRef = useRef<HTMLElement>(null);
  const outlineRef = useRef<SVGPathElement>(null);
  const sneakerTraceRef = useRef<SVGPathElement>(null);
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
      if (meterRef.current) meterRef.current.style.transform = `scaleY(${Math.max(0.1, progress).toFixed(4)})`;
      if (outlineRef.current) outlineRef.current.style.strokeDashoffset = (1 - progress).toFixed(4);
      if (sneakerTraceRef.current) sneakerTraceRef.current.style.strokeDashoffset = (1 - progress).toFixed(4);
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
          <svg viewBox="0 0 50 42" focusable="false">
            <path className="v2-beacon__base" d="M4 28c8 0 11-15 17-15 5 0 8 8 13 10 4 2 8 1 11 5v6H5Z" />
            <path ref={sneakerTraceRef} className="v2-beacon__trace" pathLength="1" d="M5 33h39v-5c-5-5-9-2-15-7-4-3-5-9-9-9-6 0-9 14-16 15" />
            <path className="v2-beacon__detail" d="m18 19 5 2m-7 2 5 2M9 29h28" />
          </svg>
        </span>
        <span className="v2-console__meter" aria-hidden="true"><i ref={meterRef} /></span>
        <svg className="v2-console__outline" viewBox="0 0 76 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path ref={outlineRef} pathLength="1" d="M75.5 63.5H.5V.5H75.5V63.5" />
        </svg>
      </button>
    </aside>
  );
}
