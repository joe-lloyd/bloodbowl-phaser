import type { DugoutBox, DugoutSquares } from "../../boundary/stadium";

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
      HOME_COLUMNS[name].map(place).sort((a, b) => a - b),
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
