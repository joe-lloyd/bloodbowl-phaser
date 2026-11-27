import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { GamePhase } from "../../src/types/GameState";

const scrimmage = fixtureValue(
  SCENARIOS.find((s) => s.id === "basic-scrimmage")
);

const runPickups = (): boolean[] => {
  const game = createHeadlessGame({ scenario: scrimmage, seed: 999 });
  const results: boolean[] = [];
  for (let i = 0; i < 10; i++) {
    const player = game.teams[0].players[0];
    const ball = fixtureValue(game.gameService.getState().ballPosition);
    results.push(game.gameService.attemptPickup(fixtureValue(player), ball));

    game.gameService.setBallPosition(ball.x, ball.y);
  }
  return results;
};

describe("createHeadlessGame", () => {
  it("creates a game in Node without Phaser or DOM", () => {
    const game = createHeadlessGame({ seed: 1 });
    expect(game.gameService.getState()).toBeDefined();
    expect(game.teams[0].players.length).toBeGreaterThan(0);
    expect(game.teams[1].players.length).toBeGreaterThan(0);
  });

  it("initializes from a scenario definition", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 42 });
    const state = game.gameService.getState();
    expect(state.phase).toBe(scrimmage.setup.phase);
    expect(state.ballPosition).toEqual(scrimmage.setup.ballPosition);
    const placed = game.teams[0].players[0];
    expect(fixtureValue(placed).gridPosition).toEqual({
      x: fixtureValue(scrimmage.setup.team1Placements[0]).x,
      y: fixtureValue(scrimmage.setup.team1Placements[0]).y,
    });
  });

  it("supports a starting phase without a scenario", () => {
    const game = createHeadlessGame({
      seed: 3,
      startingPhase: GamePhase.SETUP,
    });
    expect(game.gameService.getState().phase).toBe(GamePhase.SETUP);
  });

  it("keeps two games in one process fully independent", () => {
    const a = createHeadlessGame({ scenario: scrimmage, seed: 7 });
    const b = createHeadlessGame({ scenario: scrimmage, seed: 7 });

    a.gameService.setBallPosition(0, 0);
    const playerA = a.teams[0].players[0];
    a.gameService.getState().score[a.teams[0].id] = 3;

    expect(b.gameService.getState().ballPosition).toEqual(
      scrimmage.setup.ballPosition
    );
    expect(b.gameService.getState().score[b.teams[0].id]).toBe(0);

    expect(playerA).not.toBe(b.teams[0].players[0]);
  });

  it("produces identical dice outcomes for identical seeds", () => {
    const a = createHeadlessGame({ scenario: scrimmage, seed: 12_345 });
    const b = createHeadlessGame({ scenario: scrimmage, seed: 12_345 });

    const rollsA = Array.from({ length: 50 }, () => a.rng.rollDie(6));
    const rollsB = Array.from({ length: 50 }, () => b.rng.rollDie(6));
    expect(rollsA).toEqual(rollsB);
  });

  it("produces identical engine results for identical seeds and commands", () => {
    expect(runPickups()).toEqual(runPickups());
  });

  it("uses the scenario seed when no explicit seed is given", () => {
    const withSeed = { ...scrimmage, seed: 555 };
    const game = createHeadlessGame({ scenario: withSeed });
    expect(game.seed).toBe(555);
  });
});
