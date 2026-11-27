import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

const scenario: Scenario = {
  id: "jump-onto-ball",
  name: "Jump onto the ball",
  description: "a lineman jumps a Prone opponent and lands on the loose ball",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
      { playerIndex: 1, x: 20, y: 1 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 12, y: 5 },
  },
};

async function jumpOntoBall(seed: number) {
  const game = new HeadlessGame({ scenario, seed });
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

describe("a Jump that lands on the loose ball", () => {
  it("rolls the Pick-up after the Jump and holds the ball on a pass", async () => {
    const { game, response, dice } = await jumpOntoBall(5);

    expect(dice).toEqual([
      "Jump (Human Lineman #1): 5, needs 3+",
      "Pickup (Human Lineman #1): 5, needs 3+",
    ]);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[0].id);
    expect(fixtureValue(game.ctx.teams[0].players[0]).gridPosition).toEqual({
      x: 12,
      y: 5,
    });
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 12,
      y: 5,
    });
  });

  it("bounces the ball and turns over on a failed Pick-up", async () => {
    const { game, response, dice } = await jumpOntoBall(1);

    expect(dice).toEqual([
      "Jump (Human Lineman #1): 4, needs 3+",
      "Pickup (Human Lineman #1): 1, needs 3+",
      "Bounce Direction: 5",
    ]);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);
    expect(fixtureValue(game.ctx.teams[0].players[0]).gridPosition).toEqual({
      x: 12,
      y: 5,
    });
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 13,
      y: 5,
    });
  });
});
