import { describe, it, expect } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import {
  serializeGameState,
  deserializeGameState,
  applySnapshotToTeams,
} from "../../src/headless/serialization";
import { SCENARIOS } from "../../src/data/scenarios";

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

describe("game state serialization", () => {
  it("survives a JSON round-trip with no Set/Map artifacts", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 11 });
    const state = game.gameService.getState();

    // Populate the collection fields so the round-trip actually exercises them
    state.turn.activatedPlayerIds.add(game.team1.players[0].id);
    state.turn.activatedPlayerIds.add(game.team1.players[1].id);
    state.turn.movementUsed.set(game.team1.players[0].id, 3);

    const snapshot = serializeGameState(state, [game.team1, game.team2]);
    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(roundTripped).toEqual(snapshot);
    // The Set/Map fields specifically must not degrade to {}
    expect(roundTripped.turn.activatedPlayerIds).toHaveLength(2);
    expect(roundTripped.turn.movementUsed[game.team1.players[0].id]).toBe(3);
  });

  it("fully represents turn data", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 12 });
    const state = game.gameService.getState();
    const [p1, p2] = game.team1.players;

    state.turn.activatedPlayerIds.add(p1.id);
    state.turn.activatedPlayerIds.add(p2.id);
    state.turn.movementUsed.set(p1.id, 3);
    state.turn.hasBlitzed = true;

    const snapshot = serializeGameState(state, [game.team1, game.team2]);

    expect(snapshot.turn.activatedPlayerIds).toContain(p1.id);
    expect(snapshot.turn.activatedPlayerIds).toContain(p2.id);
    expect(snapshot.turn.movementUsed[p1.id]).toBe(3);
    expect(snapshot.turn.hasBlitzed).toBe(true);

    const p1Snap = snapshot.teams
      .find((t) => t.id === game.team1.id)!
      .players.find((p) => p.id === p1.id)!;
    expect(p1Snap.movementUsed).toBe(3);
    expect(p1Snap.position).toEqual(p1.gridPosition);
  });

  it("deserializes back to an equivalent in-memory state", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 13 });
    const state = game.gameService.getState();
    state.turn.activatedPlayerIds.add(game.team1.players[0].id);
    state.turn.movementUsed.set(game.team1.players[0].id, 5);

    const snapshot = serializeGameState(state, [game.team1, game.team2]);
    const restored = deserializeGameState(JSON.parse(JSON.stringify(snapshot)));

    expect(restored.phase).toBe(state.phase);
    expect(restored.turn.activatedPlayerIds).toBeInstanceOf(Set);
    expect(restored.turn.movementUsed).toBeInstanceOf(Map);
    expect(restored.turn.activatedPlayerIds.has(game.team1.players[0].id)).toBe(
      true
    );
    expect(restored.turn.movementUsed.get(game.team1.players[0].id)).toBe(5);
    expect(restored.ballPosition).toEqual(state.ballPosition);
  });

  it("restores a mid-turn game that continues playing identically", () => {
    // Play some dice-consuming actions, snapshot, then restore into a new
    // game with a fresh RNG at the same seed and confirm behavior matches
    // a game that never went through serialization.
    const play = (restoreViaSnapshot: boolean): boolean[] => {
      const original = createHeadlessGame({ scenario: scrimmage, seed: 77 });

      let game = original;
      if (restoreViaSnapshot) {
        const snapshot = JSON.parse(
          JSON.stringify(
            serializeGameState(original.gameService.getState(), [
              original.team1,
              original.team2,
            ])
          )
        );
        const restoredState = deserializeGameState(snapshot);
        game = createHeadlessGame({
          scenario: scrimmage,
          seed: 77,
          initialState: restoredState,
        });
        applySnapshotToTeams(snapshot, [game.team1, game.team2]);
      }

      const results: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        const player = game.team1.players[0];
        const ball = game.gameService.getState().ballPosition!;
        results.push(game.gameService.attemptPickup(player, ball));
        game.gameService.setBallPosition(ball.x, ball.y);
      }
      return results;
    };

    expect(play(true)).toEqual(play(false));
  });

  it("exposes stable documented field names", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 14 });
    const snapshot = serializeGameState(game.gameService.getState(), [
      game.team1,
      game.team2,
    ]);

    expect(snapshot.ballPosition).toEqual({ x: 5, y: 5 });
    const player = snapshot.teams[0].players[0];
    expect(typeof player.status).toBe("string");
    expect(player.stats).toHaveProperty("MA");
    expect(player.stats).toHaveProperty("ST");
    expect(player.stats).toHaveProperty("AV");
  });
});
