import type { Obstacle, ObstacleKind } from "../../variants/pitchLayouts";
import {
  fillRect,
  type GroundRect,
  type IsoCanvas,
  isoBlock,
  onFrontFace,
  onGround,
  onSideFace,
  shade,
} from "./isoCanvas";

export interface ObstacleBlock {
  kind: ObstacleKind;
  rect: GroundRect;
}

const key = (x: number, y: number) => `${String(x)},${String(y)}`;

function grow(seed: Obstacle, open: Map<string, Obstacle>): GroundRect {
  const rect = { x0: seed.x, y0: seed.y, x1: seed.x + 1, y1: seed.y + 1 };
  const queue = [seed];
  open.delete(key(seed.x, seed.y));
  for (let square = queue.pop(); square; square = queue.pop()) {
    rect.x0 = Math.min(rect.x0, square.x);
    rect.y0 = Math.min(rect.y0, square.y);
    rect.x1 = Math.max(rect.x1, square.x + 1);
    rect.y1 = Math.max(rect.y1, square.y + 1);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = open.get(key(square.x + dx, square.y + dy));
      if (next?.kind !== seed.kind) continue;
      open.delete(key(next.x, next.y));
      queue.push(next);
    }
  }
  return rect;
}

export function obstacleBlocks(
  obstacles: readonly Obstacle[]
): ObstacleBlock[] {
  const open = new Map(obstacles.map((o) => [key(o.x, o.y), o]));
  return obstacles.flatMap((seed) =>
    open.has(key(seed.x, seed.y))
      ? [{ kind: seed.kind, rect: grow(seed, open) }]
      : []
  );
}

const PIT_DEPTH = 2.2;

function clipTo(ctx: CanvasRenderingContext2D, rect: GroundRect): void {
  ctx.beginPath();
  ctx.rect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
  ctx.clip();
}

function pitInside(iso: IsoCanvas, rim: GroundRect): void {
  const back = onFrontFace(iso, rim.y0);
  const wall = back.createLinearGradient(0, 0, 0, -PIT_DEPTH);
  wall.addColorStop(0, "#2c322b");
  wall.addColorStop(1, "#070807");
  back.fillStyle = wall;
  back.fillRect(rim.x0, -PIT_DEPTH, rim.x1 - rim.x0, PIT_DEPTH);
  fillRect(
    onSideFace(iso, rim.x0),
    { x0: rim.y0, y0: -PIT_DEPTH, x1: rim.y1, y1: 0 },
    "rgba(10, 12, 10, 0.75)"
  );
  const sludge = onGround(iso, -PIT_DEPTH);
  fillRect(sludge, rim, "rgba(34, 50, 18, 0.45)");
  sludge.fillStyle = "rgba(120, 150, 60, 0.22)";
  for (let i = 0; i < 9; i++) {
    sludge.beginPath();
    sludge.ellipse(
      rim.x0 + iso.random() * (rim.x1 - rim.x0),
      rim.y0 + iso.random() * (rim.y1 - rim.y0),
      0.12,
      0.06,
      0,
      0,
      Math.PI * 2
    );
    sludge.fill();
  }
}

function hazardEdge(iso: IsoCanvas, rect: GroundRect): void {
  const edge = onGround(iso);
  edge.strokeStyle = "#d9b44a";
  edge.lineWidth = 0.06;
  edge.setLineDash([0.25, 0.18]);
  edge.strokeRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
  edge.setLineDash([]);
}

export function paintPit(iso: IsoCanvas, rect: GroundRect): void {
  const rim = {
    x0: rect.x0 + 0.06,
    y0: rect.y0 + 0.06,
    x1: rect.x1 - 0.06,
    y1: rect.y1 - 0.06,
  };
  fillRect(onGround(iso), rect, "#5b6157");
  iso.ctx.save();
  clipTo(onGround(iso), rim);
  fillRect(onGround(iso), rim, "#050605");
  pitInside(iso, rim);
  iso.ctx.restore();
  hazardEdge(iso, rim);
}

