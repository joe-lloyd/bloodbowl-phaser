import { parseJson } from "../../src/boundary/json";
import { gameSnapshotSchema } from "../../src/boundary/schemas/GameSnapshot";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import {
  serializeGameState,
  deserializeGameState,
  applySnapshotToTeams,
} from "../../src/headless/serialization";
import { SCENARIOS } from "../../src/data/scenarios";

const scrimmage = fixtureValue(
  SCENARIOS.find((s) => s.id === "basic-scrimmage")
);

const play = (restoreViaSnapshot: boolean): boolean[] => {
  const original = createHeadlessGame({ scenario: scrimmage, seed: 77 });

  let game = original;
  if (restoreViaSnapshot) {
    const snapshot = parseJson(
      JSON.stringify(
        serializeGameState(original.gameService.getState(), [
          original.team1,
          original.team2,
        ])
      ),
      gameSnapshotSchema
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
    const ball = fixtureValue(game.gameService.getState().ballPosition);
    results.push(
      game.gameService.attemptPickup(fixtureValue(player), ball)
    );
    game.gameService.setBallPosition(ball.x, ball.y);
  }
  return results;
};

describe("game state serialization", () => {
  it("survives a JSON round-trip with no Set/Map artifacts", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 11 });
    const state = game.gameService.getState();

    state.turn.activatedPlayerIds.add(fixtureValue(game.team1.players[0]).id);
    state.turn.activatedPlayerIds.add(fixtureValue(game.team1.players[1]).id);
    state.turn.movementUsed.set(fixtureValue(game.team1.players[0]).id, 3);

    const snapshot = serializeGameState(state, [game.team1, game.team2]);
    const roundTripped = parseJson(
      JSON.stringify(snapshot),
      gameSnapshotSchema
    );

    expect(roundTripped).toEqual(snapshot);

    expect(roundTripped.turn.activatedPlayerIds).toHaveLength(2);
    expect(
      roundTripped.turn.movementUsed[fixtureValue(game.team1.players[0]).id]
    ).toBe(3);
  });

  it("fully represents turn data", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 12 });
    const state = game.gameService.getState();
    const [p1, p2] = game.team1.players;

    state.turn.activatedPlayerIds.add(fixtureValue(p1).id);
    state.turn.activatedPlayerIds.add(fixtureValue(p2).id);
    state.turn.movementUsed.set(fixtureValue(p1).id, 3);
    state.turn.hasBlitzed = true;

    const snapshot = serializeGameState(state, [game.team1, game.team2]);

    expect(snapshot.turn.activatedPlayerIds).toContain(fixtureValue(p1).id);
    expect(snapshot.turn.activatedPlayerIds).toContain(fixtureValue(p2).id);
    expect(snapshot.turn.movementUsed[fixtureValue(p1).id]).toBe(3);
    expect(snapshot.turn.hasBlitzed).toBe(true);

    const p1Snap = fixtureValue(
      fixtureValue(
        snapshot.teams.find((t) => t.id === game.team1.id)
      ).players.find((p) => p.id === fixtureValue(p1).id)
    );
    expect(p1Snap.movementUsed).toBe(3);
    expect(p1Snap.position).toEqual(fixtureValue(p1).gridPosition);
  });

  it("deserializes back to an equivalent in-memory state", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 13 });
    const state = game.gameService.getState();
    state.turn.activatedPlayerIds.add(fixtureValue(game.team1.players[0]).id);
    state.turn.movementUsed.set(fixtureValue(game.team1.players[0]).id, 5);

    const snapshot = serializeGameState(state, [game.team1, game.team2]);
    const restored = deserializeGameState(
      parseJson(JSON.stringify(snapshot), gameSnapshotSchema)
    );

    expect(restored.phase).toBe(state.phase);
    expect(restored.turn.activatedPlayerIds).toBeInstanceOf(Set);
    expect(restored.turn.movementUsed).toBeInstanceOf(Map);
    expect(
      restored.turn.activatedPlayerIds.has(
        fixtureValue(game.team1.players[0]).id
      )
    ).toBe(true);
    expect(
      restored.turn.movementUsed.get(fixtureValue(game.team1.players[0]).id)
    ).toBe(5);
    expect(restored.ballPosition).toEqual(state.ballPosition);
  });

  it("restores a mid-turn game that continues playing identically", () => {

    expect(play(true)).toEqual(play(false));
  });

  it("exposes stable documented field names", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 14 });
    const snapshot = serializeGameState(game.gameService.getState(), [
      game.team1,
      game.team2,
    ]);

    expect(snapshot.ballPosition).toEqual({ x: 5, y: 5 });
    const player = fixtureValue(snapshot.teams[0]).players[0];
    expect(typeof fixtureValue(player).status).toBe("string");
    expect(fixtureValue(player).stats).toHaveProperty("MA");
    expect(fixtureValue(player).stats).toHaveProperty("ST");
    expect(fixtureValue(player).stats).toHaveProperty("AV");
  });
});
