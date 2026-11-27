import { describe, expect, it, vi } from "vitest";
import {
  type Frame,
  inSetupSection,
  onScrimmage,
  scoresAt,
  wideZoneOf,
} from "../../../src/game/rules/frames";
import {
  edgeCrossed,
  isOnPitch,
  isStandableSquare,
  nearestFreeSquare,
  pushLandingAt,
} from "../../../src/game/rules/pitchSquares";
import { seatTeams } from "../../../src/game/seating";
import {
  isInsideLayout,
  PITCH_LAYOUTS,
  type Square,
  twoTeamFrames,
} from "../../../src/game/variants/pitchLayouts";
import type * as ActiveMatch from "../../../src/game/variants/activeMatch";
import { teamWith } from "../controllers/controllerFixtures";

vi.mock("../../../src/game/variants/activeMatch", async (importOriginal) => ({
  ...(await importOriginal<typeof ActiveMatch>()),
  activeLayout: () => PITCH_LAYOUTS.deathbowl,
}));

const plus = PITCH_LAYOUTS.deathbowl;

const EVERY_SQUARE: Square[] = Array.from({ length: 21 * 21 }, (_, i) => ({
  x: i % 21,
  y: Math.floor(i / 21),
}));

const where = (test: (square: Square) => boolean) =>
  EVERY_SQUARE.filter((square) => test(square)).map(({ x, y }) => `${String(x)},${String(y)}`);

function block(columns: [number, number], rows: [number, number]): string[] {
  return where(
    ({ x, y }) =>
      x >= columns[0] && x <= columns[1] && y >= rows[0] && y <= rows[1]
  );
}

const seat = (index: 0 | 1 | 2 | 3): Frame => {
  const frame = plus.frames[index];
  if (!frame) throw new Error(`The plus has no seat ${String(index)}.`);
  return frame;
};

const NORTH = seat(0);
const EAST = seat(1);
const SOUTH = seat(2);
const WEST = seat(3);

describe("the Deathbowl plus (DB-P1)", () => {
  it("is pitch on columns 5 to 15 of every row and rows 5 to 15 of every column", () => {
    const grid = Array.from({ length: 21 }, (_, y) =>
      Array.from({ length: 21 }, (_, x) =>
        isInsideLayout(plus, { x, y }) ? "#" : "."
      ).join("")
    );
    const arm = ".....###########.....";
    const centre = "#####################";
    expect(grid).toEqual([
      ...Array.from({ length: 5 }, () => arm),
      ...Array.from({ length: 11 }, () => centre),
      ...Array.from({ length: 5 }, () => arm),
    ]);
    expect(where((square) => isInsideLayout(plus, square))).toHaveLength(341);
  });

  it("is a 21 by 21 grass arena with nothing on it", () => {
    expect({
      label: plus.label,
      cols: plus.cols,
      rows: plus.rows,
      surface: plus.surface,
      walledSidelines: plus.walledSidelines,
      obstacles: plus.obstacles,
      barricades: plus.barricades,
      trapdoors: plus.trapdoors,
    }).toEqual({
      label: "Deathbowl arena",
      cols: 21,
      rows: 21,
      surface: "grass",
      walledSidelines: false,
      obstacles: [],
      barricades: [],
      trapdoors: [],
    });
  });
});

const zone = (frame: Frame, side: 0 | 1) =>
  where((square) => wideZoneOf(frame, square) === side);

const line = (frame: Frame) =>
  EVERY_SQUARE.filter((square) => onScrimmage(frame, square));

