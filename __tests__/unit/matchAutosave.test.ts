import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { MatchAutosave } from "../../src/game/persistence/MatchAutosave";
import {
  MatchSaveDescription,
  MatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { MatchSave } from "../../src/headless/serialization";
import { IGameService } from "../../src/services/interfaces/IGameService";
import { MatchStats } from "../../src/game/progression/MatchStats";
import { createLineupTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";

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
      captureTurnManagerState: () => ({ turnoverInProgress: false }),
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
      captureTurnManagerState: () => ({ turnoverInProgress: false }),
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

  it("does not write while a turnover is still ending the turn", async () => {
    const gameService = {
      getFlowContext: () => ({
        flowManager: { whenIdle: () => Promise.resolve() },
      }),
      getDecisionService: () => ({ pending: () => null }),
      captureTurnManagerState: () => ({ turnoverInProgress: true }),
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
      captureTurnManagerState: () => ({ turnoverInProgress: false }),
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

  it("keeps the save in step with the results screen's steps", async () => {
    const bus = new EventBus();
    const roster = createLineupTeam(RosterName.HUMAN, "Humans", 1);
    const stats = new MatchStats(bus, [roster], true);
    const gameService = {
      getFlowContext: () => ({
        flowManager: { whenIdle: () => Promise.resolve() },
      }),
      getDecisionService: () => ({ pending: () => null }),
      captureTurnManagerState: () => ({ turnoverInProgress: false }),
    } as unknown as IGameService;
    const repository = new MemoryRepository();
    const autosave = new MatchAutosave(
      bus,
      gameService,
      () => ({ version: 1, matchStats: stats.captureState() }) as MatchSave,
      { repository, debounceMs: 1 }
    );
    const saved = async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return JSON.stringify(repository.writes.at(-1)?.matchStats);
    };
    autosave.start();
    expect(await saved()).toBe(JSON.stringify(stats.captureState()));

    // A reload must not offer a step that has been taken
    stats.assignAwardedTouchdown(roster.players[0].id);
    expect(await saved()).toBe(JSON.stringify(stats.captureState()));
    stats.applySpp([roster]);
    expect(await saved()).toBe(JSON.stringify(stats.captureState()));
    expect(repository.writes.at(-1)?.matchStats?.applied).toBe(true);
    autosave.dispose();
  });
});
