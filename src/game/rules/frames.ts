import type { Square } from "../variants/pitchLayouts";

export type Heading = "+x" | "-x";

export interface Span {
  readonly min: number;
  readonly max: number;
}

export interface Arm {
  readonly length: number;
  readonly width: number;
  readonly offset: number;
  readonly scrimmage: number;
  readonly setupAcross: Span;
  readonly centre: Span;
  readonly wide: readonly [Span, Span];
}

export interface Frame {
  readonly heading: Heading;
  readonly arm: Arm;
}

interface Local {
  readonly along: number;
  readonly across: number;
}

export type WideZone = 0 | 1;

const within = (value: number, span: Span) =>
  value >= span.min && value <= span.max;

export function toLocal(frame: Frame, square: Square): Local {
  const { length, offset } = frame.arm;
  const along = frame.heading === "+x" ? square.x : length - 1 - square.x;
  return { along, across: square.y - offset };
}

function fromLocal(frame: Frame, local: Local): Square {
  const { length, offset } = frame.arm;
  const x = frame.heading === "+x" ? local.along : length - 1 - local.along;
  return { x, y: local.across + offset };
}

function inArm(frame: Frame, local: Local): boolean {
  const { length, width } = frame.arm;
  return (
    within(local.along, { min: 0, max: length - 1 }) &&
    within(local.across, { min: 0, max: width - 1 })
  );
}

export function scoresAt(frame: Frame, square: Square): boolean {
  const local = toLocal(frame, square);
  return inArm(frame, local) && local.along === frame.arm.length - 1;
}

export function onScrimmage(frame: Frame, square: Square): boolean {
  const local = toLocal(frame, square);
  return inArm(frame, local) && local.along === frame.arm.scrimmage;
}

export function inOwnHalf(frame: Frame, square: Square): boolean {
  return toLocal(frame, square).along <= frame.arm.scrimmage;
}

export function inSetupSection(frame: Frame, square: Square): boolean {
  const local = toLocal(frame, square);
  return (
    inArm(frame, local) &&
    local.along <= frame.arm.scrimmage &&
    within(local.across, frame.arm.setupAcross)
  );
}

export function inCentreStrip(frame: Frame, square: Square): boolean {
  const local = toLocal(frame, square);
  return inArm(frame, local) && within(local.across, frame.arm.centre);
}

export function noMansLand(frame: Frame): Span | null {
  const { length, scrimmage } = frame.arm;
  const span = { min: scrimmage + 1, max: length - 2 - scrimmage };
  return span.min <= span.max ? span : null;
}

export function inNoMansLand(frame: Frame, square: Square): boolean {
  const span = noMansLand(frame);
  const local = toLocal(frame, square);
  return span !== null && inArm(frame, local) && within(local.along, span);
}

export function wideZoneOf(frame: Frame, square: Square): WideZone | null {
  const local = toLocal(frame, square);
  if (!inArm(frame, local)) return null;
  const [lower, upper] = frame.arm.wide;
  if (within(local.across, lower)) return 0;
  if (within(local.across, upper)) return 1;
  return null;
}

export function blockOf(
  frame: Frame,
  along: Span,
  across: Span
): { min: Square; max: Square } {
  const a = fromLocal(frame, { along: along.min, across: across.min });
  const b = fromLocal(frame, { along: along.max, across: across.max });
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
  };
}

export function squareAt(frame: Frame, along: number, across: number): Square {
  return fromLocal(frame, { along, across });
}

export function pairFrames(shape: {
  cols: number;
  rows: number;
  lines: readonly [number, number];
  centre: Span;
  wide: readonly [Span, Span];
}): readonly [Frame, Frame] {
  const [ahead, behind] = shape.lines;
  if (behind !== shape.cols - 1 - ahead) {
    throw new Error(
      `Lines of Scrimmage at x=${String(ahead)} and x=${String(behind)} are not mirror images on a pitch ${String(shape.cols)} long.`
    );
  }
  const arm: Arm = {
    length: shape.cols,
    width: shape.rows,
    offset: 0,
    scrimmage: ahead,
    setupAcross: { min: 0, max: shape.rows - 1 },
    centre: shape.centre,
    wide: shape.wide,
  };
  return [
    { heading: "+x", arm },
    { heading: "-x", arm },
  ];
}
