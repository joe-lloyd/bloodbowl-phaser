import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

/**
 * Hit and Run (2025 rulebook p.123): "When a player with this Skill performs
 * a Block Action or a Stab Special Action, after fully resolving the Action,
 * they may immediately move one free square". FAQ (May 2026): "If I have a
 * player with the Stab Trait and Hit and Run Skill, can I still move a
 * square if the Stab is made as part of a Blitz Action? Yes, the player can
 * move one free square." The Stab ended the activation with no offer.
 */
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
      // Still to act, so the turn does not end with the stabber's activation.
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
  const attackerId = game.ctx.team1.players[0].id;
  const stabbed = await game.execute({
    type: "stab",
    attackerId,
    defenderId: game.ctx.team2.players[0].id,
  });
  expect(stabbed.pendingDecision).toMatchObject({
    type: "reaction",
    skill: SkillType.HIT_AND_RUN,
  });
  const ran = await game.execute({ type: "use-reaction", accept: true });
  expect(ran.ok).toBe(true);
  return game.snapshot().teams[0].players[0];
}

describe("Stab with Hit and Run", () => {
  it("offers one free square after a Stab Special Action, then ends the activation", async () => {
    const game = new HeadlessGame({ scenario: scenario(11), seed: 1 });
    await game.execute({
      type: "declare-action",
      playerId: game.ctx.team1.players[0].id,
      action: "stab",
    });

    const stabber = await stabThenRun(game);

    expect(stabber.position).toEqual({ x: 10, y: 4 });
    expect(
      game.ctx.gameService.hasPlayerActed(game.ctx.team1.players[0].id)
    ).toBe(true);
    expect(game.snapshot().activeTeamId).toBe(game.ctx.team1.id);
  });

  it("offers one free square after a Stab made as part of a Blitz", async () => {
    const game = new HeadlessGame({ scenario: scenario(10), seed: 1 });
    const attackerId = game.ctx.team1.players[0].id;
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

    expect(stabber.position).toEqual({ x: 10, y: 4 });
    expect(game.ctx.gameService.hasPlayerActed(attackerId)).toBe(true);
  });
});
