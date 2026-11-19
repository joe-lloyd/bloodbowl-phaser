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

export function pitchExitRoute(
  from: BoardPoint,
  to: BoardPoint,
  rows: number,
  project: BoardProjection
): BoardPoint[] {
  const player = worldToBoard(from, project);
  const box = worldToBoard(to, project);
  const lane = box.y < 0 ? -0.5 : rows + 0.5;
  return [from, project(player.x, lane), project(box.x, lane), to].filter(
    (point, i, points) => {
      const previous = points[i - 1];
      return (
        !previous ||
        Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01
      );
    }
  );
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
