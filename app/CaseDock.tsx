"use client";

import { useEffect, useRef, useState } from "react";

type CaseDockProps = {
  onBrief: () => void;
  briefOpen?: boolean;
};

export default function CaseDock({ onBrief, briefOpen = false }: CaseDockProps) {
  const [open, setOpen] = useState(false);
  const [complete, setComplete] = useState(false);
  const backHref = "https://vazuri.io/?fromCase=ru-project-nightshift#project-nightshift";
  const rootRef = useRef<HTMLElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const progressRef = useRef<SVGCircleElement>(null);
  const completionPromptShown = useRef(false);
  const hoverCloseTimer = useRef(0);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("return") || "ru-project-nightshift";
    const valid = /^(ru|en)-(project|case)-(nightshift|hotel|urban|revive|slides|skyvilla|altera|scrollsync|relief)$/.test(token);
    const safeToken = valid ? token : "ru-project-nightshift";
    const language = safeToken.slice(0, 2);
    const anchor = safeToken.replace(/^(ru|en)-/, "");
    const base = language === "en" ? "https://vazuri.io/en" : "https://vazuri.io/";
    backLinkRef.current?.setAttribute("href", base + "?fromCase=" + encodeURIComponent(safeToken) + "#" + anchor);
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollingElement = document.scrollingElement || document.documentElement;
      const viewportHeight = scrollingElement.clientHeight || window.innerHeight;
      const available = Math.max(scrollingElement.scrollHeight - viewportHeight, 1);
      const scrollTop = Math.max(window.scrollY, scrollingElement.scrollTop);
      const remaining = Math.max(0, available - scrollTop);
      const progress = Math.max(0, Math.min(1, scrollTop / available));
      progressRef.current?.style.setProperty("stroke-dashoffset", (1 - progress).toFixed(4));
      rootRef.current?.style.setProperty("--case-progress", progress.toFixed(4));

      const reachedEnd = scrollTop > 0 && remaining <= Math.max(32, viewportHeight * 0.04);
      if (reachedEnd && !completionPromptShown.current && !briefOpen) {
        completionPromptShown.current = true;
        setComplete(true);
        setOpen(true);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scrollend", schedule);
    window.addEventListener("touchend", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scrollend", schedule);
      window.removeEventListener("touchend", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [briefOpen]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
      window.clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  const hoverCapable = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const handlePointerEnter = () => {
    if (!hoverCapable()) return;
    window.clearTimeout(hoverCloseTimer.current);
    setOpen(true);
  };
  const handlePointerLeave = () => {
    if (!hoverCapable()) return;
    window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => {
      if (!briefOpen) setOpen(false);
    }, 180);
  };
  const openBrief = () => {
    setOpen(false);
    onBrief();
  };

  return (
    <aside
      ref={rootRef}
      className={`case-dock case-dock--night${open ? " is-open" : ""}${complete ? " is-complete" : ""}`}
      aria-label="Навигация VAZURI"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div className="case-dock__panel" id="nightshift-case-panel" aria-hidden={!open}>
        <div className="case-dock__head">
          <span>NIGHTSHIFT / CASE 01</span>
          <i>RUNNING</i>
        </div>
        <div className="case-dock__actions">
          <a ref={backLinkRef} href={backHref}><span>Вернуться</span><b aria-hidden="true">←</b></a>
          <button type="button" onClick={openBrief}><span>Обсудить проект</span><b aria-hidden="true">↗</b></button>
        </div>
      </div>
      <button
        className="case-dock__toggle"
        type="button"
        aria-expanded={open}
        aria-controls="nightshift-case-panel"
        aria-label={open ? "Закрыть навигацию VAZURI" : "Открыть навигацию VAZURI"}
        onClick={() => setOpen((value) => !value)}
      >
        <svg className="case-dock__track" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
          <circle className="case-dock__track-base" cx="36" cy="36" r="34" />
          <circle ref={progressRef} className="case-dock__track-progress" pathLength="1" cx="36" cy="36" r="34" />
        </svg>
        <span className="case-dock__dial" aria-hidden="true">
          <strong>NS</strong>
          <small>01 / RUN</small>
          <i />
        </span>
        <span className="case-dock__sr-only">VAZURI</span>
      </button>
    </aside>
  );
}
