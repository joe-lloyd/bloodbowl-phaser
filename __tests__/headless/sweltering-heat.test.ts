import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { Weather } from "../../src/game/rules/weather";

function scenario(weather: Weather): Scenario {
  return {
    id: `sweltering-heat-${weather}`,
    name: "Touchdown in the heat",
    description: "a carrier walks into the end zone on a hot day",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 17, y: 5 },
        { playerIndex: 1, x: 15, y: 3 },
        { playerIndex: 2, x: 12, y: 3 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 13, y: 9 },
        { playerIndex: 1, x: 10, y: 9 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 17, y: 5 },
      weather,
    },
  };
}

async function scoreTouchdown(weather: Weather) {
  const game = new HeadlessGame({ scenario: scenario(weather), seed: 7 });
  const carrier = fixtureValue(game.ctx.teams[0].players[0]).id;
  await game.execute({
    type: "declare-action",
    playerId: carrier,
    action: "move",
  });
  const res = await game.execute({
    type: "move",
    playerId: carrier,
    path: [
      { x: 18, y: 5 },
      { x: 19, y: 5 },
    ],
  });
  const dice = res.events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
  return { game, res, dice };
}

function benched(game: HeadlessGame): string[][] {
  const modifiers = game.snapshot().driveEffects?.playerModifiers ?? {};
  return game
    .snapshot()
    .teams.map((team) =>
      team.players
        .filter((p) => modifiers[p.id]?.confinedToReserves)
        .map((p) => p.name)
    );
}

describe("Sweltering Heat", () => {
  it("benches D3 players per team who were on the pitch for the next drive", async () => {
    const { game, res, dice } = await scoreTouchdown("Sweltering Heat");

    expect(res.snapshot.phase).toBe(GamePhase.SETUP);
    expect(dice).toEqual([
      "Sweltering Heat: 1",
      "Sweltering Heat — Home Team: 1",
      "Sweltering Heat — Away Team: 16",
    ]);
    expect(benched(game)).toEqual([["Human Lineman #1"], ["Human Lineman #2"]]);
    const setup = fixtureValue(res.snapshot.setup);
    expect(
      Object.values(setup.teams).map((t) => t.availablePlayerCount)
    ).toEqual([6, 6]);

    const kicking = fixtureValue(res.snapshot.activeTeamId);
    const kickingIndex = res.snapshot.teams.findIndex((t) => t.id === kicking);
    const faintedName = fixtureValue(benched(game)[kickingIndex])[0];
    const fainted = fixtureValue(
      fixtureValue(res.snapshot.teams[kickingIndex]).players.find(
        (p) => p.name === faintedName
      )
    );
    const placed = await game.execute({
      type: "place-player",
      playerId: fainted.id,
      x: kickingIndex === 0 ? 6 : 13,
      y: 5,
    });
    expect(placed.reason).toBe(
      "command-failed: That player is not available for this drive."
    );
  });

  it("benches nobody in Perfect Conditions", async () => {
    const { game } = await scoreTouchdown("Nice");

    expect(benched(game)).toEqual([[], []]);
  });
});
