import {
  type BlockColours,
  fillRect,
  type IsoBlock,
  type IsoCanvas,
  isoBlock,
  onFrontFace,
  shade,
} from "./isoCanvas";

export interface WallStyle {
  colours: BlockColours;
  course: number;
  block: number;
}

export const BRICK_WALL: WallStyle = {
  colours: { top: "#7a6a58", front: "#5a3326", side: "#43251b" },
  course: 0.28,
  block: 0.45,
};

export const STONE_WALL: WallStyle = {
  colours: { top: "#5d665a", front: "#3c443b", side: "#2c332c" },
  course: 0.5,
  block: 0.8,
};

const THICKNESS = 0.3;
const GATE_WIDTH = 1;
const PILLAR = 0.36;

export interface WallRun {
  y: number;
  from: number;
  to: number;
  height: number;
  gateX?: number;
}

function courses(iso: IsoCanvas, block: IsoBlock, style: WallStyle): void {
  const ctx = onFrontFace(iso, block.y1);
  const mortar = shade(style.colours.front, -0.35);
  for (
    let h = style.course, row = 0;
    h < block.height;
    h += style.course, row++
  ) {
    fillRect(ctx, { x0: block.x0, y0: h - 0.03, x1: block.x1, y1: h }, mortar);
    const offset = row % 2 ? style.block / 2 : 0;
    for (let x = block.x0 + offset; x < block.x1; x += style.block) {
      fillRect(
        ctx,
        {
          x0: x,
          y0: h,
          x1: x + 0.025,
          y1: Math.min(block.height, h + style.course),
        },
        mortar
      );
    }
  }
}

function segment(iso: IsoCanvas, block: IsoBlock, style: WallStyle): void {
  if (block.x1 - block.x0 <= 0) return;
  isoBlock(iso, block, style.colours);
  courses(iso, block, style);
}

function pillar(
  iso: IsoCanvas,
  at: { x: number; y: number; height: number },
  style: WallStyle
): void {
  const half = PILLAR / 2;
  isoBlock(
    iso,
    {
      x0: at.x - half,
      x1: at.x + half,
      y0: at.y - half,
      y1: at.y + half,
      height: at.height + 0.35,
    },
    { ...style.colours, front: shade(style.colours.front, 0.08) }
  );
}

export function paintWall(
  iso: IsoCanvas,
  run: WallRun,
  style: WallStyle
): void {
  const y0 = run.y - THICKNESS / 2;
  const y1 = run.y + THICKNESS / 2;
  const base = { y0, y1, height: run.height };
  if (run.gateX === undefined) {
    segment(iso, { ...base, x0: run.from, x1: run.to }, style);
    return;
  }
  const left = run.gateX - GATE_WIDTH / 2;
  const right = run.gateX + GATE_WIDTH / 2;
  segment(iso, { ...base, x0: run.from, x1: left }, style);
  segment(iso, { ...base, x0: right, x1: run.to }, style);
  pillar(iso, { x: left, y: run.y, height: run.height }, style);
  pillar(iso, { x: right, y: run.y, height: run.height }, style);
}
