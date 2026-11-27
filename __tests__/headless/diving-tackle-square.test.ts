import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";
import { forceDice } from "../utils/test-helpers";

describe("Diving Tackle", () => {
  it("never leaves the diver and the dodger on one square", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "diving-tackle-square",
        name: "Diving Tackle square",
        description: "A dodge brought down by Diving Tackle",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 5, y: 5, skills: [SkillType.STEADY_FOOTING] },
            { playerIndex: 1, x: 2, y: 2 },
          ],
          team2Placements: [
            { playerIndex: 0, x: 6, y: 6, skills: [SkillType.DIVING_TACKLE] },
          ],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    game.ctx.teams[0].rerolls = 1;
    const dodger = game.ctx.teams[0].players[0];
    const diver = game.ctx.teams[1].players[0];

    forceDice(game.ctx.rng, [4, 1]);

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(dodger).id,
      action: "move",
    });
    const dodged = await game.execute({
      type: "move",
      playerId: fixtureValue(dodger).id,
      path: [{ x: 4, y: 4 }],
    });
    expect(dodged.pendingDecision?.type).toBe("reaction");
    const dived = await game.execute({ type: "use-reaction", accept: true });

    expect(dived.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "steady-footing",
    });
    expect(fixtureValue(diver).gridPosition).toEqual({ x: 5, y: 5 });
    expect(fixtureValue(dodger).gridPosition).toEqual({ x: 4, y: 4 });
  });

  it("never leaves the diver and a jumper on one square", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "diving-tackle-jump-square",
        name: "Diving Tackle jump square",
        description: "A Jump brought down by Diving Tackle",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 5, y: 5, skills: [SkillType.STEADY_FOOTING] },
            { playerIndex: 1, x: 2, y: 2 },
          ],
          team2Placements: [
            { playerIndex: 0, x: 4, y: 6, skills: [SkillType.DIVING_TACKLE] },
            { playerIndex: 1, x: 6, y: 5, status: PlayerStatus.PRONE },
          ],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    game.ctx.teams[0].rerolls = 1;
    const jumper = game.ctx.teams[0].players[0];
    const diver = game.ctx.teams[1].players[0];

    forceDice(game.ctx.rng, [5, 1]);

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(jumper).id,
      action: "move",
    });
    const jumped = await game.execute({
      type: "jump",
      playerId: fixtureValue(jumper).id,
      x: 7,
      y: 5,
    });
    expect(jumped.pendingDecision?.type).toBe("reaction");
    const dived = await game.execute({ type: "use-reaction", accept: true });

    expect(dived.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "steady-footing",
    });
    expect(fixtureValue(diver).gridPosition).toEqual({ x: 5, y: 5 });
    expect(fixtureValue(jumper).gridPosition).toEqual({ x: 7, y: 5 });
  });
});
