import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

const scenario: Scenario = {
  id: "frenzy-pow-ball-carrier",
  name: "Frenzy knocks down the ball carrier",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.FRENZY] },

      { playerIndex: 1, x: 2, y: 12 },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 11, y: 5 },
  },
};

const SEED = 30;

describe("Frenzy knocking down the ball carrier", () => {
  it("lets the dropped ball Bounce before the follow-up", async () => {
    const game = new HeadlessGame({ scenario, seed: SEED });
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await game.execute({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await game.execute({ type: "choose-block-result", index: 0 });
    const push = await game.execute({
      type: "choose-push-direction",
      x: 12,
      y: 5,
    });

    expect(
      push.events
        .filter((e) => e.name === "diceRoll")
        .map(
          (e) => z.object({ description: z.string() }).parse(e.data).description
        )
    ).toEqual([
      "Armour Roll (Human Lineman #1): 6 + 3 = 9",
      "Injury Roll (Human Lineman #1): 2 + 1 = 3",
      "Bounce Direction: 4",

      "Pickup (Human Lineman #1): 6, needs 3+",
    ]);
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 11, y: 5 });
    expect(game.snapshot().ballPosition).toEqual({ x: 11, y: 5 });
  });
});
