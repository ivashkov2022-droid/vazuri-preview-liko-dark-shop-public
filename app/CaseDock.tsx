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
      rootRef.current?.querySelectorAll<SVGGraphicsElement>("[data-sole-lug]").forEach((lug) => {
        const start = Number(lug.dataset.start || 0);
        const end = Number(lug.dataset.end || 1);
        const segmentProgress = Math.max(0, Math.min(1, (progress - start) / Math.max(end - start, 0.01)));
        const easedProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress);
        lug.style.opacity = easedProgress.toFixed(3);
        lug.style.transform = `scale(${(0.72 + easedProgress * 0.28).toFixed(3)})`;
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
          <svg className="v2-sole" viewBox="0 0 42 60" focusable="false">
            <defs>
              <clipPath id="v2-nightshift-sole-clip">
                <path d="M21 1.5c7.6 0 11.6 4.8 11.8 11.9.1 5.2-2.1 9.2-1.2 14.4.8 4.8 3.9 9.2 3.4 15.3-.6 7.6-5.7 13.1-12.8 14.5-6.6 1.3-12.6-2.1-14.4-7.8-1.6-5.2 1.6-9.4 2.1-14.1.6-5-2.5-9.5-2.7-15.6C6.4 9.9 11.1 1.5 21 1.5Z" />
              </clipPath>
            </defs>
            <g clipPath="url(#v2-nightshift-sole-clip)">
              <g className="v2-sole__lug" data-sole-lug data-start="0" data-end="0.18">
                <path d="M14.4 4.7C18 1.8 24.5 1.8 28 4.8l-2.2 5.6-4.8 1.5-4.7-1.6Z" />
                <path className="v2-sole__cut" d="M16.7 7.7h8.7" />
              </g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.06" data-end="0.26"><path d="m22 52.5 8.1-5.3c-.4 5.4-3.2 8.8-8.2 10.2Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.12" data-end="0.32"><path d="m9.8 7.8 5.4 3.4-1.3 8.1-6.7 1.8c-.3-5.4.5-9.7 2.6-13.3Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.18" data-end="0.38"><path d="m9.7 47.4 9.3 5.2-1.8 4.6c-4.1-.8-6.8-4-7.5-9.8Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.24" data-end="0.44"><path d="m27.3 10.7 5-3.7c1.8 4.1 2.1 8.8.8 13.3l-6.6-1.6Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.3" data-end="0.5">
                <path d="m13.6 44.4 7.5-2.4 8.3 2.8-1 5.5-7.7 2.2-8-2.8Z" />
                <path className="v2-sole__cut" d="m16 47.1 4.9 1.8 5.4-1.6" />
              </g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.36" data-end="0.56">
                <path d="m17 12.5 8 .1 1.4 6.1-5.5 4-5.4-4.1Z" />
                <path className="v2-sole__cut" d="m18.2 16.1 2.8 2.2 3-2.1" />
              </g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.42" data-end="0.62"><path d="m24.4 35.3 6.8-1.2 1.8 7.8-6.6 2-3.7-3.8Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.48" data-end="0.68"><path d="m7.6 23.1 8.6-2.4 3.1 4.3-4.4 5.5-6.7 1Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.54" data-end="0.74"><path d="m10.3 34.2 7.5 1.3 2.2 4.9-3.9 3.5-6.7-2Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.62" data-end="0.82"><path d="m25.8 20.8 7.7 2.5-.8 8.2-6.9-1-3.8-5.4Z" /></g>
              <g className="v2-sole__lug" data-sole-lug data-start="0.72" data-end="0.96">
                <path d="m15.2 29.2 5.8 3.4 5.7-3.3 2.2 4.4-7.9 5.2-7.9-5.2Z" />
                <path className="v2-sole__cut" d="m17 32.7 4 2.5 4-2.5" />
              </g>
            </g>
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
