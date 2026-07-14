import { describe, it, expect } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { GamePhase } from "../../src/types/GameState";

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

describe("createHeadlessGame", () => {
  it("creates a game in Node without Phaser or DOM", () => {
    const game = createHeadlessGame({ seed: 1 });
    expect(game.gameService.getState()).toBeDefined();
    expect(game.team1.players.length).toBeGreaterThan(0);
    expect(game.team2.players.length).toBeGreaterThan(0);
  });

  it("initializes from a scenario definition", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 42 });
    const state = game.gameService.getState();
    expect(state.phase).toBe(scrimmage.setup.phase);
    expect(state.ballPosition).toEqual(scrimmage.setup.ballPosition);
    const placed = game.team1.players[0];
    expect(placed.gridPosition).toEqual({
      x: scrimmage.setup.team1Placements[0].x,
      y: scrimmage.setup.team1Placements[0].y,
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

    // Mutate game A only
    a.gameService.setBallPosition(0, 0);
    const playerA = a.team1.players[0];
    a.gameService.getState().score[a.team1.id] = 3;

    expect(b.gameService.getState().ballPosition).toEqual(
      scrimmage.setup.ballPosition
    );
    expect(b.gameService.getState().score[b.team1.id]).toBe(0);
    // Teams are distinct objects (factory-generated per game)
    expect(playerA).not.toBe(b.team1.players[0]);
  });

  it("produces identical dice outcomes for identical seeds", () => {
    const a = createHeadlessGame({ scenario: scrimmage, seed: 12345 });
    const b = createHeadlessGame({ scenario: scrimmage, seed: 12345 });

    const rollsA = Array.from({ length: 50 }, () => a.rng.rollDie(6));
    const rollsB = Array.from({ length: 50 }, () => b.rng.rollDie(6));
    expect(rollsA).toEqual(rollsB);
  });

  it("produces identical engine results for identical seeds and commands", () => {
    const runPickups = (seed: number): boolean[] => {
      const game = createHeadlessGame({ scenario: scrimmage, seed });
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const player = game.team1.players[0];
        const ball = game.gameService.getState().ballPosition!;
        results.push(game.gameService.attemptPickup(player, ball));
        // Reset ball so each attempt is comparable
        game.gameService.setBallPosition(ball.x, ball.y);
      }
      return results;
    };

    expect(runPickups(999)).toEqual(runPickups(999));
  });

  it("uses the scenario seed when no explicit seed is given", () => {
    const withSeed = { ...scrimmage, seed: 555 };
    const game = createHeadlessGame({ scenario: withSeed });
    expect(game.seed).toBe(555);
  });
});
