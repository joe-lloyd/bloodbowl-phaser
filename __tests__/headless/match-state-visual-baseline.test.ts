import { oneBall } from "@/game/rules/balls";
import { freshSpend } from "../../src/game/rules/turnSpend";
import { createTestPlayer } from "../fixtures/players";
import { shouldUpdateVisualBaselines } from "../../src/boundary/testEnvironment";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderMatchStateBaseline } from "./matchStateVisualBaseline";
import { type GameState } from "../../src/types/GameState";
import { type Player, PlayerStatus } from "../../src/types/Player";

const TEAM1 = "team1";
const TEAM2 = "team2";

function player({
  id,
  teamId,
  square,
  status = PlayerStatus.ACTIVE,
}: {
  id: string;
  teamId: string;
  square: { x: number; y: number } | undefined;
  status?: PlayerStatus;
}): Player {
  return createTestPlayer({
    id,
    teamId,
    status,
    ...(square && { gridPosition: square }),
  });
}

function stateWith(
  ballPosition: { x: number; y: number } | null,
  activated: string[] = []
): Pick<GameState, "balls" | "turn"> {
  return {
    balls: oneBall(ballPosition),
    turn: {
      teamId: TEAM1,
      turnNumber: 1,
      isHalf2: false,
      activatedPlayerIds: new Set(activated),
      spend: freshSpend(),
      hasThrownTeamMate: false,
      hasKickedTeamMate: false,
      hasThrownBomb: false,
      movementUsed: new Map(),
    },
  };
}

const BASE_PLAYERS = [
  player({ id: "t1-a", teamId: TEAM1, square: { x: 6, y: 5 } }),
  player({ id: "t1-b", teamId: TEAM1, square: { x: 6, y: 7 } }),
  player({ id: "t2-a", teamId: TEAM2, square: { x: 13, y: 5 } }),
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
      renderMatchStateBaseline({
        state: stateWith({ x: 11, y: 5 }),
        players: [
          player({ id: "t1-a", teamId: TEAM1, square: { x: 11, y: 5 } }),
          player({ id: "t1-b", teamId: TEAM1, square: { x: 6, y: 7 } }),
          player({ id: "t2-a", teamId: TEAM2, square: { x: 13, y: 5 } }),
        ],
        team1Id: TEAM1,
      }),
  ],
  [
    "knocked-out.svg",
    () =>
      renderMatchStateBaseline({
        state: stateWith({ x: 9, y: 5 }),
        players: [
          player({ id: "t1-a", teamId: TEAM1, square: { x: 6, y: 5 } }),
          player({ id: "t1-b", teamId: TEAM1, square: { x: 6, y: 7 } }),
          player({
            id: "t2-a",
            teamId: TEAM2,
            square: undefined,
            status: PlayerStatus.KO,
          }),
        ],
        team1Id: TEAM1,
      }),
  ],
  [
    "restored-activation.svg",
    () =>
      renderMatchStateBaseline({
        state: stateWith({ x: 9, y: 5 }, ["t1-a"]),
        players: BASE_PLAYERS,
        team1Id: TEAM1,
      }),
  ],
];

const baselinePath = (file: string) =>
  path.resolve(process.cwd(), "__tests__", "headless", "screenshots", file);

describe("fixed-viewport match-state visual baselines", () => {
  it.each(CHECKPOINTS)("matches the %s checkpoint", (file, render) => {
    const actual = render().replaceAll('\r\n', "\n").trim();
    const path = baselinePath(file);

    if (shouldUpdateVisualBaselines() || !existsSync(path)) {
      writeFileSync(path, `${actual}\n`, "utf8");
    }

    const expected = readFileSync(path, "utf8").replaceAll('\r\n', "\n").trim();
    expect(actual).toBe(expected);

    expect(expected).toContain('width="1200" height="660"');
  });

  it("never draws more than one ball mark", () => {
    for (const [, render] of CHECKPOINTS) {
      const svg = render();
      expect((svg.match(/data-ball=/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("never draws an off-pitch player as a pitch counter", () => {
    const svg = fixtureValue(
      CHECKPOINTS.find(([file]) => file === "knocked-out.svg")
    )[1]();
    expect(svg).toContain('data-player="t2-a" data-box="ko"');
    expect(svg).not.toMatch(/<circle[^>]*data-player="t2-a"/);
  });
});
