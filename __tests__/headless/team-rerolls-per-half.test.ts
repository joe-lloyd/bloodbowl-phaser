import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

/**
 * Team re-rolls are a per-half allowance, not a roster resource. The Team
 * Re-roll marker counts what is left this half; it is reset to the purchased
 * count at half-time, and unused ones never carry over (2025 rulebook,
 * "Team Re-rolls"). Spending one used to decrement the roster's count, so a
 * league team lost it for good and never got it back at half-time.
 */
const scenario: Scenario = {
  id: "team-rerolls-per-half",
  name: "Team re-rolls per half",
  description: "a mover fails a pickup and spends a team re-roll",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 4, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

/** Seed 8 fails the pickup, then the team re-roll picks it up; committed. */
const FAILED_PICKUP_SEED = 8;

async function spendOneReroll(turn: number) {
  const game = new HeadlessGame({ scenario, seed: FAILED_PICKUP_SEED });
  game.ctx.team1.rerolls = 2;
  game.ctx.gameService.seedTurnCounts(turn);
  const mover = game.snapshot().teams[0].players[0];

  await game.execute({
    type: "declare-action",
    playerId: mover.id,
    action: "move",
  });
  const moved = await game.execute({
    type: "move",
    playerId: mover.id,
    path: [{ x: 5, y: 5 }],
  });
  // The seed must still fail the pickup, or this test proves nothing.
  expect(moved.pendingDecision?.type).toBe("reroll");
  const rerolled = await game.execute({
    type: "use-reroll",
    accept: true,
    source: "team",
  });
  // ...and the re-roll must succeed, so the turn carries on.
  expect(rerolled.snapshot.activeTeamId).toBe("team1");
  return { game, rerolled };
}

describe("team re-rolls per half", () => {
  it("spends from this half's allowance, never from the roster", async () => {
    const { game, rerolled } = await spendOneReroll(3);

    expect(rerolled.snapshot.teams[0].rerolls).toBe(1);
    expect(game.ctx.team1.rerolls).toBe(2);

    // A new turn in the same half does not give it back.
    const next = await game.execute({ type: "end-turn" });
    expect(next.snapshot.activeTeamId).toBe("team2");
    expect(next.snapshot.teams[0].rerolls).toBe(1);
  });

  it("replenishes to the purchased count at half-time", async () => {
    const { game } = await spendOneReroll(6);

    const halftime = await game.execute({ type: "end-turn" });
    expect(halftime.snapshot.turn.isHalf2).toBe(true);
    expect(halftime.snapshot.teams[0].rerolls).toBe(2);
    expect(game.ctx.team1.rerolls).toBe(2);
  });
});