const touching = (a: Frame, b: Frame) =>
  line(a).flatMap((p) =>
    line(b)
      .filter((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 1)
      .map((q) => [p, q])
  );

describe("the four arms (DB-P2, DB-S1)", () => {
  it("puts each seat's end zone across from its own end", () => {
    expect(where((square) => scoresAt(NORTH, square))).toEqual(block([5, 15], [20, 20]));
    expect(where((square) => scoresAt(EAST, square))).toEqual(block([0, 0], [5, 15]));
    expect(where((square) => scoresAt(SOUTH, square))).toEqual(block([5, 15], [0, 0]));
    expect(where((square) => scoresAt(WEST, square))).toEqual(block([20, 20], [5, 15]));
  });

  it("draws each Line of Scrimmage 6 squares in, across the centre strip", () => {
    expect(where((square) => onScrimmage(NORTH, square))).toEqual(block([7, 13], [6, 6]));
    expect(where((square) => onScrimmage(EAST, square))).toEqual(block([14, 14], [7, 13]));
    expect(where((square) => onScrimmage(SOUTH, square))).toEqual(block([7, 13], [14, 14]));
    expect(where((square) => onScrimmage(WEST, square))).toEqual(block([6, 6], [7, 13]));
  });

  it("sets each team up in its own centre strip, between its end zone and its line", () => {
    expect(where((square) => inSetupSection(NORTH, square))).toEqual(block([7, 13], [0, 6]));
    expect(where((square) => inSetupSection(EAST, square))).toEqual(block([14, 20], [7, 13]));
    expect(where((square) => inSetupSection(SOUTH, square))).toEqual(block([7, 13], [14, 20]));
    expect(where((square) => inSetupSection(WEST, square))).toEqual(block([0, 6], [7, 13]));
  });

  it("gives each arm a Wide Zone of 2 on each side", () => {
    expect(zone(NORTH, 0)).toEqual(block([5, 6], [0, 20]));
    expect(zone(NORTH, 1)).toEqual(block([14, 15], [0, 20]));
    expect(zone(EAST, 0)).toEqual(block([0, 20], [5, 6]));
    expect(zone(EAST, 1)).toEqual(block([0, 20], [14, 15]));
    expect(zone(SOUTH, 0)).toEqual(block([5, 6], [0, 20]));
    expect(zone(SOUTH, 1)).toEqual(block([14, 15], [0, 20]));
    expect(zone(WEST, 0)).toEqual(block([0, 20], [5, 6]));
    expect(zone(WEST, 1)).toEqual(block([0, 20], [14, 15]));
  });

  it("lets neighbouring Lines of Scrimmage touch only corner to corner", () => {
    expect(touching(NORTH, EAST)).toEqual([[{ x: 13, y: 6 }, { x: 14, y: 7 }]]);
    expect(touching(EAST, SOUTH)).toEqual([[{ x: 14, y: 13 }, { x: 13, y: 14 }]]);
    expect(touching(SOUTH, WEST)).toEqual([[{ x: 7, y: 14 }, { x: 6, y: 13 }]]);
    expect(touching(WEST, NORTH)).toEqual([[{ x: 6, y: 7 }, { x: 7, y: 6 }]]);
  });
});

describe("a corner of the plus", () => {
  it("is crowd for a move, a push, a bounce and a scatter", () => {
    const corner = { x: 4, y: 4 };
    expect(isOnPitch(corner)).toBe(false);
    expect(isStandableSquare(corner)).toBe(false);
    expect(edgeCrossed(corner)).toBe("crowd");
    expect(pushLandingAt({ x: 5, y: 4 }, corner)).toBe("crowd");
    expect(pushLandingAt({ x: 4, y: 5 }, { x: 4, y: 6 })).toBe("pitch");
  });

  it("is never offered as the nearest free square", () => {
    expect(nearestFreeSquare({ x: 5, y: 5 }, () => false)).toEqual({ x: 5, y: 4 });
  });
});

describe("two-team code on the plus", () => {
  it("refuses to read four seats as a pair", () => {
    const message = "The Deathbowl arena seats 4 teams, and this part of the game plays with two.";
    expect(() => twoTeamFrames(plus)).toThrow(message);
    expect(() =>
      seatTeams([teamWith({ id: "a" }), teamWith({ id: "b" })], plus)
    ).toThrow("The Deathbowl arena seats 4 teams, not 2.");
  });
});