const AWNINGS = [
  ["#7d2620", "#c9b48a"],
  ["#2f5a3a", "#c9b48a"],
  ["#2d3f6b", "#c2a35f"],
] as const;

const PRODUCE = [
  "#6f8f3a",
  "#a33a2a",
  "#c08a2c",
  "#8c8f93",
  "#6b3f6e",
] as const;

function stallFootprint(iso: IsoCanvas, rect: GroundRect): void {
  const ctx = onGround(iso);
  fillRect(ctx, rect, "#2a1f16");
  ctx.save();
  clipTo(ctx, rect);
  ctx.strokeStyle = "rgba(201, 160, 80, 0.22)";
  ctx.lineWidth = 0.05;
  for (let d = -10; d < 10; d += 0.4) {
    ctx.beginPath();
    ctx.moveTo(rect.x0 + d, rect.y0);
    ctx.lineTo(rect.x0 + d + (rect.y1 - rect.y0), rect.y1);
    ctx.stroke();
  }
  ctx.restore();
  hazardEdge(iso, {
    x0: rect.x0 + 0.04,
    y0: rect.y0 + 0.04,
    x1: rect.x1 - 0.04,
    y1: rect.y1 - 0.04,
  });
}

function produce(iso: IsoCanvas, counter: GroundRect): void {
  for (let x = counter.x0 + 0.1; x < counter.x1 - 0.4; x += 0.55) {
    const colour =
      PRODUCE[Math.floor(iso.random() * PRODUCE.length)] ?? "#6f8f3a";
    isoBlock(
      iso,
      {
        x0: x,
        x1: x + 0.45,
        y0: counter.y0 + 0.15,
        y1: counter.y1 - 0.15,
        height: 0.25,
        base: 1,
      },
      { top: colour, front: shade(colour, -0.35), side: shade(colour, -0.5) }
    );
  }
}

function awning(
  iso: IsoCanvas,
  stall: GroundRect,
  stripes: readonly [string, string]
): void {
  const post = { top: "#4a3220", front: "#3a2718", side: "#2c1d12" };
  for (const x of [stall.x0 + 0.1, stall.x1 - 0.2]) {
    isoBlock(
      iso,
      {
        x0: x,
        x1: x + 0.1,
        y0: stall.y1 - 0.2,
        y1: stall.y1 - 0.1,
        height: 1.9,
      },
      post
    );
  }
  const canopy = onGround(iso, 1.9);
  for (let x = stall.x0, i = 0; x < stall.x1; x += 0.3, i++) {
    fillRect(
      canopy,
      {
        x0: x,
        y0: stall.y0 + 0.4,
        x1: Math.min(stall.x1, x + 0.3),
        y1: stall.y1 - 0.05,
      },
      stripes[i % 2] ?? stripes[0]
    );
  }
  const lip = onFrontFace(iso, stall.y1 - 0.05);
  for (let x = stall.x0, i = 0; x < stall.x1; x += 0.3, i++) {
    fillRect(
      lip,
      { x0: x, y0: 1.6, x1: Math.min(stall.x1, x + 0.3), y1: 1.9 },
      shade(stripes[i % 2] ?? stripes[0], -0.25)
    );
  }
}

export function paintStalls(
  iso: IsoCanvas,
  rect: GroundRect,
  index: number
): void {
  stallFootprint(iso, rect);
  const half = (rect.x0 + rect.x1) / 2;
  for (const [x0, x1] of [
    [rect.x0, half],
    [half, rect.x1],
  ] as const) {
    const counter = {
      x0: x0 + 0.3,
      x1: x1 - 0.3,
      y0: rect.y0 + 0.8,
      y1: rect.y1 - 0.8,
    };
    isoBlock(
      iso,
      { ...counter, height: 1 },
      { top: "#6a4a2c", front: "#4d3420", side: "#3a2717" }
    );
    produce(iso, counter);
    awning(
      iso,
      counter,
      AWNINGS[(index + Math.round(x0)) % AWNINGS.length] ?? AWNINGS[0]
    );
  }
}
