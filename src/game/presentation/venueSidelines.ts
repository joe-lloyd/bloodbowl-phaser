import type { DugoutBox, DugoutSquares } from "../../boundary/stadium";
import type { PitchLayout } from "../variants/pitchLayouts";

export interface PitchSize {
  cols: number;
  rows: number;
}

interface VenueDugouts {
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

type BoxRun = readonly [DugoutBox, number];

interface DugoutStrip {
  readonly start: Step;
  readonly along: Step;
  readonly depth: Step;
  readonly boxes: readonly BoxRun[];
}

export const ARENA_SEATS = ["north", "east", "south", "west"] as const;

export type ArenaSeat = (typeof ARENA_SEATS)[number];

export type ArenaStrips = Readonly<
  Record<ArenaSeat, readonly [DugoutStrip, DugoutStrip]>
>;

const BENCH_GAP = 1;
const BENCH_BOX = 10;

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

function runSquares(
  strip: DugoutStrip,
  first: number,
  length: number
): [number, number][] {
  return BENCH_DEPTHS.flatMap((_, j) =>
    Array.from({ length }, (_square, k) =>
      stripPoint(strip, first + k + 0.5, j + 0.5)
    )
  );
}

function stripBox(strip: DugoutStrip, name: DugoutBox): [number, number][] {
  return strip.boxes.flatMap(([box, length], index) =>
    box === name
      ? runSquares(
          strip,
          strip.boxes.slice(0, index).reduce((sum, [, n]) => sum + n, 0),
          length
        )
      : []
  );
}

function seatSquares(strips: readonly DugoutStrip[]): DugoutSquares {
  const box = (name: DugoutBox) =>
    strips.flatMap((strip) => stripBox(strip, name));
  return {
    reserves: box("reserves"),
    ko: box("ko"),
    injured: box("injured"),
    "sent off": box("sent off"),
  };
}

const turnStep = ([x, y]: Step): Step => [-y, x];

function quarterTurn(size: number, strip: DugoutStrip): DugoutStrip {
  const [x, y] = strip.start;
  return {
    ...strip,
    start: [size - y, x],
    along: turnStep(strip.along),
    depth: turnStep(strip.depth),
  };
}

function turnSeat(
  size: number,
  strips: readonly [DugoutStrip, DugoutStrip]
): readonly [DugoutStrip, DugoutStrip] {
  return [quarterTurn(size, strips[0]), quarterTurn(size, strips[1])];
}

export function arenaDugoutStrips(layout: PitchLayout): ArenaStrips {
  const { arm } = layout.frames[0];
  const ring = BENCH_GAP + BENCH_DEPTHS.length;
  const benchLength = layout.cols + ring + BENCH_GAP;
  const reserves: DugoutStrip = {
    start: [arm.offset + arm.width + BENCH_GAP, arm.offset - BENCH_GAP],
    along: [0, -1],
    depth: [1, 0],
    boxes: [["reserves", HOME_COLUMNS.reserves.length]],
  };
  const bench: DugoutStrip = {
    start: [layout.cols + ring, -BENCH_GAP],
    along: [-1, 0],
    depth: [0, -1],
    boxes: [
      ["ko", BENCH_BOX],
      ["injured", BENCH_BOX],
      ["sent off", benchLength - 2 * BENCH_BOX],
    ],
  };
  const north = [reserves, bench] as const;
  const east = turnSeat(layout.cols, north);
  const south = turnSeat(layout.cols, east);
  return { north, east, south, west: turnSeat(layout.cols, south) };
}

export function arenaDugouts(
  layout: PitchLayout
): Readonly<Record<ArenaSeat, DugoutSquares>> {
  const strips = arenaDugoutStrips(layout);
  return {
    north: seatSquares(strips.north),
    east: seatSquares(strips.east),
    south: seatSquares(strips.south),
    west: seatSquares(strips.west),
  };
}
