import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMatchStateBaseline } from "./matchStateVisualBaseline";
import { GameState } from "../../src/types/GameState";
import { Player, PlayerStatus } from "../../src/types/Player";

/**
 * Fixed-viewport screenshot baselines for the four stable checkpoints called
 * out by `match-state-visual-sync`: a selected/loose ball, a carried ball after
 * a mid-route pickup, a knocked-out player in the KO box, and a restored turn
 * with one player already activated.
 *
 * The render is deterministic and browser-free (see matchStateVisualBaseline),
 * so the comparison is exact rather than tolerance-based.
 *
 * UPDATE BASELINES:  UPDATE_VISUAL_BASELINES=1 npx vitest run \
 *                      __tests__/headless/match-state-visual-baseline.test.ts
 */

const TEAM1 = "team1";
const TEAM2 = "team2";

function player(
  id: string,
  teamId: string,
  square: { x: number; y: number } | undefined,
  status: PlayerStatus = PlayerStatus.ACTIVE
): Player {
  return { id, teamId, status, gridPosition: square } as unknown as Player;
}

function stateWith(
  ballPosition: { x: number; y: number } | null,
  activated: string[] = []
): Pick<GameState, "ballPosition" | "turn"> {
  return {
    ballPosition,
    turn: {
      teamId: TEAM1,
      turnNumber: 1,
      isHalf2: false,
      activatedPlayerIds: new Set(activated),
      hasBlitzed: false,
      hasPassed: false,
      hasHandedOff: false,
      hasFouled: false,
      movementUsed: new Map(),
    },
  };
}

const BASE_PLAYERS = [
  player("t1-a", TEAM1, { x: 6, y: 5 }),
  player("t1-b", TEAM1, { x: 6, y: 7 }),
  player("t2-a", TEAM2, { x: 13, y: 5 }),
];

const CHECKPOINTS: [string, () => string][] = [
  [
    "loose-ball.svg",
    () =>
      renderMatchStateBaseline({
        state: stateWith({ x: 9, y: 5 }),
        players: BASE_PLAYERS,
        team1Id: TEAM1,
      }),
  ],
  [
    "carried-ball.svg",
    () =>
      // Post mid-route pickup: the runner has walked past the pickup square
      // holding the ball. Exactly one ball mark — the carrier badge.
      renderMatchStateBaseline({
        state: stateWith({ x: 11, y: 5 }),
        players: [
          player("t1-a", TEAM1, { x: 11, y: 5 }),
          player("t1-b", TEAM1, { x: 6, y: 7 }),
          player("t2-a", TEAM2, { x: 13, y: 5 }),
        ],
        team1Id: TEAM1,
      }),
  ],
  [
    "knocked-out.svg",
    () =>
      // The KO'd defender is drawn in the KO box, never on their old square.
      renderMatchStateBaseline({
        state: stateWith({ x: 9, y: 5 }),
        players: [
          player("t1-a", TEAM1, { x: 6, y: 5 }),
          player("t1-b", TEAM1, { x: 6, y: 7 }),
          player("t2-a", TEAM2, undefined, PlayerStatus.KO),
        ],
        team1Id: TEAM1,
      }),
  ],
  [
    "restored-activation.svg",
    () =>
      // Resumed mid-turn: t1-a has already gone and keeps the dimmed look.
      renderMatchStateBaseline({
        state: stateWith({ x: 9, y: 5 }, ["t1-a"]),
        players: BASE_PLAYERS,
        team1Id: TEAM1,
      }),
  ],
];

const baselinePath = (file: string) =>
  resolve(process.cwd(), "__tests__", "headless", "screenshots", file);

describe("fixed-viewport match-state visual baselines", () => {
  it.each(CHECKPOINTS)("matches the %s checkpoint", (file, render) => {
    const actual = render().replace(/\r\n/g, "\n").trim();
    const path = baselinePath(file);

    if (process.env.UPDATE_VISUAL_BASELINES === "1" || !existsSync(path)) {
      writeFileSync(path, `${actual}\n`, "utf8");
    }

    const expected = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
    expect(actual).toBe(expected);
    // The viewport must stay fixed or the baselines are not comparable.
    expect(expected).toContain('width="1200" height="660"');
  });

  it("never draws more than one ball mark", () => {
    for (const [, render] of CHECKPOINTS) {
      const svg = render();
      expect((svg.match(/data-ball=/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("never draws an off-pitch player as a pitch counter", () => {
    const svg = CHECKPOINTS.find(([file]) => file === "knocked-out.svg")![1]();
    expect(svg).toContain('data-player="t2-a" data-box="ko"');
    expect(svg).not.toMatch(/<circle[^>]*data-player="t2-a"/);
  });
});
