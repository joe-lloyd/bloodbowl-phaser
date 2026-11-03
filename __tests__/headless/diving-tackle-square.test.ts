import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";

/**
 * Diving Tackle places the diver in the square the dodger left. While a
 * re-roll for the dodger's Steady Footing is still open, the dodger must
 * already stand in the square it dodged into, not share the diver's.
 */
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
    game.ctx.team1.rerolls = 1;
    const dodger = game.ctx.team1.players[0];
    const diver = game.ctx.team2.players[0];
    // Dodge 4 (passes 3+, fails after the dive's -2), Steady Footing 1
    forceDice(game.ctx.rng, [4, 1]);

    await game.execute({
      type: "declare-action",
      playerId: dodger.id,
      action: "move",
    });
    const dodged = await game.execute({
      type: "move",
      playerId: dodger.id,
      path: [{ x: 4, y: 4 }],
    });
    expect(dodged.pendingDecision?.type).toBe("reaction");
    const dived = await game.execute({ type: "use-reaction", accept: true });

    expect(dived.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "steady-footing",
    });
    expect(diver.gridPosition).toEqual({ x: 5, y: 5 });
    expect(dodger.gridPosition).toEqual({ x: 4, y: 4 });
  });
});
