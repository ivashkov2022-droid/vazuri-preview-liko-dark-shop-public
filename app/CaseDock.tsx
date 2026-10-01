"use client";

import { useEffect, useRef, useState } from "react";

type CaseDockProps = {
  onBrief: () => void;
  theme?: "night" | "altera";
};

type DockAction = "back" | "brief" | null;

export default function CaseDock({ onBrief, theme = "night" }: CaseDockProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [autoAction, setAutoAction] = useState<DockAction>(null);
  const rootRef = useRef<HTMLElement>(null);
  const manualOpenRef = useRef(false);

  useEffect(() => {
    manualOpenRef.current = manualOpen;
  }, [manualOpen]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      rootRef.current?.style.setProperty("--case-scroll-angle", `${Math.round(window.scrollY * 0.42)}deg`);
      if (manualOpenRef.current) return;
      if (window.scrollY <= 24) {
        setAutoAction(null);
        return;
      }
      const preferredBandSize = Math.max(window.innerHeight * 1.35, 720);
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      const bandSize = maxScroll > 80
        ? Math.min(preferredBandSize, Math.max(120, (maxScroll - 24) / 2))
        : preferredBandSize;
      const band = Math.floor((window.scrollY - 24) / bandSize);
      setAutoAction(band % 2 === 0 ? "back" : "brief");
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setManualOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setManualOpen(false);
    };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  const visibleAction: DockAction = manualOpen ? "back" : autoAction;
  const openBrief = () => {
    setManualOpen(false);
    onBrief();
  };

  return (
    <aside ref={rootRef} className={`case-dock case-dock--${theme}${manualOpen ? " is-open" : ""}${visibleAction ? " has-peek" : ""}`} aria-label="Навигация VAZURI">
      <div className="case-dock__menu" hidden={!visibleAction}>
        <a href="https://vazuri.ru/#projects" hidden={visibleAction !== "back"}>На сайт</a>
        <button type="button" hidden={visibleAction !== "brief"} onClick={openBrief}>Обсудить проект <span aria-hidden="true">↗</span></button>
      </div>
      <button className="case-dock__toggle" type="button" aria-expanded={manualOpen} aria-label="Открыть переход на сайт VAZURI" onClick={() => setManualOpen((value) => !value)}>
        <span className="case-dock__signal" aria-hidden="true"><i /></span>
        <span className="case-dock__sr-only">VAZURI</span>
      </button>
    </aside>
  );
}
