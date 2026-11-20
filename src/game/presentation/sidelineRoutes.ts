import { ISO } from "../elements/GridUtils";

export interface BoardPoint {
  x: number;
  y: number;
}

export type BoardProjection = (x: number, y: number) => BoardPoint;

export function carrierProjection(
  from: BoardPoint,
  to: BoardPoint
): BoardProjection {
  const direction =
    to.x < from.x || (to.x === from.x && to.y < from.y) ? -1 : 1;
  const dx = (to.x - from.x) * direction;
  const dy = (to.y - from.y) * direction;
  const squash = ISO.gx.y / ISO.gx.x;
  const length = Math.hypot(dx, dy / squash);
  return (along, across) => ({
    x: (along * dx - (across * dy) / squash) / length,
    y: (along * dy + across * dx * squash) / length,
  });
}

export function worldToBoard(
  point: BoardPoint,
  project: BoardProjection
): BoardPoint {
  const origin = project(0, 0);
  const u = (point.x - origin.x) / ISO.gx.x;
  const v = (point.y - origin.y) / ISO.gx.y;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

export interface SidelineExit {
  rows: number;
  project: BoardProjection;
  gateX?: number;
}

const WALL_SIDE_LANE = 0.2;

function exitCorners(
  player: BoardPoint,
  box: BoardPoint,
  exit: SidelineExit
): [number, number][] {
  const home = box.y < 0;
  const lane = home ? -0.5 : exit.rows + 0.5;
  const outside: [number, number][] = [[box.x, lane]];
  if (exit.gateX === undefined) return [[player.x, lane], ...outside];
  const inside = home ? WALL_SIDE_LANE : exit.rows - WALL_SIDE_LANE;
  return [
    [player.x, inside],
    [exit.gateX, inside],
    [exit.gateX, lane],
    ...outside,
  ];
}

export function pitchExitRoute(
  from: BoardPoint,
  to: BoardPoint,
  exit: SidelineExit
): BoardPoint[] {
  const player = worldToBoard(from, exit.project);
  const box = worldToBoard(to, exit.project);
  const corners = exitCorners(player, box, exit).map(([x, y]) =>
    exit.project(x, y)
  );
  return [from, ...corners, to].filter((point, i, points) => {
    const previous = points[i - 1];
    return (
      !previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01
    );
  });
}

export function walkingSteps(route: readonly BoardPoint[]): BoardPoint[] {
  return route.slice(1).flatMap((to, i) => {
    const from = route[i];
    if (!from) return [];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 55)
    );
    return Array.from({ length: steps }, (_, step) => ({
      x: from.x + ((to.x - from.x) * (step + 1)) / steps,
      y: from.y + ((to.y - from.y) * (step + 1)) / steps,
    }));
  });
}
