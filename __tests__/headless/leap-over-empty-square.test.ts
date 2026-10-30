import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { computeActionAvailability } from "../../src/game/rules/actionAvailability";

/**
 * Leap and Pogo cross "a single adjacent square regardless of what is in
 * the square" (skills.json, Leap and Pogo). The engine built Jump targets
 * only over adjacent players, so a Leap over an empty square was refused.
 */
function scenario(skill: SkillType | null): Scenario {
  return {
    id: "leap-over-empty",
    name: "Leap over an empty square",
    description: "a lineman with nobody adjacent leaps two squares east",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, ...(skill ? { skills: [skill] } : {}) },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 20, y: 1 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

async function leapEast(skill: SkillType | null, seed: number) {
  const game = new HeadlessGame({ scenario: scenario(skill), seed });
  const jumper = game.snapshot().teams[0].players[0].id;
  await game.execute({ type: "declare-action", playerId: jumper, action: "move" });
  const response = await game.execute({
    type: "jump",
    playerId: jumper,
    x: 12,
    y: 5,
  });
  const dice = response.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
  return { game, response, dice };
}

function canJump(game: HeadlessGame): boolean {
  const gs = game.ctx.gameService;
  const player = game.ctx.team1.players[0];
  return computeActionAvailability({
    player,
    ballPosition: gs.getState().ballPosition,
    opponents: gs.getOpponents(player.teamId),
    teammates: gs.getTeammates(player.id),
    reachable: gs.getAvailableMovements(player.id),
    turn: gs.getState().turn,
    hasMovedInAction: false,
  }).jump;
}

describe("a Jump over an empty square", () => {
  it("is open to a Leap player", async () => {
    const { game, response, dice } = await leapEast(SkillType.LEAP, 1);

    expect(response.ok).toBe(true);
    expect(dice).toEqual(["Jump (Human Lineman #1): 4, needs 3+"]);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 12, y: 5 });
    expect(game.ctx.team1.players[0].status).toBe(PlayerStatus.ACTIVE);
  });

  it("is open to a Pogo player", async () => {
    const { game, response } = await leapEast(SkillType.POGO, 1);

    expect(response.ok).toBe(true);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 12, y: 5 });
  });

  it("is still refused without Leap or Pogo", async () => {
    const { game, response, dice } = await leapEast(null, 1);

    expect(response.ok).toBe(false);
    expect(dice).toEqual([]);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 10, y: 5 });
  });

  it("is offered as a Jump in the action availability", () => {
    expect(
      canJump(new HeadlessGame({ scenario: scenario(SkillType.LEAP), seed: 1 }))
    ).toBe(true);
    expect(
      canJump(new HeadlessGame({ scenario: scenario(null), seed: 1 }))
    ).toBe(false);
  });
});
