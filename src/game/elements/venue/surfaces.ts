import type { PitchLayout, Surface } from "../../variants/pitchLayouts";
import {
  fillRect,
  type GroundRect,
  type IsoCanvas,
  onGround,
  shade,
} from "./isoCanvas";

type PavedSurface = Exclude<Surface, "grass">;

interface SurfaceStyle {
  mortar: string;
  stone: string;
  stonesPerSquare: number;
  jitter: number;
}

const SURFACES: Record<PavedSurface, SurfaceStyle> = {
  cobbles: {
    mortar: "#16130f",
    stone: "#5a5249",
    stonesPerSquare: 3,
    jitter: 0.16,
  },
  sand: {
    mortar: "#6e5a3c",
    stone: "#8a7350",
    stonesPerSquare: 1,
    jitter: 0.05,
  },
  sewer: {
    mortar: "#0f1310",
    stone: "#434a41",
    stonesPerSquare: 2,
    jitter: 0.14,
  },
};

export interface SurfaceArea {
  rect: GroundRect;
  dim: number;
}

function paintStones(
  iso: IsoCanvas,
  square: { x: number; y: number; dim: number },
  style: SurfaceStyle
): void {
  const ctx = onGround(iso);
  const n = style.stonesPerSquare;
  const cell = 1 / n;
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n);
    const offset = row % 2 && n > 1 ? cell / 2 : 0;
    const gap = n > 1 ? 0.035 + iso.random() * 0.03 : 0;
    const x = square.x + (((i % n) * cell + offset) % 1);
    const width = Math.min(cell, square.x + 1 - x);
    const tone = (iso.random() - 0.5) * 2 * style.jitter - square.dim;
    fillRect(
      ctx,
      {
        x0: x + gap,
        y0: square.y + row * cell + gap,
        x1: x + width - gap,
        y1: square.y + (row + 1) * cell - gap,
      },
      shade(style.stone, tone)
    );
  }
}

function paintSand(iso: IsoCanvas, square: { x: number; y: number }): void {
  const ctx = onGround(iso);
  ctx.strokeStyle = "rgba(40, 28, 12, 0.28)";
  ctx.lineWidth = 0.025;
  for (let ripple = 0; ripple < 3; ripple++) {
    const y = square.y + 0.2 + ripple * 0.3 + iso.random() * 0.08;
    ctx.beginPath();
    ctx.moveTo(square.x, y);
    ctx.quadraticCurveTo(
      square.x + 0.5,
      y + (iso.random() - 0.5) * 0.25,
      square.x + 1,
      y
    );
    ctx.stroke();
  }
}

function paintGrime(iso: IsoCanvas, square: { x: number; y: number }): void {
  if (iso.random() > 0.35) return;
  const ctx = onGround(iso);
  const x = square.x + 0.2 + iso.random() * 0.6;
  const y = square.y + 0.2 + iso.random() * 0.6;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 0.45);
  gradient.addColorStop(0, "rgba(38, 58, 22, 0.55)");
  gradient.addColorStop(1, "rgba(38, 58, 22, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
}

function paintSquare(
  iso: IsoCanvas,
  square: { x: number; y: number; dim: number },
  surface: PavedSurface
): void {
  const style = SURFACES[surface];
  fillRect(
    onGround(iso),
    { x0: square.x, y0: square.y, x1: square.x + 1, y1: square.y + 1 },
    shade(style.mortar, -square.dim)
  );
  paintStones(iso, square, style);
  if (surface === "sand") paintSand(iso, square);
  if (surface === "sewer") paintGrime(iso, square);
}

export function paintSurface(
  iso: IsoCanvas,
  surface: PavedSurface,
  area: SurfaceArea
): void {
  const { rect, dim } = area;
  for (let y = Math.floor(rect.y0); y < rect.y1; y++) {
    for (let x = Math.floor(rect.x0); x < rect.x1; x++) {
      paintSquare(iso, { x, y, dim }, surface);
    }
  }
}

export function paintPitchGrid(iso: IsoCanvas, layout: PitchLayout): void {
  const ctx = onGround(iso);
  for (let y = 0; y < layout.rows; y++) {
    for (let x = 0; x < layout.cols; x++) {
      if ((x + y) % 2) continue;
      fillRect(
        ctx,
        { x0: x, y0: y, x1: x + 1, y1: y + 1 },
        "rgba(255, 240, 210, 0.05)"
      );
    }
  }
  ctx.strokeStyle = "rgba(10, 8, 6, 0.55)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let x = 0; x <= layout.cols; x++) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, layout.rows);
  }
  for (let y = 0; y <= layout.rows; y++) {
    ctx.moveTo(0, y);
    ctx.lineTo(layout.cols, y);
  }
  ctx.stroke();
}

export function pavedSurface(surface: Surface): PavedSurface {
  return surface === "grass" ? "cobbles" : surface;
}
