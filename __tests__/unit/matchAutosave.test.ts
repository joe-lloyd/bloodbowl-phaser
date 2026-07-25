import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { MatchAutosave } from "../../src/game/persistence/MatchAutosave";
import {
  MatchSaveDescription,
  MatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { MatchSave } from "../../src/headless/serialization";
import { IGameService } from "../../src/services/interfaces/IGameService";

class MemoryRepository implements MatchSaveRepository {
  writes: MatchSave[] = [];
  read(): MatchSave | null {
    return this.writes.at(-1) ?? null;
  }
  write(save: MatchSave): void {
    this.writes.push(save);
  }
  clear(): void {
    this.writes = [];
  }
  describe(): MatchSaveDescription | null {
    return null;
  }
}

describe("MatchAutosave", () => {
  it("waits for an idle operation boundary before writing", async () => {
    let release!: () => void;
    const idle = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gameService = {
      getFlowContext: () => ({
        flowManager: { whenIdle: () => idle },
      }),
      getDecisionService: () => ({ pending: () => null }),
    } as unknown as IGameService;
    const repository = new MemoryRepository();
    const autosave = new MatchAutosave(
      new EventBus(),
      gameService,
      () => ({ version: 1 }) as MatchSave,
      { repository }
    );

    const flushing = autosave.flushNow();
    await Promise.resolve();
    expect(repository.writes).toHaveLength(0);
    release();
    expect(await flushing).toBe(true);
    expect(repository.writes).toHaveLength(1);
    autosave.dispose();
  });

  it("does not write while a decision is pending", async () => {
    const gameService = {
      getFlowContext: () => ({
        flowManager: { whenIdle: () => Promise.resolve() },
      }),
      getDecisionService: () => ({ pending: () => ({ type: "reroll" }) }),
    } as unknown as IGameService;
    const repository = new MemoryRepository();
    const autosave = new MatchAutosave(
      new EventBus(),
      gameService,
      () => ({ version: 1 }) as MatchSave,
      { repository, debounceMs: 10_000 }
    );
    expect(await autosave.flushNow()).toBe(false);
    expect(repository.writes).toHaveLength(0);
    autosave.dispose();
  });

  it("stays entirely disabled for online matches", async () => {
    const gameService = {
      getFlowContext: () => ({
        flowManager: { whenIdle: () => Promise.resolve() },
      }),
      getDecisionService: () => ({ pending: () => null }),
    } as unknown as IGameService;
    const repository = new MemoryRepository();
    const autosave = new MatchAutosave(
      new EventBus(),
      gameService,
      () => ({ version: 1 }) as MatchSave,
      { repository, enabled: false }
    );
    autosave.start();
    expect(await autosave.flushNow()).toBe(false);
    expect(repository.writes).toHaveLength(0);
  });
});
