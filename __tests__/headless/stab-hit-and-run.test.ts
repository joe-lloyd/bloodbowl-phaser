import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

const scenario = (attackerX: number): Scenario => ({
  id: "stab-hit-and-run",
  name: "Stab, then Hit and Run",
  description: "a stabber with Hit and Run stabs the opponent at 12,5",
  setup: {
    team1Placements: [
      {
        playerIndex: 0,
        x: attackerX,
        y: 5,
        skills: [SkillType.STAB, SkillType.HIT_AND_RUN],
      },

      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 12, y: 5 },
      { playerIndex: 1, x: 18, y: 8 },
    ],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});

async function stabThenRun(game: HeadlessGame) {
  const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
  const stabbed = await game.execute({
    type: "stab",
    attackerId,
    defenderId: fixtureValue(game.ctx.team2.players[0]).id,
  });
  expect(stabbed.pendingDecision).toMatchObject({
    type: "reaction",
    skill: SkillType.HIT_AND_RUN,
  });
  const ran = await game.execute({ type: "use-reaction", accept: true });
  expect(ran.ok).toBe(true);
  return fixtureValue(game.snapshot().teams[0]).players[0];
}

describe("Stab with Hit and Run", () => {
  it("offers one free square after a Stab Special Action, then ends the activation", async () => {
    const game = new HeadlessGame({ scenario: scenario(11), seed: 1 });
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      action: "stab",
    });

    const stabber = await stabThenRun(game);

    expect(fixtureValue(stabber).position).toEqual({ x: 10, y: 4 });
    expect(
      game.ctx.gameService.hasPlayerActed(
        fixtureValue(game.ctx.team1.players[0]).id
      )
    ).toBe(true);
    expect(game.snapshot().activeTeamId).toBe(game.ctx.team1.id);
  });

  it("offers one free square after a Stab made as part of a Blitz", async () => {
    const game = new HeadlessGame({ scenario: scenario(10), seed: 1 });
    const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "blitz",
      blockReplacement: "stab",
    });
    await game.execute({
      type: "move",
      playerId: attackerId,
      path: [{ x: 11, y: 5 }],
    });

    const stabber = await stabThenRun(game);

    expect(fixtureValue(stabber).position).toEqual({ x: 10, y: 4 });
    expect(game.ctx.gameService.hasPlayerActed(attackerId)).toBe(true);
  });
});
