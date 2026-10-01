"use client";

import { useEffect, useRef, useState } from "react";

type CaseDockProps = {
  onBrief: () => void;
  theme?: "night" | "altera";
};

export default function CaseDock({ onBrief, theme = "night" }: CaseDockProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

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
    };
  }, []);

  const openBrief = () => {
    setOpen(false);
    onBrief();
  };

  return (
    <aside ref={rootRef} className={`case-dock case-dock--${theme}${open ? " is-open" : ""}`} aria-label="Навигация VAZURI">
      <div className="case-dock__menu" hidden={!open}>
        <a href="https://vazuri.ru/#projects">На сайт</a>
        <button type="button" onClick={openBrief}>Обсудить проект <span aria-hidden="true">↗</span></button>
      </div>
      <button className="case-dock__toggle" type="button" aria-expanded={open} aria-label="Открыть навигацию VAZURI" onClick={() => setOpen((value) => !value)}>
        <span className="case-dock__signal" aria-hidden="true"><i /></span>
        <span className="case-dock__sr-only">VAZURI</span>
      </button>
    </aside>
  );
}
