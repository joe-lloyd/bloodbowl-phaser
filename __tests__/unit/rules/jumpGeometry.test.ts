import { describe, it, expect } from "vitest";
import { pushBackSquares, jumpTargets } from "../../../src/game/rules/jump";
import { Player, PlayerStatus } from "../../../src/types/Player";

/**
 * Jump lands in the jumped-over player's push-back squares (the three squares
 * they would be pushed to if this were a Block). Using a 3×3 grid numbered
 *   1 2 3
 *   4 5 6
 *   7 8 9
 * with the jumped-over player at 5 (1,1):
 *   jumper at 1 (0,0) → land 6 (2,1), 8 (1,2) or 9 (2,2)
 *   jumper at 2 (1,0) → land 7 (0,2), 8 (1,2) or 9 (2,2)
 */
const key = (s: { x: number; y: number }) => `${s.x},${s.y}`;
const set = (arr: { x: number; y: number }[]) => new Set(arr.map(key));

describe("jump push-back geometry", () => {
  it("diagonal jumper at 1 over 5 → 6/8/9", () => {
    const squares = pushBackSquares({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(set(squares)).toEqual(
      set([
        { x: 2, y: 1 }, // 6
        { x: 1, y: 2 }, // 8
        { x: 2, y: 2 }, // 9
      ])
    );
  });

  it("orthogonal jumper at 2 over 5 → 7/8/9", () => {
    const squares = pushBackSquares({ x: 1, y: 0 }, { x: 1, y: 1 });
    expect(set(squares)).toEqual(
      set([
        { x: 0, y: 2 }, // 7
        { x: 1, y: 2 }, // 8
        { x: 2, y: 2 }, // 9
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
    // Every target is jumped over the same middle player.
    targets.forEach((t) => expect(t.over).toEqual({ x: 1, y: 1 }));
  });

  it("skips a Standing middle player without Leap/Pogo, allows it with", () => {
    const standing = [P({ status: PlayerStatus.ACTIVE, gridPosition: { x: 1, y: 1 } })];
    expect(jumpTargets({ x: 0, y: 0 }, standing, false, inBounds)).toHaveLength(0);
    expect(
      jumpTargets({ x: 0, y: 0 }, standing, true, inBounds).length
    ).toBeGreaterThan(0);
  });

  it("drops occupied push-back squares", () => {
    const targets = jumpTargets(
      { x: 0, y: 0 },
      [
        P({ gridPosition: { x: 1, y: 1 } }),
        P({ id: "b", gridPosition: { x: 2, y: 2 } }), // blocks landing 9
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
