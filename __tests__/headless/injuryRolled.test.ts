import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { GameEventNames } from "../../src/types/events";
import { turnGame } from "./eventOrder/eventOrder";
import { turnIntoFrog } from "../../src/game/inducements/matchInducements";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { forceDice } from "../utils/test-helpers";

async function injure(
  opts: ConstructorParameters<typeof InjuryOperation>[1],
  frog = false
) {
  const game = turnGame({
    seed: 1,
    team1: [{ x: 10, y: 5 }],
    team2: [{ x: 11, y: 5 }],
    ballPosition: {
      x: 2,
      y: 2,
    },
  });
  const [victim] = game.ctx.teams[1].players;
  if (frog)
    turnIntoFrog(game.ctx.gameService.getState(), fixtureValue(victim));
  const reported: unknown[] = [];
  game.ctx.eventBus.on(GameEventNames.InjuryRolled, (data) => {
    reported.push(data);
  });
  const { flowManager } = game.ctx.gameService.getFlowContext();
  await flowManager.runToRest(
    new InjuryOperation(fixtureValue(victim).id, opts)
  );
  return { reported, victim };
}

describe("InjuryRolled", () => {
  it("reports a 12 as Dead", async () => {
    const { reported, victim } = await injure({ roll: 12 });
    expect(reported).toEqual([
      {
        playerId: fixtureValue(victim).id,
        result: "Dead",
        rollType: `Injury Roll (${fixtureValue(victim).playerName})`,
        diceTeamId: fixtureValue(victim).teamId,
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
    const game = turnGame({
      seed: 1,
      team1: [{ x: 10, y: 0 }],
      team2: [{ x: 11, y: 0 }],
      ballPosition: {
        x: 2,
        y: 2,
      },
    });
    const [victim] = game.ctx.teams[1].players;
    turnIntoFrog(game.ctx.gameService.getState(), fixtureValue(victim));
    const reported: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.InjuryRolled, (data) => {
      reported.push(data);
    });
    forceDice(game.ctx.rng, [6, 6]);
    const { flowManager } = game.ctx.gameService.getFlowContext();
    await flowManager.runToRest(
      new CrowdInjuryOperation(fixtureValue(victim).id, { x: 11, y: 0 }, { isTurnover: false })
    );

    expect(reported).toEqual([
      {
        playerId: fixtureValue(victim).id,
        result: "Badly Hurt",
        rollType: `Injury by the Crowd (${fixtureValue(victim).playerName})`,
        stunnedToReserves: true,
      },
    ]);
  });
});
