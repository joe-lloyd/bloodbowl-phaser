import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";
import { forceDice } from "../utils/test-helpers";

/**
 * Round 2, 12:55: the turnover banner came before the fall's armour and
 * injury dice, which then played out under it and held up the hand-over.
 * The banner is raised once the fall is resolved, after its dice.
 */
const scenario: Scenario = {
  id: "turnover-after-fall-dice",
  name: "Turnover after the fall's dice",
  description: "an MA 1 lineman rushes, falls, and is stunned",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 3, y: 7, stats: { MA: 1 } }],
    team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 10 },
  },
};

it("raises the turnover banner after the armour and injury dice", async () => {
  const game = new HeadlessGame({ scenario, seed: 1 });
  const seen: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType }) =>
    seen.push(rollType)
  );
  game.ctx.eventBus.on(GameEventNames.UI_Turnover, ({ reason }) =>
    seen.push(`banner: ${reason}`)
  );
  game.ctx.eventBus.on(GameEventNames.UI_Announce, (moment) =>
    seen.push(`announce: ${moment.kind}`)
  );
  // The Rush fails on a 1; armour 6 + 6 breaks; injury 1 + 2 stuns.
  forceDice(game.ctx.rng, [1, 6, 6, 1, 2]);
  const mover = game.ctx.team1.players[0];
  await game.execute({ type: "declare-action", playerId: mover.id, action: "move" });
  let response: CommandResponse = await game.execute({
    type: "move",
    playerId: mover.id,
    path: [
      { x: 4, y: 7 },
      { x: 5, y: 7 },
    ],
  });
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
  }

  const banner = seen.indexOf("banner: Failed Rush");
  const injury = seen.findIndex((entry) => entry.startsWith("Injury Roll"));
  expect(injury).toBeGreaterThan(-1);
  expect(banner).toBeGreaterThan(injury);
  expect(seen.slice(banner)).toEqual([
    "banner: Failed Rush",
    "announce: turn-started",
  ]);
});
