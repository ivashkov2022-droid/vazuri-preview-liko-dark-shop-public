import type { CSSProperties } from "react";

// Use the exact same arrow in both actions; rotate the whole contour for NE.
const arrowWingCells = [3, 9, 15, 29, 37, 45];

export function PixelArrow({ direction }: { direction: "left" | "up-right" }) {
  return (
    <svg className="v2-console__pixel-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g transform={direction === "up-right" ? "rotate(135 11.5 11.5)" : undefined}>
        <path className="v2-console__pixel-shaft" d="M1 10H22V13H1Z" style={{ "--cube-x": "0px", "--cube-y": "7px", "--cube-rotate": "0deg", "--cube-delay": "64ms" } as CSSProperties} />
        {arrowWingCells.map((index) => {
          const x = index % 7;
          const y = Math.floor(index / 7);
          const offset = [{ x: -7, y: 0, rotate: -18 }, { x: 0, y: -7, rotate: 14 }, { x: 7, y: 0, rotate: 18 }, { x: 0, y: 7, rotate: -14 }][(x + y * 2) % 4];
          const style = {
            "--cube-x": `${offset.x}px`,
            "--cube-y": `${offset.y}px`,
            "--cube-rotate": `${offset.rotate}deg`,
            "--cube-delay": `${((index * 17) % 49) * 4}ms`,
          } as CSSProperties;
          return <rect key={index} x={1 + x * 3} y={1 + y * 3} width="3" height="3" style={style} />;
        })}
      </g>
    </svg>
  );
}
