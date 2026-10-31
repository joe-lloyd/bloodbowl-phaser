import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { AgilityTestOperation } from "../../src/game/operations/AgilityTestOperation";

/**
 * Round 2, 14:07: the tray named Altdorf, the team whose turn it was, for a
 * Reikland player's catch. Without a team on the roll the tray falls back
 * to the active team. A catch, like every agility test, is rolled by the
 * player's own team.
 */
it("rolls a catch for the catcher's team, not the active team", async () => {
  const game = new HeadlessGame({ seed: 1 });
  const service = game.ctx.gameService;
  service.getState().activeTeamId = game.ctx.team1.id;
  const catcher = game.ctx.team2.players[0];
  const teams: (string | undefined)[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ teamId }) =>
    teams.push(teamId)
  );

  await new AgilityTestOperation(catcher.id, "Catch", 3, 0).execute(
    service.getFlowContext()
  );

  expect(teams).toEqual([game.ctx.team2.id]);
});
