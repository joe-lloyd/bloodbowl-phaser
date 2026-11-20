import { ISO } from "../GridUtils";

export const UP_PX = -ISO.upPerMetre;

const HALF_W = ISO.gx.x;
const HALF_H = ISO.gx.y;

export interface IsoCanvas {
  ctx: CanvasRenderingContext2D;
  origin: { x: number; y: number };
  random: () => number;
}

export interface GroundRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface IsoBlock extends GroundRect {
  height: number;
  base?: number;
}

export interface BlockColours {
  top: string;
  front: string;
  side: string;
}

export function onGround(iso: IsoCanvas, lift = 0): CanvasRenderingContext2D {
  const { ctx, origin } = iso;
  ctx.setTransform(
    HALF_W,
    HALF_H,
    -HALF_W,
    HALF_H,
    origin.x,
    origin.y - lift * UP_PX
  );
  return ctx;
}

export function onFrontFace(
  iso: IsoCanvas,
  y: number
): CanvasRenderingContext2D {
  const { ctx, origin } = iso;
  ctx.setTransform(
    HALF_W,
    HALF_H,
    0,
    -UP_PX,
    origin.x - y * HALF_W,
    origin.y + y * HALF_H
  );
  return ctx;
}

export function onSideFace(
  iso: IsoCanvas,
  x: number
): CanvasRenderingContext2D {
  const { ctx, origin } = iso;
  ctx.setTransform(
    -HALF_W,
    HALF_H,
    0,
    -UP_PX,
    origin.x + x * HALF_W,
    origin.y + x * HALF_H
  );
  return ctx;
}

export function onScreen(iso: IsoCanvas): CanvasRenderingContext2D {
  iso.ctx.setTransform(1, 0, 0, 1, 0, 0);
  return iso.ctx;
}

export function screenPoint(
  iso: IsoCanvas,
  at: { x: number; y: number; lift?: number }
): { x: number; y: number } {
  return {
    x: iso.origin.x + (at.x - at.y) * HALF_W,
    y: iso.origin.y + (at.x + at.y) * HALF_H - (at.lift ?? 0) * UP_PX,
  };
}

export function fillRect(
  ctx: CanvasRenderingContext2D,
  rect: GroundRect,
  colour: string
): void {
  ctx.fillStyle = colour;
  ctx.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
}

export function isoBlock(
  iso: IsoCanvas,
  block: IsoBlock,
  colours: BlockColours
): void {
  const base = block.base ?? 0;
  const top = base + block.height;
  const front = onFrontFace(iso, block.y1);
  fillRect(
    front,
    { x0: block.x0, y0: base, x1: block.x1, y1: top },
    colours.front
  );
  const side = onSideFace(iso, block.x1);
  fillRect(
    side,
    { x0: block.y0, y0: base, x1: block.y1, y1: top },
    colours.side
  );
  fillRect(onGround(iso, top), block, colours.top);
}

export function groundText(
  iso: IsoCanvas,
  label: { text: string; x: number; y: number; colour: string },
  size = 0.42
): void {
  const ctx = onGround(iso);
  const scale = 40;
  ctx.translate(label.x, label.y);
  ctx.scale(size / scale, size / scale);
  ctx.font = `bold ${String(scale)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = label.colour;
  ctx.fillText(label.text, 0, 0);
}

export function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    const next = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
    return Math.round(Math.min(255, Math.max(0, next)));
  };
  return `rgb(${String(channel(16))}, ${String(channel(8))}, ${String(channel(0))})`;
}

export function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
