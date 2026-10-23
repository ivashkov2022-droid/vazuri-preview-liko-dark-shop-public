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
      rootRef.current?.querySelectorAll<SVGPathElement>("[data-sole-track]").forEach((track) => {
        const start = Number(track.dataset.start || 0);
        const end = Number(track.dataset.end || 1);
        const segmentProgress = Math.max(0, Math.min(1, (progress - start) / Math.max(end - start, 0.01)));
        track.style.strokeDashoffset = (1 - segmentProgress).toFixed(4);
        track.style.opacity = (0.16 + segmentProgress * 0.84).toFixed(3);
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
          <svg className="v2-sole" viewBox="0 0 38 54" focusable="false">
            <path className="v2-sole__shell" d="M19 2.5c5.4 0 8.2 3.1 8.9 7.2.9 5.1-1.3 8.7-.4 13.2.8 4.1 4 7.6 3.5 13.1-.6 6.4-4 13.5-10.6 15.4-5.3 1.6-10.4-1.5-12-6.4-1.5-4.4 1.1-8.8 1.5-12.8.5-4.8-2.5-9-2.8-14.1-.4-6 1.4-11.1 5.6-13.7A11.7 11.7 0 0 1 19 2.5Z" />
            <path className="v2-sole__track v2-sole__contour" data-sole-track data-start="0.08" data-end="1" pathLength="1" d="M19 2.5c5.4 0 8.2 3.1 8.9 7.2.9 5.1-1.3 8.7-.4 13.2.8 4.1 4 7.6 3.5 13.1-.6 6.4-4 13.5-10.6 15.4-5.3 1.6-10.4-1.5-12-6.4-1.5-4.4 1.1-8.8 1.5-12.8.5-4.8-2.5-9-2.8-14.1-.4-6 1.4-11.1 5.6-13.7A11.7 11.7 0 0 1 19 2.5Z" />
            <path className="v2-sole__track" data-sole-track data-start="0" data-end="0.3" pathLength="1" d="M12.1 9.5c3.8-3.7 10.5-3.8 14.2.3" />
            <path className="v2-sole__track" data-sole-track data-start="0.08" data-end="0.38" pathLength="1" d="M26.8 14.5c-4.9-3.8-11.6-3.6-16.3.1" />
            <path className="v2-sole__track" data-sole-track data-start="0.16" data-end="0.47" pathLength="1" d="M9.9 19.2c4.7-3.5 12.7-3.8 17.5.5" />
            <path className="v2-sole__track v2-sole__lug" data-sole-track data-start="0.23" data-end="0.53" pathLength="1" d="m10.8 24.2 6.2-2.8m10.3 2.9-6.2-2.8" />
            <path className="v2-sole__track v2-sole__lug" data-sole-track data-start="0.34" data-end="0.64" pathLength="1" d="m17.2 29-6.6-2.5m16.9.2-6.3 2.6" />
            <path className="v2-sole__track v2-sole__waist" data-sole-track data-start="0.43" data-end="0.72" pathLength="1" d="m12.3 32.1 4.2 2.5 4.5-2.1 5 2.7" />
            <path className="v2-sole__track" data-sole-track data-start="0.52" data-end="0.79" pathLength="1" d="M28.8 38.8c-4.2-3.8-12.9-4.6-18-.5" />
            <path className="v2-sole__track" data-sole-track data-start="0.63" data-end="0.9" pathLength="1" d="M9.6 43.2c5-4.1 14.4-4 19.4.3" />
            <path className="v2-sole__track v2-sole__heel" data-sole-track data-start="0.76" data-end="1" pathLength="1" d="M26.3 47.1c-4.2 3.1-10.6 2.8-14.2-.5" />
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
