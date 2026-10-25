import type { CSSProperties } from "react";

const arrowRows = {
  left: ["...#...", "..#....", ".#.....", ".......", ".#.....", "..#....", "...#..."],
  "up-right": ["...####", "......#", "......#", "......#", ".......", ".......", "......."],
} as const;

const arrowShafts = {
  left: "M1 10H22V13H1Z",
  "up-right": "M1 19.9 19.9 1 22 3.1 3.1 22Z",
} as const;

export function PixelArrow({ direction }: { direction: keyof typeof arrowRows }) {
  return (
    <svg className="v2-console__pixel-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="v2-console__pixel-shaft" d={arrowShafts[direction]} style={{ "--cube-x": "0px", "--cube-y": "7px", "--cube-rotate": "0deg", "--cube-delay": "64ms" } as CSSProperties} />
      {arrowRows[direction].flatMap((row, y) => [...row].map((cell, x) => {
        if (cell !== "#") return null;
        const index = y * 7 + x;
        const offset = [{ x: -7, y: 0, rotate: -18 }, { x: 0, y: -7, rotate: 14 }, { x: 7, y: 0, rotate: 18 }, { x: 0, y: 7, rotate: -14 }][(x + y * 2) % 4];
        const style = {
          "--cube-x": `${offset.x}px`,
          "--cube-y": `${offset.y}px`,
          "--cube-rotate": `${offset.rotate}deg`,
          "--cube-delay": `${((index * 17) % 49) * 4}ms`,
        } as CSSProperties;
        return <rect key={`${x}-${y}`} x={1 + x * 3} y={1 + y * 3} width="3" height="3" style={style} />;
      }))}
    </svg>
  );
}
