import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import {
  createDiceLog,
  DiceLogRecorder,
} from "../../src/game/persistence/DiceLog";
import {
  listDiceLogs,
  readDiceLog,
  writeDiceLog,
} from "../../src/game/persistence/diceLogStore";

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

/** Block rolls Push; the Team Re-roll gives Attacker Down. */
const SEED = 1;

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

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
    const attackerId = game.ctx.team1.players[0].id;
    const defenderId = game.ctx.team2.players[0].id;

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
        createDiceLog({ id: `m${i}`, mode: "computer", seed: i, teams: [] }),
        storage
      );
    }

    const ids = listDiceLogs(storage).map((log) => log.id);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("m2");
    expect(ids[19]).toBe("m21");
    expect(readDiceLog("m0", storage)).toBeNull();
  });
});
