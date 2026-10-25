"use client";

import { useEffect, useRef, useState } from "react";
import { createCaseCompletionLifecycle } from "./beacon-completion.js";

type CaseDockProps = {
  onBrief: () => void;
};

const arrowCellIndexes = new Set([3, 9, 15, 21, 22, 23, 24, 25, 26, 27, 29, 37, 45]);

const puzzleCells = Array.from({ length: 49 }, (_, index) => {
  const column = index % 7;
  const row = Math.floor(index / 7);
  const order = (index * 17) % 49;
  const direction = (column + row * 2) % 4;
  const offsets = [
    { x: -12, y: 0, rotate: -18 },
    { x: 0, y: -12, rotate: 14 },
    { x: 12, y: 0, rotate: 18 },
    { x: 0, y: 12, rotate: -14 },
  ] as const;
  const start = 0.015 + (order / 48) * 0.72;

  return {
    index,
    column,
    row,
    start,
    end: Math.min(start + 0.18, 0.9),
    ...offsets[direction],
  };
});

const puzzleCompletionProgress = Math.max(...puzzleCells.map((piece) => Number(piece.end.toFixed(4))));

export default function CaseDock({ onBrief }: CaseDockProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  const outlineProgressRef = useRef<SVGPathElement>(null);
  const outlineRunnerRef = useRef<SVGPathElement>(null);
  const desiredOpenRef = useRef(false);
  const completionLifecycleRef = useRef<ReturnType<typeof createCaseCompletionLifecycle> | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("return") || "ru-project-nightshift";
    if (!/^(ru|en)-(project|case)-(nightshift|hotel|urban|revive|slides|skyvilla|altera|scrollsync|relief)$/.test(token)) return;
    const language = token.slice(0, 2);
    const anchor = token.replace(/^(ru|en)-/, "");
    backLinkRef.current?.setAttribute("href", `${window.location.origin}${language === "en" ? "/en" : "/"}?fromCase=${encodeURIComponent(token)}#${anchor}`);
  }, []);

  useEffect(() => {
    let frame = 0;
    const setConsole = (value: boolean) => {
      desiredOpenRef.current = value;
      setOpen(value);
    };
    const completionLifecycle = createCaseCompletionLifecycle({
      isOpen: () => desiredOpenRef.current,
      isBlocked: () => Boolean(document.querySelector(".v2-brief.is-open")),
      open: () => setConsole(true),
      close: () => setConsole(false),
    });
    completionLifecycleRef.current = completionLifecycle;
    const updateProgress = () => {
      frame = 0;
      if (document.querySelector(".v2-brief.is-open")) return;
      const scrollingElement = document.scrollingElement || document.documentElement;
      const viewportHeight = scrollingElement.clientHeight || window.innerHeight;
      const available = Math.max(scrollingElement.scrollHeight - viewportHeight, 1);
      const scrollTop = Math.max(window.scrollY, scrollingElement.scrollTop);
      const progress = Math.max(0, Math.min(1, scrollTop / available));
      if (outlineProgressRef.current) {
        outlineProgressRef.current.style.strokeDashoffset = "0";
        outlineProgressRef.current.style.opacity = progress >= puzzleCompletionProgress ? "1" : "0";
      }
      if (outlineRunnerRef.current) outlineRunnerRef.current.style.opacity = "0";
      rootRef.current?.querySelectorAll<SVGGraphicsElement>("[data-puzzle-piece]").forEach((piece) => {
        const start = Number(piece.dataset.start || 0);
        const end = Number(piece.dataset.end || 1);
        const offsetX = Number(piece.dataset.x || 0);
        const offsetY = Number(piece.dataset.y || 0);
        const rotation = Number(piece.dataset.rotate || 0);
        const segmentProgress = Math.max(0, Math.min(1, (progress - start) / Math.max(end - start, 0.01)));
        const easedProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress);
        const remainingMotion = 1 - easedProgress;
        piece.style.opacity = easedProgress.toFixed(3);
        piece.style.transform = `translate(${(offsetX * remainingMotion).toFixed(2)}px, ${(offsetY * remainingMotion).toFixed(2)}px) rotate(${(rotation * remainingMotion).toFixed(2)}deg) scale(${(0.62 + easedProgress * 0.38).toFixed(3)})`;
      });
      completionLifecycle.check();
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
      completionLifecycle.destroy();
      if (completionLifecycleRef.current === completionLifecycle) completionLifecycleRef.current = null;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      window.removeEventListener("scrollend", scheduleProgress);
      window.removeEventListener("touchend", scheduleProgress);
      window.visualViewport?.removeEventListener("resize", scheduleProgress);
    };
  }, []);

  return (
    <aside
      ref={rootRef}
      className={`v2-console v2-console--nightshift${open ? " is-open" : ""}`}
      aria-label="Навигация VAZURI"
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
          <button className="v2-console__action" type="button" onClick={() => { completionLifecycleRef.current?.dismiss(); onBrief(); }}>
            <span>Обсудить проект</span><span aria-hidden="true">↗</span>
          </button>
        </nav>
      </div>
      <button
        className="v2-console__toggle"
        type="button"
        aria-expanded={open}
        aria-label={open ? "Закрыть навигацию VAZURI" : "Открыть навигацию VAZURI"}
        onClick={() => completionLifecycleRef.current?.toggle()}
      >
        <span className="v2-console__beacon" aria-hidden="true">
          <svg className="v2-puzzle" viewBox="0 0 56 56" focusable="false">
            <g className="v2-puzzle__field">
              {puzzleCells.map((piece) => (
                <rect
                  key={piece.index}
                  className={`v2-puzzle__piece${arrowCellIndexes.has(piece.index) ? " v2-puzzle__piece--arrow" : ""}`}
                  data-puzzle-piece
                  data-start={piece.start.toFixed(4)}
                  data-end={piece.end.toFixed(4)}
                  data-x={piece.x}
                  data-y={piece.y}
                  data-rotate={piece.rotate}
                  x={3 + piece.column * (50 / 7)}
                  y={3 + piece.row * (50 / 7)}
                  width={(50 / 7) + 0.08}
                  height={(50 / 7) + 0.08}
                />
              ))}
            </g>
          </svg>
        </span>
        <svg className="v2-console__outline" viewBox="0 0 56 56" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path ref={outlineProgressRef} className="v2-console__outline-progress" pathLength="1" d="M55.5 55.5H.5V.5H55.5V55.5" />
          <path ref={outlineRunnerRef} className="v2-console__outline-runner" pathLength="1" d="M55.5 55.5H.5V.5H55.5V55.5" />
        </svg>
      </button>
    </aside>
  );
}
