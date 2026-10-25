import type { CSSProperties } from "react";

// Each shaft is solid; the six wing cells stay square in either direction.
const arrowWingCells = [3, 9, 15, 29, 37, 45];
const diagonalWingPositions = [[16, 16], [16, 12], [16, 8], [12, 4], [8, 4], [4, 4]] as const;
const arrowShafts = {
  left: "M1 10H22V13H1Z",
  "up-right": "M3.015 17.864L17.864 3.015L19.985 5.136L5.136 19.985Z",
} as const;

export function PixelArrow({ direction }: { direction: "left" | "up-right" }) {
  return (
    <svg className="v2-console__pixel-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g>
        <path className="v2-console__pixel-shaft" d={arrowShafts[direction]} style={{ "--cube-x": "0px", "--cube-y": "7px", "--cube-rotate": "0deg", "--cube-delay": "64ms" } as CSSProperties} />
        {arrowWingCells.map((index, wingIndex) => {
          const x = index % 7;
          const y = Math.floor(index / 7);
          const offset = [{ x: -7, y: 0, rotate: -18 }, { x: 0, y: -7, rotate: 14 }, { x: 7, y: 0, rotate: 18 }, { x: 0, y: 7, rotate: -14 }][(x + y * 2) % 4];
          const style = {
            "--cube-x": `${offset.x}px`,
            "--cube-y": `${offset.y}px`,
            "--cube-rotate": `${offset.rotate}deg`,
            "--cube-delay": `${((index * 17) % 49) * 4}ms`,
          } as CSSProperties;
          const [cellX, cellY] = direction === "up-right" ? diagonalWingPositions[wingIndex] : [1 + x * 3, 1 + y * 3];
          return <rect key={index} x={cellX} y={cellY} width="3" height="3" style={style} />;
        })}
      </g>
    </svg>
  );
}
