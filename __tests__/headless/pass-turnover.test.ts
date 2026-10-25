import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * A Pass or Hand-off is judged once the ball comes to rest: "If no player on
 * the active team catches the ball after a Pass Action, and the ball comes to
 * a rest on the ground or in possession of an opposition player, then a
 * Turnover is caused" (2025 rulebook p.75). A drop that bounces into a
 * team-mate's hands is no Turnover (p.35). Seeds are committed, never
 * searched (see docs/E2E_TESTING.md); each test first asserts where its seed
 * left the ball, so a dice-order change fails loudly.
 */

const passScenario: Scenario = {
  id: "pass-to-opponent",
  name: "Pass into an opponent's square",
  description: "team1 throws at a lone team2 player",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 2, y: 12 },
    ],
    team2Placements: [{ playerIndex: 0, x: 8, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

const handoffScenario: Scenario = {
  id: "handoff-in-a-crowd",
  name: "Hand-off with team-mates all around",
  description: "a dropped hand-off can bounce into another team-mate",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 6, y: 5 },
      { playerIndex: 2, x: 7, y: 5 },
      { playerIndex: 3, x: 6, y: 6 },
      { playerIndex: 4, x: 6, y: 4 },
    ],
    team2Placements: [{ playerIndex: 0, x: 20, y: 8 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

/** Opponent catches the pass at (8,5). */
const OPPONENT_CATCHES_SEED = 5;
/** Opponent drops the pass; it bounces to the empty (9,5). */
const OPPONENT_DROPS_SEED = 1;
/** Hand-off caught by its target at (6,5). */
const HANDOFF_CAUGHT_SEED = 1;
/** Hand-off dropped at (6,5); it bounces to (7,5) and that team-mate catches. */
const HANDOFF_RESCUED_SEED = 35;

async function declineRerolls(
  game: HeadlessGame,
  response: CommandResponse
): Promise<CommandResponse> {
  let r = response;
  while (r.pendingDecision?.type === "reroll") {
    r = await game.execute({ type: "use-reroll", accept: false });
  }
  return r;
}

async function passTo(seed: number, x: number, y: number) {
  const game = new HeadlessGame({ scenario: passScenario, seed });
  const passerId = game.ctx.team1.players[0].id;
  await game.execute({ type: "declare-action", playerId: passerId, action: "pass" });
  return declineRerolls(
    game,
    await game.execute({ type: "pass", playerId: passerId, x, y })
  );
}

async function handOff(seed: number) {
  const game = new HeadlessGame({ scenario: handoffScenario, seed });
  const passerId = game.ctx.team1.players[0].id;
  const targetId = game.ctx.team1.players[1].id;
  await game.execute({ type: "declare-action", playerId: passerId, action: "handoff" });
  return declineRerolls(
    game,
    await game.execute({ type: "handoff", playerId: passerId, targetId })
  );
}

function holderAt(response: CommandResponse): string | undefined {
  const { ballPosition, teams } = response.snapshot;
  return [...teams[0].players, ...teams[1].players].find(
    (p) =>
      !!ballPosition &&
      p.position?.x === ballPosition.x &&
      p.position?.y === ballPosition.y
  )?.id;
}

describe("a pass that ends outside the active team's hands", () => {
  it("is a turnover when an opponent catches it", async () => {
    const response = await passTo(OPPONENT_CATCHES_SEED, 8, 5);

    expect(response.snapshot.ballPosition).toEqual({ x: 8, y: 5 });
    expect(holderAt(response)).toBe("team2-player-1");
    expect(response.snapshot.activeTeamId).toBe("team2");
  });

  it("is a turnover when an opponent drops it to the ground", async () => {
    const response = await passTo(OPPONENT_DROPS_SEED, 8, 5);

    expect(response.snapshot.ballPosition).toEqual({ x: 9, y: 5 });
    expect(holderAt(response)).toBeUndefined();
    expect(response.snapshot.activeTeamId).toBe("team2");
  });
});

describe("a hand-off judged once the ball is at rest", () => {
  it("keeps the turn when the target catches it", async () => {
    const response = await handOff(HANDOFF_CAUGHT_SEED);

    expect(holderAt(response)).toBe("team1-player-2");
    expect(response.snapshot.activeTeamId).toBe("team1");
  });

  it("keeps the turn when a dropped hand-off bounces into a team-mate's hands", async () => {
    const response = await handOff(HANDOFF_RESCUED_SEED);

    expect(response.snapshot.ballPosition).toEqual({ x: 7, y: 5 });
    expect(holderAt(response)).toBe("team1-player-3");
    expect(response.snapshot.activeTeamId).toBe("team1");
  });
});
