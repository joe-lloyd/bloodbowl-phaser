import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { foulAddingAllAssists } from "../utils/test-helpers";

const descriptions = (events: { name: string; data?: unknown }[]) =>
  events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );

describe("dice log targets", () => {
  it("logs a Rush in a blizzard with the 3+ its prompt showed", async () => {
    const scenario: Scenario = {
      id: "blizzard-rush",
      name: "Blizzard rush",
      description: "",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
        team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
    };
    const game = new HeadlessGame({ scenario, seed: 3 });
    game.ctx.gameService.getState().weather = "Blizzard";
    const runner = game.ctx.teams[0].players[0];
    const ma = fixtureValue(runner).stats.MA;
    const path = Array.from({ length: ma + 1 }, (_, i) => ({
      x: 6 + i,
      y: 5,
    }));

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(runner).id,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: fixtureValue(runner).id,
      path,
    });
    const rush = descriptions(response.events).find((d) =>
      d.startsWith("Rush")
    );
    expect(rush).toMatch(/^Rush \(Human Lineman #1\): \d, needs 3\+$/);
  });

  it("logs a foul's armour roll against the AV on the player's card", async () => {
    const scenario: Scenario = {
      id: "foul-av",
      name: "Foul AV",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 9, y: 5 },
          { playerIndex: 1, x: 11, y: 5 },
        ],
        team2Placements: [
          { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
    };
    const game = new HeadlessGame({ scenario, seed: 2 });
    const fouler = game.ctx.teams[0].players[0];
    const victim = game.ctx.teams[1].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(fouler).id,
      action: "foul",
    });
    const response = await foulAddingAllAssists(game, {
      type: "foul",
      playerId: fixtureValue(fouler).id,
      x: 10,
      y: 5,
    });
    const armour = descriptions(response.events).find((d) =>
      d.includes("Armour")
    );

    expect(armour).toMatch(
      new RegExp(
        String.raw`: \d \+ \d \+1 = \d+ \(AV ${String(fixtureValue(victim).stats.AV)}\+\)$`
      )
    );
  });
});
