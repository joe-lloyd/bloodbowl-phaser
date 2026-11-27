import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { AgilityTestOperation } from "../../src/game/operations/AgilityTestOperation";

it("rolls a catch for the catcher's team, not the active team", async () => {
  const game = new HeadlessGame({ seed: 1 });
  const service = game.ctx.gameService;
  service.getState().activeTeamId = game.ctx.teams[0].id;
  const catcher = game.ctx.teams[1].players[0];
  const teams: (string | undefined)[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ teamId }) => {
    teams.push(teamId);
  });

  await new AgilityTestOperation(
    fixtureValue(catcher).id,
    "Catch",
    3,
    0
  ).execute(service.getFlowContext());

  expect(teams).toEqual([game.ctx.teams[1].id]);
});
