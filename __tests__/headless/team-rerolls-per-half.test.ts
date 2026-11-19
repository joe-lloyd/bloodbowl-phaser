import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

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

const FAILED_PICKUP_SEED = 8;

async function spendOneReroll(turn: number) {
  const game = new HeadlessGame({ scenario, seed: FAILED_PICKUP_SEED });
  game.ctx.team1.rerolls = 2;
  game.ctx.gameService.seedTurnCounts(turn);
  const mover = fixtureValue(game.snapshot().teams[0]).players[0];

  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(mover).id,
    action: "move",
  });
  const moved = await game.execute({
    type: "move",
    playerId: fixtureValue(mover).id,
    path: [{ x: 5, y: 5 }],
  });

  expect(moved.pendingDecision?.type).toBe("reroll");
  const rerolled = await game.execute({
    type: "use-reroll",
    accept: true,
    source: "team",
  });

  expect(rerolled.snapshot.activeTeamId).toBe("team1");
  return { game, rerolled };
}

describe("team re-rolls per half", () => {
  it("spends from this half's allowance, never from the roster", async () => {
    const { game, rerolled } = await spendOneReroll(3);

    expect(fixtureValue(rerolled.snapshot.teams[0]).rerolls).toBe(1);
    expect(game.ctx.team1.rerolls).toBe(2);

    const next = await game.execute({ type: "end-turn" });
    expect(next.snapshot.activeTeamId).toBe("team2");
    expect(fixtureValue(next.snapshot.teams[0]).rerolls).toBe(1);
  });

  it("replenishes to the purchased count at half-time", async () => {
    const { game } = await spendOneReroll(6);

    const halftime = await game.execute({ type: "end-turn" });
    expect(halftime.snapshot.turn.isHalf2).toBe(true);
    expect(fixtureValue(halftime.snapshot.teams[0]).rerolls).toBe(2);
    expect(game.ctx.team1.rerolls).toBe(2);
  });
});
