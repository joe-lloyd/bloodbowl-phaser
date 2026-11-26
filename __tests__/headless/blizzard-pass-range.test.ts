import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { Weather } from "../../src/game/rules/weather";
import { PassController } from "../../src/game/controllers/PassController";
import { enumerateDecision } from "../../src/simulation/candidates";

function scenario(weather: Weather): Scenario {
  return {
    id: `blizzard-pass-${weather}`,
    name: "Pass in the snow",
    description: "a passer with team-mates at Short and Long range",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 4, y: 5 },
        { playerIndex: 1, x: 10, y: 5 },
        { playerIndex: 2, x: 13, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 12 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 4, y: 5 },
      weather,
    },
  };
}

async function passTo(weather: Weather, x: number) {
  const game = new HeadlessGame({ scenario: scenario(weather), seed: 5 });
  const passer = fixtureValue(game.ctx.team1.players[0]).id;
  await game.execute({
    type: "declare-action",
    playerId: passer,
    action: "pass",
  });
  const res = await game.execute({ type: "pass", playerId: passer, x, y: 5 });
  const dice = res.events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
  return { res, dice };
}

describe("passing in a Blizzard", () => {
  it("refuses a Long Pass and keeps the ball with the passer", async () => {
    const { res, dice } = await passTo("Blizzard", 13);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe(
      "command-failed: Blizzard: only a Quick or Short Pass may be attempted"
    );
    expect(dice).toEqual([]);
    expect(res.snapshot.ballPosition).toEqual({ x: 4, y: 5 });
  });

  it("still allows a Short Pass", async () => {
    const { res, dice } = await passTo("Blizzard", 10);

    expect(res.ok).toBe(true);
    expect(dice).toEqual([
      "Pass (Human Lineman #1): 5, needs 5+",
      "Catch (Human Lineman #2): 5, needs 3+",
    ]);
  });

  it("offers the computer no pass the Blizzard refuses", async () => {
    const game = new HeadlessGame({ scenario: scenario("Blizzard"), seed: 5 });
    const passer = fixtureValue(game.ctx.team1.players[0]).id;
    await game.execute({
      type: "declare-action",
      playerId: passer,
      action: "pass",
    });
    const { candidates } = await enumerateDecision(game, null);
    const ranges = candidates.flatMap((candidate) => {
      const [command] = candidate.commands;
      return command.type === "pass"
        ? PassController.rangeValue({ x: 4, y: 5 }, command)
        : [];
    });

    expect(ranges.length).toBeGreaterThan(0);
    expect(new Set(ranges)).toEqual(new Set([0, 1]));
  });

  it("allows a Long Pass in Perfect Conditions", async () => {
    const { res, dice } = await passTo("Nice", 13);

    expect(res.ok).toBe(true);
    expect(dice[0]).toBe("Pass (Human Lineman #1): 5, needs 6+");
  });
});
