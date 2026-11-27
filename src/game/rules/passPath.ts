import type { Span } from "./frames";
import type { PitchLayout, Square } from "../variants/pitchLayouts";

type Window = readonly [number, number];

const EVERYWHERE: Window = [-Infinity, Infinity];

function axisWindow(start: number, delta: number, centre: number): Window | null {
  const low = centre - 0.5 - start;
  const high = centre + 0.5 - start;
  if (delta === 0) return low < 0 && high > 0 ? EVERYWHERE : null;
  const enter = low / delta;
  const leave = high / delta;
  return [Math.min(enter, leave), Math.max(enter, leave)];
}

function pathEnters(from: Square, to: Square, square: Square): boolean {
  const across = axisWindow(from.x, to.x - from.x, square.x);
  const along = axisWindow(from.y, to.y - from.y, square.y);
  if (!across || !along) return false;
  return Math.max(0, across[0], along[0]) < Math.min(1, across[1], along[1]);
}

const spanValues = ({ min, max }: Span) =>
  Array.from({ length: max - min + 1 }, (_, offset) => min + offset);

export function pathCrossesOffPitch(
  layout: PitchLayout,
  from: Square,
  to: Square
): boolean {
  return layout.offPitch.some(({ columns, rows }) =>
    spanValues(columns).some((x) =>
      spanValues(rows).some((y) => pathEnters(from, to, { x, y }))
    )
  );
}
