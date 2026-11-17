/**
 * A save never lands from the Kick-off Table's Roll prompt until its result
 * is stored. A save at the prompt restores a kick whose dialog never
 * reopens, so a match against the computer stalls. A save after the roll
 * holds the advanced dice without the event, so a restore rolls another.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { DelayProvider } from "../../src/game/core/GameFlowManager";
import { MatchAutosave } from "../../src/game/persistence/MatchAutosave";
import {
  MatchSaveDescription,
  MatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { MatchSave } from "../../src/headless/serialization";
import { GameEventNames } from "../../src/types/events";
import { kickoffScenario } from "./kickoffKicks";

/** What each save held of the kick-off, in the order written. */
class KickoffWrites implements MatchSaveRepository {
  held: (string | null)[] = [];
  write(save: MatchSave): void {
    this.held.push((save as unknown as { event: string | null }).event);
  }
  read(): MatchSave | null {
    return null;
  }
  clear(): void {}
  describe(): MatchSaveDescription | null {
    return null;
  }
}

/**
 * Real waits for the pacing beats, while the kick-off's own gates (ten
 * seconds and longer) never run out, so only their answer ends them. None of
 * it counts as engine work: the engine looks quiet, as it does to autosave
 * once whenEngineQuiet gives up after 30 seconds on a coach who has not
 * pressed Roll.
 */
const gatesWaitForAnAnswer: DelayProvider = (ms) =>
  ms >= 10_000
    ? new Promise(() => {})
    : new Promise((resolve) => setTimeout(resolve, ms));

const presentation = (game: HeadlessGame, name: GameEventNames) =>
  new Promise<string>((resolve) =>
    game.ctx.eventBus.on(name as never, ((data: { presentationId: string }) =>
      resolve(data.presentationId)) as never)
  );

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
      () =>
        ({
          event: gameService.getState().kickoffResolution?.event ?? null,
        }) as unknown as MatchSave,
      { repository: writes, debounceMs: 10 }
    );
    const ack = (id: string) =>
      eventBus.emit(GameEventNames.UI_PresentationAcknowledged, { id });

    const ready = presentation(game, GameEventNames.KickoffTableReady);
    const rolled = presentation(game, GameEventNames.KickoffTableRolled);
    const kicking = game.execute({
      type: "kick-ball",
      playerId: game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });

    // Waiting for Roll: a restore could not reopen the dialog, so no save
    const readyId = await ready;
    expect(gameService.isKickoffTableResolving()).toBe(true);
    expect(await autosave.flushNow()).toBe(false);
    expect(writes.held).toEqual([]);
    ack(readyId);
    // Rolled, its dialog still open: no save
    const shownId = await rolled;
    expect(gameService.isKickoffTableResolving()).toBe(true);
    expect(await autosave.flushNow()).toBe(false);
    expect(writes.held).toEqual([]);

    ack(shownId);
    await kicking;
    expect(gameService.isKickoffTableResolving()).toBe(false);
    expect(await autosave.flushNow()).toBe(true);
    // Every save holds the event the dice rolled
    const event = gameService.getState().kickoffResolution!.event;
    expect(writes.held.length).toBeGreaterThan(0);
    expect(new Set(writes.held)).toEqual(new Set([event]));
    autosave.dispose();
  }, 30_000);
});
