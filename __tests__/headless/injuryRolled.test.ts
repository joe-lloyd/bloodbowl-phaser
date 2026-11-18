import { describe, expect, it } from "vitest";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { GameEventNames } from "../../src/types/events";
import { turnGame } from "./eventOrder/eventOrder";

/** What InjuryRolled reports: the result the player actually suffers. */
describe("InjuryRolled", () => {
  async function injure(opts: ConstructorParameters<typeof InjuryOperation>[1]) {
    const game = turnGame(1, [{ x: 10, y: 5 }], [{ x: 11, y: 5 }], {
      x: 2,
      y: 2,
    });
    const [victim] = game.ctx.team2.players;
    const reported: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.InjuryRolled, (data) =>
      reported.push(data)
    );
    const { flowManager } = game.ctx.gameService.getFlowContext();
    await flowManager.runToRest(new InjuryOperation(victim.id, opts));
    return { reported, victim };
  }

  it("reports a 12 as Dead", async () => {
    const { reported, victim } = await injure({ roll: 12 });
    expect(reported).toEqual([
      {
        playerId: victim.id,
        result: "Dead",
        rollType: `Injury Roll (${victim.playerName})`,
        diceTeamId: victim.teamId,
      },
    ]);
  });

  it("reports a Bloodlust bite's casualty as Badly Hurt", async () => {
    const { reported } = await injure({ roll: 12, casualtyIsBadlyHurt: true });
    expect(reported).toMatchObject([{ result: "Badly Hurt" }]);
  });
});
