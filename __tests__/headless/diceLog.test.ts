import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import {
  createDiceLog,
  type DiceLog,
  type DiceLogEntry,
  DiceLogRecorder,
} from "../../src/game/persistence/DiceLog";
import {
  listDiceLogs,
  readDiceLog,
  startMatchDiceLog,
  writeDiceLog,
} from "../../src/game/persistence/diceLogStore";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";

const scenario: Scenario = {
  id: "dice-log",
  name: "Block, then a Team Re-roll",
  description: "a lineman blocks and spends a Team Re-roll on the dice",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const SEED = 1;

const noBallScenario: Scenario = {
  ...scenario,
  id: "dice-log-no-ball",
  setup: {
    ...scenario.setup,
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, skills: [SkillType.NO_BALL] },
    ],
    team2Placements: [{ playerIndex: 0, x: 15, y: 9 }],
    ballPosition: { x: 6, y: 5 },
  },
};

function audit(logs: DiceLog[]): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "dice-audit-")), "logs.json");
  writeFileSync(file, JSON.stringify(logs));
  return execFileSync(
    "pnpm",
    ["exec", "tsx", "scripts/dice-audit/audit.ts", file],
    {
      encoding: "utf8",
    }
  );
}

const moment = {
  at: 0,
  phase: "play",
  half: 1 as const,
  turn: 1,
  activeTeamId: null,
};

const blockRoll = (seq: number, rng: number | null): DiceLogEntry => ({
  ...moment,
  seq,
  kind: "roll",
  rollType: "Block",
  diceType: "1D Block",
  value: ["push"],
  total: 1,
  resultState: "none",
  teamId: null,
  rng,
  automatic: false,
});

const pushAgain = (seq: number): DiceLogEntry => ({
  ...moment,
  seq,
  kind: "reroll",
  playerId: "p1",
  source: "team",
  rollKind: "block",
  skill: null,
  before: ["Push"],
  after: ["Push"],
  repeated: true,
});

const logOf = (id: string, entries: DiceLogEntry[]): DiceLog => ({
  ...createDiceLog({ id, mode: "online", seed: 5, teams: [] }),
  entries,
});

class MemoryStorage {
  private readonly limit: number;
  constructor(limit = Infinity) {
    this.limit = limit;
  }
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const others = [...this.items]
      .filter(([k]) => k !== key)
      .reduce((size, [, v]) => size + v.length, 0);
    if (others + value.length > this.limit) throw new Error("QuotaExceeded");
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const paddedLog = (id: string) => ({
  ...createDiceLog({ id, mode: "local", seed: 1, teams: [] }),
  entries: [],
  padding: "x".repeat(400),
});

const plainLog = (id: string) =>
  createDiceLog({ id, mode: "local", seed: 1, teams: [] });

describe("the dice log", () => {
  it("keeps the block roll and its Team Re-roll with the dice either side", async () => {
    const game = new HeadlessGame({ scenario, seed: SEED });
    game.ctx.team1.rerolls = 3;
    const log = createDiceLog({
      id: "test",
      mode: "local",
      seed: SEED,
      teams: [game.ctx.team1, game.ctx.team2],
    });
    const recorder = new DiceLogRecorder(
      game.ctx.eventBus,
      () => game.ctx.gameService.getState(),
      log
    );
    const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
    const defenderId = fixtureValue(game.ctx.team2.players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await game.execute({ type: "block", attackerId, defenderId });
    await game.execute({ type: "team-reroll-block", attackerId });
    recorder.dispose();

    const shown = log.entries.map((e) =>
      e.kind === "roll"
        ? { kind: e.kind, rollType: e.rollType, value: e.value }
        : {
            kind: e.kind,
            source: e.source,
            before: e.before,
            after: e.after,
            repeated: e.repeated,
          }
    );
    expect(shown).toEqual([
      { kind: "roll", rollType: "Block Roll", value: ["push"] },
      { kind: "roll", rollType: "Block Roll", value: ["skull"] },
      {
        kind: "reroll",
        source: "team",
        before: ["Push"],
        after: ["Attacker Down"],
        repeated: false,
      },
    ]);
    expect(log.entries.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(log.entries[0]).toMatchObject({ half: 1, activeTeamId: "team1" });
  });

  it("keeps the newest 20 matches in browser storage", () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 22; i++) {
      writeDiceLog(
        createDiceLog({
          id: `m${String(i)}`,
          mode: "computer",
          seed: i,
          teams: [],
        }),
        storage
      );
    }

    const ids = listDiceLogs(storage).map((log) => log.id);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("m2");
    expect(ids[19]).toBe("m21");
    expect(readDiceLog("m0", storage)).toBeNull();
  });

  it("marks No Ball's pick-up as decided with no die thrown", async () => {
    const game = new HeadlessGame({ scenario: noBallScenario, seed: SEED });
    const log = createDiceLog({
      id: "t",
      mode: "local",
      seed: SEED,
      teams: [],
    });
    const recorder = new DiceLogRecorder(
      game.ctx.eventBus,
      () => game.ctx.gameService.getState(),
      log
    );
    const playerId = fixtureValue(game.ctx.team1.players[0]).id;

    await game.execute({ type: "declare-action", playerId, action: "move" });
    await game.execute({ type: "move", playerId, path: [{ x: 6, y: 5 }] });
    recorder.dispose();

    const pickup = log.entries.find(
      (e) => e.kind === "roll" && e.rollType.startsWith("Pickup")
    );
    expect(pickup).toMatchObject({ value: 1, automatic: true });
  });

  it("keeps adding to one log across resumes it did not start", () => {
    localStorage.clear();
    const game = new HeadlessGame({ scenario, seed: SEED });
    const resume = () =>
      startMatchDiceLog({
        eventBus: game.ctx.eventBus,
        getState: () => game.ctx.gameService.getState(),
        mode: "computer",
        seed: 77,
        teams: [],
        resumed: true,
      });

    for (const value of [3, 4]) {
      const session = resume();
      game.ctx.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: "Test",
        diceType: "1d6",
        value,
        total: value,
        description: `Test: ${String(value)}`,
      });
      session.dispose();
    }

    const logs = listDiceLogs();
    expect(logs).toHaveLength(1);
    expect(fixtureValue(logs[0]).entries).toHaveLength(2);
  });

