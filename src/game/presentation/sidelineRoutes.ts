import { ISO } from "../elements/GridUtils";

export interface BoardPoint {
  x: number;
  y: number;
}

/** The projection accepts continuous grid coordinates, including off-pitch points. */
export type BoardProjection = (x: number, y: number) => BoardPoint;

/** Invert the board projection without rounding away a player's row. */
export function worldToBoard(
  point: BoardPoint,
  project: BoardProjection
): BoardPoint {
  const origin = project(0, 0);
  const u = (point.x - origin.x) / ISO.gx.x;
  const v = (point.y - origin.y) / ISO.gx.y;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

/**
 * Leave by the team's touchline, follow the clear lane outside the pitch,
 * then enter the destination box. Reversing this route brings a medical
 * crew to the patient without crossing the pitch diagonally.
 */
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
    (point, i, points) =>
      i === 0 ||
      Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y) > 0.01
  );
}

/** Subdivide each leg independently, preserving every corner of the route. */
export function walkingSteps(route: readonly BoardPoint[]): BoardPoint[] {
  return route.slice(1).flatMap((to, i) => {
    const from = route[i];
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
