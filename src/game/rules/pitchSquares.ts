import { activeLayout } from "../variants/activeMatch";
import {
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

export function hasObstacles(): boolean {
  return activeLayout().obstacles.length > 0;
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

export type PushLanding = "pitch" | "crowd" | "wall" | "pit";

export function pushLandingAt(square: Square): PushLanding {
  if (!isOnPitch(square))
    return edgeCrossed(square) === "sideline-wall" ? "wall" : "crowd";
  const obstacle = obstacleKindAt(square);
  if (obstacle === undefined) return "pitch";
  return obstacle === "sewer-pit" ? "pit" : "wall";
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
