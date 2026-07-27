import { describe, expect, it, vi } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import {
  createMatchSave,
  deserializeGameState,
  serializeGameState,
} from "../../src/headless/serialization";
import { SCENARIOS } from "../../src/data/scenarios";
import {
  chooseNewestMatchSave,
  LocalStorageMatchSaveRepository,
  MATCH_SAVE_FALLBACK_KEY,
} from "../../src/game/persistence/MatchSaveRepository";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failFullWrite = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failFullWrite && !key.includes("fallback")) {
      throw new DOMException("quota", "QuotaExceededError");
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const scrimmage = SCENARIOS.find(
  (scenario) => scenario.id === "basic-scrimmage"
)!;

function matchSave(savedAt: number) {
  const game = createHeadlessGame({ scenario: scrimmage, seed: 5 });
  return createMatchSave({
    state: game.gameService.getState(),
    teams: [game.team1, game.team2],
    drive: {
      kickingTeamId: game.team1.id,
      receivingTeamId: game.team2.id,
    },
    rng: game.rng.captureState(),
    matchStats: game.matchStats.captureState(),
    savedAt,
  });
}

describe("match save repository", () => {
  it("reads, writes, describes and clears a save", () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageMatchSaveRepository(storage);
    const save = matchSave(10);
    repository.write(save);
    expect(repository.read()).toEqual(save);
    expect(repository.describe()).toMatchObject({
      savedAt: 10,
      homeTeamName: save.teams[0].name,
      awayTeamName: save.teams[1].name,
      half: 1,
    });
    repository.clear();
    expect(repository.read()).toBeNull();
  });

  it("discards corrupt and version-mismatched saves without throwing", () => {
    const storage = new MemoryStorage();
    storage.setItem("bloodbowl_local_match_save", "{bad json");
    const repository = new LocalStorageMatchSaveRepository(storage);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(repository.read()).toBeNull();
    expect(repository.read()).toBeNull();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();

    storage.setItem(
      "bloodbowl_local_match_save",
      JSON.stringify({ ...matchSave(10), version: 999 })
    );
    expect(repository.read()).toBeNull();
  });

  it("falls back to one snapshot-only record on quota failure", () => {
    const storage = new MemoryStorage();
    storage.failFullWrite = true;
    const repository = new LocalStorageMatchSaveRepository(storage);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    repository.write(matchSave(10));
    expect(storage.getItem(MATCH_SAVE_FALLBACK_KEY)).toContain(
      '"kind":"snapshot-only"'
    );
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it("round-trips the match termination reason through a save/resume cycle", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 6 });
    const state = game.gameService.getState();
    state.result = { reason: "concession", concedingTeamId: game.team1.id };
    state.score[game.team1.id] = 0;
    state.score[game.team2.id] = 0;

    const storage = new MemoryStorage();
    const repository = new LocalStorageMatchSaveRepository(storage);
    const save = createMatchSave({
      state,
      teams: [game.team1, game.team2],
      drive: {
        kickingTeamId: game.team1.id,
        receivingTeamId: game.team2.id,
      },
      rng: game.rng.captureState(),
      matchStats: game.matchStats.captureState(),
      savedAt: 30,
    });
    repository.write(save);

    const resumed = repository.read()!;
    expect(resumed.snapshot.result).toEqual({
      reason: "concession",
      concedingTeamId: game.team1.id,
    });

    // The restored GameState carries the same fact, not just the snapshot —
    // a reconnect/resume must never re-derive "completed" from a bare score.
    const restoredState = deserializeGameState(resumed.snapshot);
    expect(restoredState.result).toEqual({
      reason: "concession",
      concedingTeamId: game.team1.id,
    });
  });

  it("serializeGameState/deserializeGameState round-trip an undefined result unchanged", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 7 });
    const snapshot = serializeGameState(game.gameService.getState(), [
      game.team1,
      game.team2,
    ]);
    expect(snapshot.result).toBeUndefined();
    expect(deserializeGameState(snapshot).result).toBeUndefined();
  });

  it("selects the newest local/cloud save and retains the loser as conflict", () => {
    const local = matchSave(20);
    const cloud = matchSave(10);
    expect(chooseNewestMatchSave(local, cloud)).toEqual({
      winner: local,
      conflict: cloud,
    });
    expect(chooseNewestMatchSave(null, cloud)).toEqual({
      winner: cloud,
      conflict: null,
    });
  });
});
