import { activeLayout } from "../variants/activeMatch";
import {
  type Barricade,
  isInsideLayout,
  type ObstacleKind,
  type PitchLayout,
  type Square,
} from "../variants/pitchLayouts";

const obstacleGrids = new WeakMap<PitchLayout, (ObstacleKind | undefined)[]>();

function obstacleGrid(layout: PitchLayout): (ObstacleKind | undefined)[] {
  const cached = obstacleGrids.get(layout);
  if (cached) return cached;
  const grid: (ObstacleKind | undefined)[] = new Array<
    ObstacleKind | undefined
  >(layout.cols * layout.rows);
  for (const obstacle of layout.obstacles)
    grid[obstacle.y * layout.cols + obstacle.x] = obstacle.kind;
  obstacleGrids.set(layout, grid);
  return grid;
}

export function isOnPitch(square: Square): boolean {
  return isInsideLayout(activeLayout(), square);
}

export function obstacleKindAt(square: Square): ObstacleKind | undefined {
  const layout = activeLayout();
  if (!isInsideLayout(layout, square)) return undefined;
  return obstacleGrid(layout)[square.y * layout.cols + square.x];
}

export function isStandableSquare(square: Square): boolean {
  return isOnPitch(square) && obstacleKindAt(square) === undefined;
}

function crosses(barricade: Barricade, from: Square, to: Square): boolean {
  const west = Math.min(from.x, to.x);
  if (west !== barricade.afterColumn || Math.max(from.x, to.x) !== west + 1)
    return false;
  const { min, max } = barricade.rows;
  return Math.min(from.y, to.y) >= min && Math.max(from.y, to.y) <= max;
}

export function barricadeBetween(from: Square, to: Square): boolean {
  return activeLayout().barricades.some((barricade) =>
    crosses(barricade, from, to)
  );
}

export type PitchEdge = "sideline-wall" | "crowd";

export function edgeCrossed(to: Square): PitchEdge {
  const layout = activeLayout();
  const overEndLine = to.x < 0 || to.x >= layout.cols;
  return layout.walledSidelines && !overEndLine ? "sideline-wall" : "crowd";
}

export function isWallSquare(square: Square): boolean {
  const layout = activeLayout();
  if (!layout.walledSidelines) return false;
  if (square.x < 0 || square.x >= layout.cols) return false;
  return square.y === -1 || square.y === layout.rows;
}

export function rulerCrossesStall(from: Square, to: Square): boolean {
  const steps =
    Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 8;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const square = {
      x: Math.round(from.x + (to.x - from.x) * t),
      y: Math.round(from.y + (to.y - from.y) * t),
    };
    if (obstacleKindAt(square) === "market-stall") return true;
  }
  return false;
}

export type PushLanding = "pitch" | "crowd" | "wall" | "pit";

export function pushLandingAt(from: Square, square: Square): PushLanding {
  if (barricadeBetween(from, square)) return "wall";
  if (!isOnPitch(square))
    return edgeCrossed(square) === "sideline-wall" ? "wall" : "crowd";
  const obstacle = obstacleKindAt(square);
  if (obstacle === undefined) return "pitch";
  return obstacle === "sewer-pit" ? "pit" : "wall";
}

export function isOpenPushSquare(from: Square, to: Square): boolean {
  return isStandableSquare(to) && !barricadeBetween(from, to);
}

function ringAround(from: Square, distance: number): Square[] {
  const ring: Square[] = [];
  for (let y = from.y - distance; y <= from.y + distance; y++) {
    for (let x = from.x - distance; x <= from.x + distance; x++) {
      if (Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) === distance)
        ring.push({ x, y });
    }
  }
  return ring;
}

export function nearestFreeSquare(
  from: Square,
  occupied: (square: Square) => boolean
): Square | undefined {
  const layout = activeLayout();
  const reach = Math.max(layout.cols, layout.rows);
  for (let distance = 1; distance <= reach; distance++) {
    const free = ringAround(from, distance).find(
      (square) => isStandableSquare(square) && !occupied(square)
    );
    if (free) return free;
  }
  return undefined;
}
