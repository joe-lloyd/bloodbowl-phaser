import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";
import { forceDice } from "../utils/test-helpers";

/**
 * The step prompt calls it a Rush, so the turnover banner and the log do
 * too. "GFI" is an older name the coach never sees anywhere else.
 */
const scenario: Scenario = {
  id: "failed-rush-wording",
  name: "Failed Rush wording",
  description: "an MA 1 lineman rushes and falls",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 3, y: 7, stats: { MA: 1 } }],
    team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 10 },
  },
};

describe("a failed Rush", () => {
  it("is called a failed Rush in the turnover banner and the log", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const banners: string[] = [];
    const log: string[] = [];
    game.ctx.eventBus.on(GameEventNames.UI_Turnover, ({ reason }) =>
      banners.push(reason)
    );
    game.ctx.eventBus.on(GameEventNames.UI_LogEntry, (entry) => {
      if (entry.headline === "TURNOVER") log.push(entry.detail ?? "");
    });
    // The Rush fails on a 1; the Armour Roll is 1 + 1.
    forceDice(game.ctx.rng, [1, 1, 1]);
    const mover = game.ctx.team1.players[0];
    mover.playerName = "Human Lineman";
    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
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

    expect(banners).toEqual(["Failed Rush"]);
    expect(log).toEqual(["Human Lineman: Failed Rush"]);
  });
});
