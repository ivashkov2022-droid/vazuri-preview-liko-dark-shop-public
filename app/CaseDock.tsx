"use client";

type CaseDockProps = {
  onBrief: () => void;
  theme?: "night" | "altera";
};

export default function CaseDock({ onBrief, theme = "night" }: CaseDockProps) {
  return (
    <aside className={`case-dock case-dock--${theme}`} aria-label="Навигация VAZURI">
      <span className="case-dock__signal" aria-hidden="true"><i /></span>
      <span className="case-dock__status"><b>Кейс VAZURI</b><b>Открыты к проектам</b></span>
      <a href="https://vazuri.ru/#projects">На VAZURI</a>
      <button type="button" onClick={onBrief}>Обсудить проект <span aria-hidden="true">↗</span></button>
    </aside>
  );
}
