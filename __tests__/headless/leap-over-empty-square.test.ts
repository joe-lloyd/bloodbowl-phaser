import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { computeActionAvailability } from "../../src/game/rules/actionAvailability";

function scenario(skill: SkillType | null): Scenario {
  return {
    id: "leap-over-empty",
    name: "Leap over an empty square",
    description: "a lineman with nobody adjacent leaps two squares east",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, ...(skill && { skills: [skill] }) },
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

async function leapEast(skill: SkillType | null) {
  const game = new HeadlessGame({ scenario: scenario(skill), seed: 1 });
  const jumper = fixtureValue(
    fixtureValue(game.snapshot().teams[0]).players[0]
  ).id;
  await game.execute({
    type: "declare-action",
    playerId: jumper,
    action: "move",
  });
  const response = await game.execute({
    type: "jump",
    playerId: jumper,
    x: 12,
    y: 5,
  });
  const dice = response.events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
  return { game, response, dice };
}

function canJump(game: HeadlessGame): boolean {
  const gs = game.ctx.gameService;
  const player = game.ctx.teams[0].players[0];
  return computeActionAvailability({
    player: fixtureValue(player),
    ballPosition: gs.getState().ballPosition,
    opponents: gs.getOpponents(fixtureValue(player).teamId),
    teammates: gs.getTeammates(fixtureValue(player).id),
    reachable: gs.getAvailableMovements(fixtureValue(player).id),
    turn: gs.getState().turn,
    hasMovedInAction: false,
  }).jump;
}

describe("a Jump over an empty square", () => {
  it("is open to a Leap player", async () => {
    const { game, response, dice } = await leapEast(SkillType.LEAP);

    expect(response.ok).toBe(true);
    expect(dice).toEqual(["Jump (Human Lineman #1): 4, needs 3+"]);
    expect(fixtureValue(game.ctx.teams[0].players[0]).gridPosition).toEqual({
      x: 12,
      y: 5,
    });
    expect(fixtureValue(game.ctx.teams[0].players[0]).status).toBe(
      PlayerStatus.ACTIVE
    );
  });

  it("is open to a Pogo player", async () => {
    const { game, response } = await leapEast(SkillType.POGO);

    expect(response.ok).toBe(true);
    expect(fixtureValue(game.ctx.teams[0].players[0]).gridPosition).toEqual({
      x: 12,
      y: 5,
    });
  });

  it("is still refused without Leap or Pogo", async () => {
    const { game, response, dice } = await leapEast(null);

    expect(response.ok).toBe(false);
    expect(dice).toEqual([]);
    expect(fixtureValue(game.ctx.teams[0].players[0]).gridPosition).toEqual({
      x: 10,
      y: 5,
    });
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
