import { expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { ArmourOperation } from "../../src/game/operations/ArmourOperation";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { GameEventNames, AllEvents } from "../../src/types/events";

it("keeps a failed dodge as the casualty cause through armour and injury", async () => {
  const game = new HeadlessGame({
    scenario: SCENARIOS.find((s) => s.id === "basic-scrimmage"),
    seed: 1,
  });
  const player = game.ctx.team1.players[0];
  player.skills = [];
  const events: AllEvents[GameEventNames.PlayerCasualtyInflicted][] = [];
  game.ctx.eventBus.on(GameEventNames.PlayerCasualtyInflicted, (data) =>
    events.push(data)
  );
  vi.spyOn(game.ctx.gameService.getDiceController(), "roll2D6").mockReturnValue(
    10
  );
  game.ctx.gameService.flowManager.add(
    new ArmourOperation(player.id, undefined, {
      cause: "dodge",
      vacatedSquare: { x: 9, y: 5 },
    }),
    true
  );
  for (let i = 0; i < 50 && !events.length; i++)
    await new Promise((resolve) => setImmediate(resolve));
  expect(events).toEqual([
    {
      victimId: player.id,
      causerId: undefined,
      cause: "dodge",
      sppEligible: false,
    },
  ]);
});

it("does not invent a crowd cause when an injury has no causer", async () => {
  const game = new HeadlessGame({ seed: 1 });
  const player = game.ctx.team1.players[0];
  const events: AllEvents[GameEventNames.PlayerCasualtyInflicted][] = [];
  game.ctx.eventBus.on(GameEventNames.PlayerCasualtyInflicted, (data) =>
    events.push(data)
  );
  game.ctx.gameService.flowManager.add(
    new InjuryOperation(player.id, { roll: 10 }),
    true
  );
  for (let i = 0; i < 50 && !events.length; i++)
    await new Promise((resolve) => setImmediate(resolve));
  expect(events[0]?.cause).toBe("special");
});
