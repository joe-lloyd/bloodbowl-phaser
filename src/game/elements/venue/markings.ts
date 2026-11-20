import type { DugoutBox, DugoutSquares } from "../../../boundary/stadium";
import type { PitchLayout } from "../../variants/pitchLayouts";
import {
  cssColour,
  fillRect,
  type GroundRect,
  groundText,
  type IsoCanvas,
  onGround,
} from "./isoCanvas";

export interface TeamColours {
  home: number;
  away: number;
}

const LINE = "rgba(236, 226, 200, 0.82)";
const LINE_WIDTH = 0.055;

function line(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number]
): void {
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.stroke();
}

function tint(colour: number, alpha: number): string {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

function scrimmageLines(layout: PitchLayout): number[] {
  const { noMansLand, lineOfScrimmage } = layout;
  return noMansLand
    ? [noMansLand.min, noMansLand.max + 1]
    : [lineOfScrimmage.team2];
}

export function paintMarkings(
  iso: IsoCanvas,
  layout: PitchLayout,
  colours: TeamColours
): void {
  const { cols, rows, wideZoneRows } = layout;
  const ctx = onGround(iso);
  fillRect(ctx, { x0: 0, y0: 0, x1: 1, y1: rows }, tint(colours.home, 0.32));
  fillRect(
    ctx,
    { x0: cols - 1, y0: 0, x1: cols, y1: rows },
    tint(colours.away, 0.32)
  );
  if (layout.noMansLand) {
    const { min, max } = layout.noMansLand;
    fillRect(
      ctx,
      { x0: min, y0: 0, x1: max + 1, y1: rows },
      "rgba(160, 60, 50, 0.07)"
    );
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeRect(0, 0, cols, rows);
  for (const x of [1, cols - 1, ...scrimmageLines(layout)])
    line(ctx, [x, 0], [x, rows]);
  for (const y of [wideZoneRows.top.max + 1, wideZoneRows.bottom.min]) {
    ctx.setLineDash([0.3, 0.2]);
    line(ctx, [1, y], [cols - 1, y]);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = LINE;
  ctx.beginPath();
  ctx.ellipse(cols / 2, rows / 2, 0.12, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

const BOX_STYLE: Record<DugoutBox, { colour: string | null; label: string }> = {
  reserves: { colour: null, label: "RESERVES" },
  ko: { colour: "#e0a030", label: "KO'D" },
  injured: { colour: "#c0392b", label: "CASUALTIES" },
  "sent off": { colour: "#c050a0", label: "OFF" },
};

export interface DugoutFloor {
  base: string;
  stripe: string | null;
}

function boxRect(squares: [number, number][]): GroundRect {
  const xs = squares.map(([x]) => x);
  const ys = squares.map(([, y]) => y);
  return {
    x0: Math.min(...xs) - 0.5,
    y0: Math.min(...ys) - 0.5,
    x1: Math.max(...xs) + 0.5,
    y1: Math.max(...ys) + 0.5,
  };
}

function floorFill(iso: IsoCanvas, rect: GroundRect, floor: DugoutFloor): void {
  const ctx = onGround(iso);
  fillRect(ctx, rect, floor.base);
  for (let x = rect.x0; x < rect.x1; x += 0.5) {
    const stripe = floor.stripe ?? "rgba(0, 0, 0, 0.18)";
    fillRect(
      ctx,
      { ...rect, x0: x, x1: x + (floor.stripe ? 0.25 : 0.03) },
      stripe
    );
  }
}

export function paintDugout(
  iso: IsoCanvas,
  dugout: { squares: DugoutSquares; kit: number },
  floor: DugoutFloor
): void {
  for (const box of ["reserves", "ko", "injured", "sent off"] as const) {
    const rect = boxRect(dugout.squares[box]);
    floorFill(iso, rect, floor);
    const ctx = onGround(iso);
    ctx.strokeStyle = BOX_STYLE[box].colour ?? cssColour(dugout.kit);
    ctx.lineWidth = 0.07;
    ctx.strokeRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
    groundText(
      iso,
      {
        text: BOX_STYLE[box].label,
        x: (rect.x0 + rect.x1) / 2,
        y: rect.y0 - 0.3,
        colour: "#e6d6b2",
      },
      box === "sent off" ? 0.3 : 0.42
    );
  }
}
