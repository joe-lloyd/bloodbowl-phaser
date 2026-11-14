import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";

/**
 * FAQ (May 2026): "If my player with the Always Hungry Trait eats another
 * one of my players, does that cause a Turnover? Only if that eaten player
 * was in possession of the ball." Eating a team-mate always turned over.
 * Seeds are committed, never searched.
 */
/** "Always Hungry: 1", then "Always Hungry (Eat): 1". */
const EATEN_SEED = 7;

function scenario(mateHasBall: boolean): Scenario {
  return {
    id: "always-hungry-turnover",
    name: "Always Hungry eats a team-mate",
    description: "a hungry thrower eats the team-mate it meant to throw",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 4,
          y: 5,
          skills: [SkillType.THROW_TEAM_MATE, SkillType.ALWAYS_HUNGRY],
        },
        { playerIndex: 1, x: 5, y: 5, skills: [SkillType.RIGHT_STUFF] },
        // Still to act, so a turn without a Turnover does not end on its own.
        { playerIndex: 2, x: 1, y: 1 },
      ],
      team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: mateHasBall ? { x: 5, y: 5 } : { x: 15, y: 2 },
    },
  };
}

async function eatMate(mateHasBall: boolean) {
  const game = new HeadlessGame({ scenario: scenario(mateHasBall), seed: EATEN_SEED });
  const throwerId = game.ctx.team1.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: throwerId,
    action: "throwTeamMate",
  });
  const response = await game.execute({
    type: "throw-teammate",
    throwerId,
    teammateId: game.ctx.team1.players[1].id,
    x: 8,
    y: 5,
  });
  const dice = response.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
  return { game, response, dice, throwerId };
}

describe("Always Hungry eating a team-mate", () => {
  it("is no Turnover when the eaten player did not have the ball", async () => {
    const { game, response, dice, throwerId } = await eatMate(false);

    expect(dice).toEqual(["Always Hungry: 1", "Always Hungry (Eat): 1"]);
    expect(game.ctx.team1.players[1].status).toBe(PlayerStatus.DEAD);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.team1.id);
    expect(game.ctx.gameService.hasPlayerActed(throwerId)).toBe(true);
  });

  it("is a Turnover when the eaten player had the ball", async () => {
    const { game, response, dice } = await eatMate(true);

    expect(dice.slice(0, 2)).toEqual([
      "Always Hungry: 1",
      "Always Hungry (Eat): 1",
    ]);
    expect(game.ctx.team1.players[1].status).toBe(PlayerStatus.DEAD);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.team2.id);
  });
});
