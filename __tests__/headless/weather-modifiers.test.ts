import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { Weather } from "../../src/game/rules/weather";
import type { EmittedEvent } from "../../src/headless/protocol";

/**
 * The Weather Table (2025 rulebook) changes the dice: Very Sunny is -1 to
 * Passing Ability Tests, Pouring Rain -1 to pick-ups, catches and
 * interceptions, Blizzard -1 to Rush. The weather was rolled and shown but
 * no roll read it. Seeds are committed, never searched.
 */
function scenario(weather: Weather, setup: Partial<Scenario["setup"]>): Scenario {
  return {
    id: `weather-${weather}`,
    name: `Weather: ${weather}`,
    description: "a roll under the current weather",
    setup: {
      team1Placements: [],
      team2Placements: [],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      weather,
      ...setup,
    },
  };
}

function diceOf(events: EmittedEvent[]): string[] {
  return events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
}

/**
 * A passer at (4,5) throws a Short Pass to a catcher at (10,5), with or
 * without a defender standing on the ruler at (7,5).
 */
function passScenario(weather: Weather, interceptor: boolean): Scenario {
  return scenario(weather, {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 10, y: 5 },
    ],
    team2Placements: [{ playerIndex: 0, x: 7, y: interceptor ? 5 : 12 }],
    ballPosition: { x: 4, y: 5 },
  });
}

async function pass(weather: Weather, interceptor: boolean, seed: number) {
  const game = new HeadlessGame({
    scenario: passScenario(weather, interceptor),
    seed,
  });
  const passer = game.ctx.team1.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: passer,
    action: "pass",
  });
  const res = await game.execute({
    type: "pass",
    playerId: passer,
    x: 10,
    y: 5,
  });
  const events = [...res.events];
  if (res.pendingDecision?.type === "interception") {
    const reply = await game.execute({
      type: "choose-interception",
      playerId: game.ctx.team2.players[0].id,
    });
    events.push(...reply.events);
  }
  return diceOf(events);
}

async function walkOntoBall(weather: Weather, seed: number) {
  const game = new HeadlessGame({
    scenario: scenario(weather, {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5 },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
      ballPosition: { x: 6, y: 5 },
    }),
    seed,
  });
  const mover = game.ctx.team1.players[0].id;
  await game.execute({ type: "declare-action", playerId: mover, action: "move" });
  const res = await game.execute({
    type: "move",
    playerId: mover,
    path: [{ x: 6, y: 5 }],
  });
  return diceOf(res.events);
}

async function rushOneSquare(weather: Weather, seed: number) {
  const game = new HeadlessGame({
    scenario: scenario(weather, {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, stats: { MA: 1 } },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
      ballPosition: { x: 1, y: 1 },
    }),
    seed,
  });
  const mover = game.ctx.team1.players[0].id;
  await game.execute({ type: "declare-action", playerId: mover, action: "move" });
  const res = await game.execute({
    type: "move",
    playerId: mover,
    path: [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ],
  });
  return diceOf(res.events);
}

describe("weather modifiers", () => {
  it("Very Sunny puts -1 on the Passing Ability Test", async () => {
    expect(await pass("Very Sunny", false, 4)).toEqual([
      "Pass (Human Lineman #1): 6 -2 = 4 (Target: 4+)",
      "Catch (Human Lineman #2): 2 +0 = 2 (Target: 3+)",
      "Bounce Direction: 2",
    ]);
  });

  it("Pouring Rain puts -1 on the catch", async () => {
    expect(await pass("Pouring Rain", false, 5)).toEqual([
      "Pass (Human Lineman #1): 5 -1 = 4 (Target: 4+)",
      "Catch (Human Lineman #2): 5 -1 = 4 (Target: 3+)",
    ]);
  });

  it("Pouring Rain puts -1 on the interception", async () => {
    expect(await pass("Pouring Rain", true, 1)).toEqual([
      "Pass (Human Lineman #1): 4 -1 = 3 (Target: 4+)",
      "Scatter: 1, 5, 8",
      "Interception (Human Lineman #1): 6 -3 = 3 (Target: 3+)",
    ]);
  });

  it("Pouring Rain puts -1 on the pick-up", async () => {
    expect(await walkOntoBall("Pouring Rain", 1)).toEqual([
      "Pickup (Human Lineman #1): 4 -1 = 3 (Target: 3+)",
    ]);
  });

  it("Blizzard puts -1 on the Rush", async () => {
    expect(await rushOneSquare("Blizzard", 1)).toEqual([
      "Rush (GFI) (Human Lineman #1): 4 -1 = 3 (Target: 2+)",
    ]);
  });

  it("Perfect Conditions leaves the rolls alone", async () => {
    expect(await pass("Nice", false, 5)).toEqual([
      "Pass (Human Lineman #1): 5 -1 = 4 (Target: 4+)",
      "Catch (Human Lineman #2): 5 +0 = 5 (Target: 3+)",
    ]);
    expect(await pass("Nice", true, 1)).toEqual([
      "Pass (Human Lineman #1): 4 -1 = 3 (Target: 4+)",
      "Scatter: 1, 5, 8",
      "Interception (Human Lineman #1): 6 -2 = 4 (Target: 3+)",
    ]);
    expect(await walkOntoBall("Nice", 1)).toEqual([
      "Pickup (Human Lineman #1): 4 +0 = 4 (Target: 3+)",
    ]);
    expect(await rushOneSquare("Nice", 1)).toEqual([
      "Rush (GFI) (Human Lineman #1): 4 +0 = 4 (Target: 2+)",
    ]);
  });
});