  it("drops older logs, not this one, when storage is full", () => {
    const storage = new MemoryStorage(1200);
    writeDiceLog(paddedLog("a"), storage);
    writeDiceLog(paddedLog("b"), storage);

    writeDiceLog(paddedLog("c"), storage);

    expect(listDiceLogs(storage).map((log) => log.id)).toEqual(["b", "c"]);
  });

  it("drops an older log when the index write is refused", () => {
    const storage = new MemoryStorage();
    writeDiceLog(plainLog("a"), storage);
    writeDiceLog(plainLog("b"), storage);
    const refused: string[] = [];
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key === "bloodbowl_dice_logs" && refused.length === 0) {
        refused.push(value);
        throw new Error("QuotaExceeded");
      }
      setItem(key, value);
    };

    writeDiceLog(plainLog("c"), storage);

    expect(refused).toEqual(['["a","b","c"]']);
    expect(listDiceLogs(storage).map((log) => log.id)).toEqual(["b", "c"]);
  });

  it("audits both coaches' copies of one online match as one match", async () => {
    const game = new HeadlessGame({ scenario, seed: SEED });
    game.ctx.team1.rerolls = 3;
    const log = createDiceLog({
      id: "host",
      mode: "online",
      seed: SEED,
      teams: [game.ctx.team1, game.ctx.team2],
    });
    const recorder = new DiceLogRecorder(
      game.ctx.eventBus,
      () => game.ctx.gameService.getState(),
      log
    );
    const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
    const defenderId = fixtureValue(game.ctx.team2.players[0]).id;
    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await game.execute({ type: "block", attackerId, defenderId });
    await game.execute({ type: "team-reroll-block", attackerId });
    recorder.dispose();

    const file = path.join(mkdtempSync(path.join(tmpdir(), "dice-audit-")), "logs.json");
    writeFileSync(file, JSON.stringify([log, { ...log, id: "guest" }]));
    const report = execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/dice-audit/audit.ts", file],
      { encoding: "utf8" }
    );

    expect(report).toContain("2 throws appear in more than one log");
    expect(report).toMatch(/Block: 2 dice, skull:1 both-down:0 push:1/);
    expect(report).toContain("D6: 0 dice");
    expect(report).toContain("no dice to judge");
    expect(report).toContain("1-dice block, same faces same order: 0 of 1");
  }, 30_000);

  it("counts a re-roll that only the later of two copies holds", () => {
    const report = audit([
      logOf("host", [blockRoll(0, 100)]),
      logOf("guest", [blockRoll(0, 100), pushAgain(1)]),
    ]);

    expect(report).toContain("1-dice block, same faces same order: 1 of 1");
  }, 30_000);

  it("catches a repeated generator state across a roll with no state", () => {
    const report = audit([
      logOf("host", [blockRoll(0, 100), blockRoll(1, null), blockRoll(2, 100)]),
    ]);

    expect(report).toContain("CHECK: 1 rolls reused numbers");
  }, 30_000);

  it("times a resumed log's rolls from when the match started", () => {
    const hourAgo = Date.now() - 3_600_000;
    const log = {
      ...createDiceLog({ id: "r", mode: "local", seed: 1, teams: [] }),
      startedAt: hourAgo,
      updatedAt: hourAgo + 60_000,
    };
    const game = new HeadlessGame({ scenario, seed: SEED });
    const recorder = new DiceLogRecorder(
      game.ctx.eventBus,
      () => game.ctx.gameService.getState(),
      log
    );

    game.ctx.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Test",
      diceType: "1d6",
      value: 4,
      total: 4,
      description: "Test: 4",
    });
    recorder.dispose();

    expect(fixtureValue(log.entries[0]).at).toBeGreaterThanOrEqual(3_600_000);
    expect(log.updatedAt).toBe(hourAgo + fixtureValue(log.entries[0]).at);
  });
});
