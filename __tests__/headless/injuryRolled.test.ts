import { describe, expect, it } from "vitest";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { GameEventNames } from "../../src/types/events";
import { turnGame } from "./eventOrder/eventOrder";
import { turnIntoFrog } from "../../src/game/inducements/matchInducements";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { forceDice } from "../utils/test-helpers";

/** What InjuryRolled reports: the result the player actually suffers. */
describe("InjuryRolled", () => {
  async function injure(
    opts: ConstructorParameters<typeof InjuryOperation>[1],
    frog = false
  ) {
    const game = turnGame(1, [{ x: 10, y: 5 }], [{ x: 11, y: 5 }], {
      x: 2,
      y: 2,
    });
    const [victim] = game.ctx.team2.players;
    if (frog) turnIntoFrog(game.ctx.gameService.getState(), victim);
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

  it("reports a Zap!ped frog's casualty as Badly Hurt", async () => {
    const { reported } = await injure({ roll: 12 }, true);
    expect(reported).toMatchObject([{ result: "Badly Hurt" }]);
  });

  it("reports a frog pushed into the crowd as Badly Hurt, off to the Reserves on a Stun", async () => {
    const game = turnGame(1, [{ x: 10, y: 0 }], [{ x: 11, y: 0 }], {
      x: 2,
      y: 2,
    });
    const [victim] = game.ctx.team2.players;
    turnIntoFrog(game.ctx.gameService.getState(), victim);
    const reported: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.InjuryRolled, (data) =>
      reported.push(data)
    );
    forceDice(game.ctx.rng, [6, 6]);
    const { flowManager } = game.ctx.gameService.getFlowContext();
    await flowManager.runToRest(
      new CrowdInjuryOperation(victim.id, { x: 11, y: 0 }, false)
    );

    expect(reported).toEqual([
      {
        playerId: victim.id,
        result: "Badly Hurt",
        rollType: `Injury by the Crowd (${victim.playerName})`,
        stunnedToReserves: true,
      },
    ]);
  });
});
