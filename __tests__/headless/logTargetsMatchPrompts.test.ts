/**
 * The dice log names the same number the coach was shown. In round 1 the
 * prompt said Rush 3+ while the log said "Target: 2+", and a foul's log
 * said "(AV: 8)" for a player whose card says AV 9+.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

const descriptions = (events: { name: string; data: unknown }[]) =>
  events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);

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
    const runner = game.ctx.team1.players[0];
    const ma = runner.stats.MA;
    const path = Array.from({ length: ma + 1 }, (_, i) => ({
      x: 6 + i,
      y: 5,
    }));
    // A Rush needs 2+, and a blizzard takes 1 off: the prompt says 3+
    await game.execute({
      type: "declare-action",
      playerId: runner.id,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: runner.id,
      path,
    });
    const rush = descriptions(response.events).find((d) =>
      d.startsWith("Rush")
    );
    expect(rush).toMatch(/^Rush \(.+\): \d, needs 3\+$/);
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
    const fouler = game.ctx.team1.players[0];
    const victim = game.ctx.team2.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fouler.id,
      action: "foul",
    });
    const response = await game.execute({
      type: "foul",
      playerId: fouler.id,
      x: 10,
      y: 5,
    });
    const armour = descriptions(response.events).find((d) =>
      d.includes("Armour")
    );
    // One offensive assist: +1 on the roll, against the card's AV
    expect(armour).toMatch(
      new RegExp(`: \\d\\+\\d \\+1 = \\d+ \\(AV ${victim.stats.AV}\\+\\)$`)
    );
  });
});
