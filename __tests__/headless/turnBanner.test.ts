import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { possessive } from "../../src/game/managers/TurnManager";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";

const scenario: Scenario = {
  id: "turn-banner",
  name: "Turn banner",
  description: "One player each, mid-drive",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 8, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 14, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 8, y: 5 },
  },
};

describe("turn change banner", () => {
  it("announces the next turn once", async () => {
    const game = new HeadlessGame({ scenario, seed: 3 });
    const response = await game.execute({ type: "end-turn" });
    const banners = response.events
      .filter((event) => event.name === GameEventNames.UI_Announce)
      .map((event) => event.data);
    expect(banners).toEqual([
      {
        kind: "turn-started",
        headline: `${possessive(game.ctx.team2.name)} Turn`,
        subtitle: expect.stringMatching(/^Turn \d$/),
      },
    ]);
  });

  it("writes a possessive that reads right after a plural name", () => {
    expect(possessive("Orc Founders")).toBe("Orc Founders'");
    expect(possessive("Reikland Reavers")).toBe("Reikland Reavers'");
    expect(possessive("Away Team")).toBe("Away Team's");
  });
});
