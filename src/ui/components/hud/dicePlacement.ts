import type { ScreenRect } from "../../../game/controllers/CameraController";

const STEP_PX = 8;
const PROMPT_WEIGHT = 20;
const ACTION_WEIGHT = 8;

export interface DiceSpot {
  left: number;
  top: number;
}

interface Placement {
  box: { width: number; height: number };
  bounds: ScreenRect;
  prompts: readonly ScreenRect[];
  action: readonly ScreenRect[];
  current: DiceSpot | null;
}

function rectAt({ left, top }: DiceSpot, box: Placement["box"]): ScreenRect {
  return { left, top, right: left + box.width, bottom: top + box.height };
}

function overlap(a: ScreenRect, b: ScreenRect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return Math.max(0, width) * Math.max(0, height);
}

function covered(rect: ScreenRect, others: readonly ScreenRect[]): number {
  return others.reduce((sum, other) => sum + overlap(rect, other), 0);
}

function steps(from: number, to: number): number[] {
  const count = Math.max(0, Math.floor((to - from) / STEP_PX));
  return Array.from({ length: count + 1 }, (_, index) => from + index * STEP_PX);
}

function focus(action: readonly ScreenRect[], bounds: ScreenRect) {
  const of = action.length > 0 ? action : [bounds];
  return {
    x: of.reduce((sum, r) => sum + (r.left + r.right) / 2, 0) / of.length,
    y: of.reduce((sum, r) => sum + (r.top + r.bottom) / 2, 0) / of.length,
  };
}

export function placeDice(input: Placement): DiceSpot {
  const { box, bounds, prompts, action, current } = input;
  const at = focus(action, bounds);
  const cover = (spot: DiceSpot) => {
    const rect = rectAt(spot, box);
    return (
      covered(rect, prompts) * PROMPT_WEIGHT +
      covered(rect, action) * ACTION_WEIGHT
    );
  };
  if (current && cover(current) === 0 && inside(rectAt(current, box), bounds))
    return current;
  const distance = ({ left, top }: DiceSpot) =>
    Math.hypot(left + box.width / 2 - at.x, top + box.height / 2 - at.y);
  const spots = steps(bounds.left, bounds.right - box.width).flatMap((left) =>
    steps(bounds.top, bounds.bottom - box.height).map((top) => ({ left, top }))
  );
  return spots.reduce<{ spot: DiceSpot; cost: number }>(
    (best, spot) => {
      const cost = cover(spot) + distance(spot);
      return cost < best.cost ? { spot, cost } : best;
    },
    { spot: { left: bounds.left, top: bounds.top }, cost: Infinity }
  ).spot;
}

function inside(rect: ScreenRect, bounds: ScreenRect): boolean {
  return (
    rect.left >= bounds.left &&
    rect.right <= bounds.right &&
    rect.top >= bounds.top &&
    rect.bottom <= bounds.bottom
  );
}
