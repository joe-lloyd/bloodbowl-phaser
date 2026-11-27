import type { DugoutBox, DugoutSquares } from "../../boundary/stadium";
import type { PitchLayout } from "../variants/pitchLayouts";

export interface PitchSize {
  cols: number;
  rows: number;
}

export interface VenueDugouts {
  home: DugoutSquares;
  away: DugoutSquares;
}

const STADIUM_COLS = 20;

const HOME_COLUMNS: Record<DugoutBox, readonly number[]> = {
  "sent off": [-0.5],
  injured: [0.5, 1.5, 2.5],
  ko: [3.5, 4.5, 5.5],
  reserves: [6.5, 7.5, 8.5, 9.5],
};

const BENCH_DEPTHS = [1.5, 2.5, 3.5] as const;

function benchSquares(
  columns: readonly number[],
  rows: readonly number[]
): [number, number][] {
  return rows.flatMap((y) => columns.map((x): [number, number] => [x, y]));
}

function side(
  place: (x: number) => number,
  rows: readonly number[]
): DugoutSquares {
  const box = (name: DugoutBox) =>
    benchSquares(
      HOME_COLUMNS[name].map((element) => place(element)).sort((a, b) => a - b),
      rows
    );
  return {
    reserves: box("reserves"),
    ko: box("ko"),
    injured: box("injured"),
    "sent off": box("sent off"),
  };
}

export function venueDugouts(size: PitchSize): VenueDugouts {
  const shift = (size.cols - STADIUM_COLS) / 2;
  return {
    home: side(
      (x) => x + shift,
      BENCH_DEPTHS.map((depth) => -depth)
    ),
    away: side(
      (x) => size.cols - (x + shift),
      BENCH_DEPTHS.map((depth) => size.rows + depth)
    ),
  };
}

export function dugoutGateX(squares: DugoutSquares): number {
  const columns = squares.reserves.map(([x]) => x);
  return (Math.min(...columns) + Math.max(...columns)) / 2;
}

type Step = readonly [number, number];

interface DugoutStrip {
  readonly start: Step;
  readonly along: Step;
  readonly depth: Step;
}

export const ARENA_SEATS = ["north", "east", "south", "west"] as const;

type ArenaSeat = (typeof ARENA_SEATS)[number];

export type ArenaStrips = Readonly<Record<ArenaSeat, DugoutStrip>>;

const STRIP_ORDER = [
  "reserves",
  "ko",
  "injured",
  "sent off",
] as const satisfies readonly DugoutBox[];

function boxStart(name: DugoutBox): number {
  return STRIP_ORDER.slice(0, STRIP_ORDER.indexOf(name)).reduce(
    (sum, box) => sum + HOME_COLUMNS[box].length,
    0
  );
}

function stripPoint(
  strip: DugoutStrip,
  i: number,
  j: number
): [number, number] {
  const { start, along, depth } = strip;
  return [
    start[0] + along[0] * i + depth[0] * j,
    start[1] + along[1] * i + depth[1] * j,
  ];
}

function stripBox(strip: DugoutStrip, name: DugoutBox): [number, number][] {
  const first = boxStart(name);
  return BENCH_DEPTHS.flatMap((_, j) =>
    HOME_COLUMNS[name].map((_column, k) =>
      stripPoint(strip, first + k + 0.5, j + 0.5)
    )
  );
}

function stripSquares(strip: DugoutStrip): DugoutSquares {
  return {
    reserves: stripBox(strip, "reserves"),
    ko: stripBox(strip, "ko"),
    injured: stripBox(strip, "injured"),
    "sent off": stripBox(strip, "sent off"),
  };
}

const turnStep = ([x, y]: Step): Step => [-y, x];

function quarterTurn(size: number, strip: DugoutStrip): DugoutStrip {
  const [x, y] = strip.start;
  return {
    start: [size - y, x],
    along: turnStep(strip.along),
    depth: turnStep(strip.depth),
  };
}

export function arenaDugoutStrips(layout: PitchLayout): ArenaStrips {
  const { arm } = layout.frames[0];
  const north: DugoutStrip = {
    start: [arm.offset + arm.width + 1, arm.offset - 1],
    along: [0, -1],
    depth: [1, 0],
  };
  const east = quarterTurn(layout.cols, north);
  const south = quarterTurn(layout.cols, east);
  return { north, east, south, west: quarterTurn(layout.cols, south) };
}

export function arenaDugouts(
  layout: PitchLayout
): Readonly<Record<ArenaSeat, DugoutSquares>> {
  const strips = arenaDugoutStrips(layout);
  return {
    north: stripSquares(strips.north),
    east: stripSquares(strips.east),
    south: stripSquares(strips.south),
    west: stripSquares(strips.west),
  };
}
