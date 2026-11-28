import { fixtureValue } from "../../src/testing/fixtureValue";
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
  DEATHBOWL_SAVE_STORAGE_KEY,
  LocalStorageMatchSaveRepository,
  MATCH_SAVE_FALLBACK_KEY,
} from "../../src/game/persistence/MatchSaveRepository";
import { createDiceLog } from "../../src/game/persistence/DiceLog";
import {
  listDiceLogs,
  writeDiceLog,
} from "../../src/game/persistence/diceLogStore";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failFullWrite = false;

  limit = Infinity;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failFullWrite && !key.includes("fallback")) {
      throw new DOMException("quota", "QuotaExceededError");
    }
    const others = [...this.values]
      .filter(([k]) => k !== key)
      .reduce((size, [, v]) => size + v.length, 0);
    if (others + value.length > this.limit) {
      throw new DOMException("quota", "QuotaExceededError");
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const scrimmage = fixtureValue(SCENARIOS.find(
  (scenario) => scenario.id === "basic-scrimmage"
));

function matchSave(savedAt: number) {
  const game = createHeadlessGame({ scenario: scrimmage, seed: 5 });
  return createMatchSave({
    state: game.gameService.getState(),
    teams: [game.teams[0], game.teams[1]],
    drive: {
      kickingTeamId: game.teams[0].id,
      receivingTeamId: game.teams[1].id,
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

  it("keeps the Sevens save and its fallback when the Deathbowl slot saves, falls back and clears", () => {
    const storage = new MemoryStorage();
    const sevens = new LocalStorageMatchSaveRepository(storage);
    const deathbowl = new LocalStorageMatchSaveRepository(storage, DEATHBOWL_SAVE_STORAGE_KEY);
    sevens.write(matchSave(10));
    storage.setItem(MATCH_SAVE_FALLBACK_KEY, "sevens fallback");
    deathbowl.write(matchSave(20));
    storage.failFullWrite = true;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    deathbowl.write(matchSave(30));
    warning.mockRestore();
    storage.failFullWrite = false;
    expect(storage.getItem(`${DEATHBOWL_SAVE_STORAGE_KEY}_snapshot_fallback`)).toContain('"savedAt":30');
    deathbowl.clear();
    expect(deathbowl.read()).toBeNull();
    expect(sevens.read()?.savedAt).toBe(10);
    expect(storage.getItem(MATCH_SAVE_FALLBACK_KEY)).toBe("sevens fallback");
  });

  it("drops old dice logs before giving up the resumable save", () => {
    const storage = new MemoryStorage();
    for (const id of ["old", "older"]) {
      const paddedLog = {
        ...createDiceLog({ id, mode: "computer", seed: 1, teams: [] }),
        padding: "x".repeat(2000),
      };
      writeDiceLog(paddedLog, storage);
    }
    const save = matchSave(10);
    const used = [...storage.values.values()].reduce((n, v) => n + v.length, 0);

    storage.limit = used + JSON.stringify(save).length - 1000;
    const repository = new LocalStorageMatchSaveRepository(storage);

    repository.write(save);

    expect(repository.read()?.savedAt).toBe(10);
    expect(storage.getItem(MATCH_SAVE_FALLBACK_KEY)).toBeNull();
    expect(listDiceLogs(storage).length).toBeLessThan(2);
  });

  it("round-trips the match termination reason through a save/resume cycle", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 6 });
    const state = game.gameService.getState();
    state.result = { reason: "concession", concedingTeamId: game.teams[0].id };
    state.score[game.teams[0].id] = 0;
    state.score[game.teams[1].id] = 0;

    const storage = new MemoryStorage();
    const repository = new LocalStorageMatchSaveRepository(storage);
    const save = createMatchSave({
      state,
      teams: [game.teams[0], game.teams[1]],
      drive: {
        kickingTeamId: game.teams[0].id,
        receivingTeamId: game.teams[1].id,
      },
      rng: game.rng.captureState(),
      matchStats: game.matchStats.captureState(),
      savedAt: 30,
    });
    repository.write(save);

    const resumed = fixtureValue(repository.read());
    expect(resumed.snapshot.result).toEqual({
      reason: "concession",
      concedingTeamId: game.teams[0].id,
    });

    const restoredState = deserializeGameState(resumed.snapshot);
    expect(restoredState.result).toEqual({
      reason: "concession",
      concedingTeamId: game.teams[0].id,
    });
  });

  it("serializeGameState/deserializeGameState round-trip an undefined result unchanged", () => {
    const game = createHeadlessGame({ scenario: scrimmage, seed: 7 });
    const snapshot = serializeGameState(game.gameService.getState(), [
      game.teams[0],
      game.teams[1],
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
