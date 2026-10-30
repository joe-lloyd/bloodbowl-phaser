import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { stateChecksum } from "../../../src/headless/checksum";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { Scenario } from "../../../src/types/Scenario";
import { GameEventNames } from "../../../src/types/events";
import { MomentQueue } from "../../../src/game/presentation/momentQueue";
import { whenEngineQuiet } from "../../../src/game/core/GameFlowManager";

const scenario: Scenario = {
  id: "moment-handover",
  name: "Moment handover",
  description: "A scorer near the end zone",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 18, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 10, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 18, y: 5 },
  },
};

const create = () => new HeadlessGame({ scenario, seed: 7 });

describe("engine boundaries wait for visual moments", () => {
  afterEach(() => vi.useRealTimers());

  it("holds the turn through TURNOVER, logs its player and cause, and reaches the headless checksum", async () => {
    vi.useFakeTimers();
    const visual = create();
    const headless = create();
    const bus = visual.ctx.eventBus;
    const queue = new MomentQueue(bus);
    const shown: string[] = [];
    const rows: string[] = [];
    bus.on(GameEventNames.UI_PresentMoment, (moment) => {
      if (moment) shown.push(moment.kind);
    });
    bus.on(GameEventNames.UI_LogEntry, (entry) => {
      if (entry.headline === "TURNOVER") rows.push(entry.detail ?? "");
    });
    for (const game of [visual, headless]) {
      game.ctx.gameService.declareAction(game.ctx.team1.players[0].id, "move");
    }
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: 1,
      thrown: 1,
      landedThrough: 0,
    });
    visual.ctx.gameService.triggerTurnover("Failed Rush");
    visual.ctx.gameService.triggerTurnover("Failed catch after the Rush");
    headless.ctx.gameService.triggerTurnover("Failed Rush");
    let quiet = false;
    void whenEngineQuiet().then(() => {
      quiet = true;
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(shown).toEqual([]);
    expect(quiet).toBe(false);
    expect(visual.snapshot().activeTeamId).toBe(visual.ctx.team1.id);
    expect(headless.snapshot().activeTeamId).toBe(headless.ctx.team2.id);
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: 0,
      thrown: 1,
      landedThrough: 1,
    });
    await vi.advanceTimersByTimeAsync(2499);
    expect(shown).toEqual(["turnover"]);
    expect(visual.snapshot().activeTeamId).toBe(visual.ctx.team1.id);
    await vi.runAllTimersAsync();
    expect(shown).toEqual(["turnover", "turn-started"]);
    expect(rows).toEqual([
      `${visual.ctx.team1.players[0].playerName}: Failed Rush`,
    ]);
    expect(stateChecksum(visual)).toBe(stateChecksum(headless));
    queue.dispose();
  });

  it("keeps the scoring board for the touchdown even if clicked, then names the kicker", async () => {
    vi.useFakeTimers();
    const visual = create();
    const headless = create();
    const bus = visual.ctx.eventBus;
    const queue = new MomentQueue(bus);
    const shown: string[] = [];
    bus.on(GameEventNames.UI_PresentMoment, (moment) => {
      if (moment) shown.push(moment.kind);
    });
    for (const game of [visual, headless]) {
      game.ctx.gameService.addTouchdown(
        game.ctx.team1.id,
        game.ctx.team1.players[0].id
      );
    }
    await vi.advanceTimersByTimeAsync(1000);
    bus.emit(GameEventNames.UI_SkipDriveSequence);
    await vi.advanceTimersByTimeAsync(1499);
    expect(shown).toEqual(["touchdown"]);
    expect(visual.snapshot().phase).toBe(GamePhase.TOUCHDOWN);
    expect(visual.ctx.team1.players[0].gridPosition).toEqual({ x: 18, y: 5 });
    expect(headless.snapshot().phase).toBe(GamePhase.SETUP);
    await vi.runAllTimersAsync();
    expect(shown).toEqual(["touchdown", "next-kicker"]);
    expect(visual.snapshot().phase).toBe(GamePhase.SETUP);
    expect(stateChecksum(visual)).toBe(stateChecksum(headless));
    queue.dispose();
  });
});
