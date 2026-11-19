import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  type DelayProvider,
  realTimeDelay,
  whenEngineQuiet,
} from "../../src/game/core/GameFlowManager";
import { MatchAutosave } from "../../src/game/persistence/MatchAutosave";
import {
  type MatchSaveDescription,
  type MatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { type MatchSave } from "../../src/headless/serialization";
import { GameEventNames } from "../../src/types/events";
import { kickoffScenario } from "./kickoffKicks";

class KickoffWrites implements MatchSaveRepository {
  held: (string | null)[] = [];
  write(save: MatchSave): void {
    this.held.push(save.snapshot.kickoffResolution?.event ?? null);
  }
  read(): MatchSave | null {
    return null;
  }
  clear(): void {
    this.held = [];
  }
  describe(): MatchSaveDescription | null {
    return null;
  }
}

const gatesWaitForAnAnswer: DelayProvider = (ms) =>
  ms >= 10_000
    ? new Promise(() => undefined)
    : new Promise((resolve) => setTimeout(resolve, ms));

const presentation = (
  game: HeadlessGame,
  name:
    | typeof GameEventNames.KickoffTableReady
    | typeof GameEventNames.KickoffTableRolled
) =>
  new Promise<string>((resolve) => {
    game.ctx.eventBus.on(name, (data) => {
      resolve(data.presentationId);
    });
  });

describe("saving across the kick-off", () => {
  it("holds the save from the Roll prompt until the event is stored", async () => {
    const game = new HeadlessGame({
      scenario: kickoffScenario,
      seed: 4,
      delay: gatesWaitForAnAnswer,
    });
    game.ctx.gameService.seedTurnCounts(2);
    const { eventBus, gameService } = game.ctx;
    const writes = new KickoffWrites();
    const autosave = new MatchAutosave(
      eventBus,
      gameService,
      () => game.matchSave(),
      { repository: writes, debounceMs: 10 }
    );
    const ack = (id: string) => {
      eventBus.emit(GameEventNames.UI_PresentationAcknowledged, { id });
    };

    const ready = presentation(game, GameEventNames.KickoffTableReady);
    const rolled = presentation(game, GameEventNames.KickoffTableRolled);
    const kicking = game.execute({
      type: "kick-ball",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      x: 14,
      y: 5,
    });

    const readyId = await ready;
    expect(gameService.isKickoffTableResolving()).toBe(true);
    expect(await autosave.flushNow()).toBe(false);
    expect(writes.held).toEqual([]);
    ack(readyId);

    const shownId = await rolled;
    expect(gameService.isKickoffTableResolving()).toBe(true);
    expect(await autosave.flushNow()).toBe(false);
    expect(writes.held).toEqual([]);

    ack(shownId);
    await kicking;
    expect(gameService.isKickoffTableResolving()).toBe(false);
    expect(await autosave.flushNow()).toBe(true);

    const event = fixtureValue(gameService.getState().kickoffResolution).event;
    expect(writes.held.length).toBeGreaterThan(0);
    expect(new Set(writes.held)).toEqual(new Set([event]));
    autosave.dispose();
  }, 30_000);

  it("is not engine work while the table waits for Roll", async () => {
    const game = new HeadlessGame({
      scenario: kickoffScenario,
      seed: 4,
      delay: realTimeDelay,
    });
    game.ctx.gameService.seedTurnCounts(2);
    const ready = presentation(game, GameEventNames.KickoffTableReady);
    void game.execute({
      type: "kick-ball",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      x: 14,
      y: 5,
    });
    await ready;

    const started = Date.now();
    await whenEngineQuiet(5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  }, 30_000);
});
