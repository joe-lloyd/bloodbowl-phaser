import { describe, it, expect } from "vitest";
import { pushBackSquares, jumpTargets } from "../../../src/game/rules/jump";
import { type Player, PlayerStatus } from "../../../src/types/Player";

const key = (s: { x: number; y: number }) => `${String(s.x)},${String(s.y)}`;
const set = (arr: { x: number; y: number }[]) => new Set(arr.map(key));

describe("jump push-back geometry", () => {
  it("diagonal jumper at 1 over 5 → 6/8/9", () => {
    const squares = pushBackSquares({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(set(squares)).toEqual(
      set([
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ])
    );
  });

  it("orthogonal jumper at 2 over 5 → 7/8/9", () => {
    const squares = pushBackSquares({ x: 1, y: 0 }, { x: 1, y: 1 });
    expect(set(squares)).toEqual(
      set([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ])
    );
  });
});

const P = (over: Partial<Player>): Player =>
  ({
    id: "p",
    teamId: "team2",
    playerName: "P",
    status: PlayerStatus.PRONE,
    hasActed: false,
    skills: [],
    stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
    ...over,
  }) as Player;

const inBounds = () => true;

describe("jumpTargets", () => {
  it("only offers push-back landings over an adjacent Prone player", () => {
    const targets = jumpTargets(
      { x: 0, y: 0 },
      [P({ gridPosition: { x: 1, y: 1 } })],
      false,
      inBounds
    );
    expect(set(targets.map((t) => t.dest))).toEqual(
      set([
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ])
    );

    for (const t of targets) {
      expect(t.over).toEqual({ x: 1, y: 1 });
    }
  });

  it("skips a Standing middle player without Leap/Pogo, allows it with", () => {
    const standing = [
      P({ status: PlayerStatus.ACTIVE, gridPosition: { x: 1, y: 1 } }),
    ];
    expect(jumpTargets({ x: 0, y: 0 }, standing, false, inBounds)).toHaveLength(
      0
    );
    expect(
      jumpTargets({ x: 0, y: 0 }, standing, true, inBounds).length
    ).toBeGreaterThan(0);
  });

  it("drops occupied push-back squares", () => {
    const targets = jumpTargets(
      { x: 0, y: 0 },
      [
        P({ gridPosition: { x: 1, y: 1 } }),
        P({ id: "b", gridPosition: { x: 2, y: 2 } }),
      ],
      false,
      inBounds
    );
    expect(set(targets.map((t) => t.dest))).toEqual(
      set([
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ])
    );
  });
});
