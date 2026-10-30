/**
 * The player card and the dice log wait for the same dice. In round 1 the
 * card said STUNNED while the log still held the armour roll, because each
 * gave up on a silent tray on its own timer.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { Player, PlayerStatus } from "../../src/types/Player";
import { PlayerInfoPanel } from "../../src/ui/components/hud/PlayerInfoPanel";
import { DiceLog } from "../../src/ui/components/hud/DiceLog";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let player: Player;

beforeEach(async () => {
  vi.useFakeTimers();
  const game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  player = game.ctx.team1.players[0];
  player.gridPosition = { x: 5, y: 5 };
  player.status = PlayerStatus.ACTIVE;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <>
        <PlayerInfoPanel eventBus={bus} />
        <DiceLog eventBus={bus} />
      </>
    )
  );
  await act(async () => bus.emit(GameEventNames.PlayerSelected, { player }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
  vi.useRealTimers();
});

const card = () =>
  container.querySelector('[data-testid="player-status"]')?.textContent ?? null;
const logged = () => (container.textContent ?? "").includes("Armour broken");

const tray = (thrown: number, landedThrough: number) =>
  bus.emit(GameEventNames.UI_DiceInAir, {
    count: thrown - landedThrough,
    thrown,
    landedThrough,
  });

it("shows the stun on the card and the armour roll in the log at the same moment", async () => {
  // A Dodge die goes up and the tray then goes quiet
  await act(async () => {
    tray(1, 0);
    player.status = PlayerStatus.PRONE;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
  });
  await act(async () => vi.advanceTimersByTimeAsync(5000));

  // The armour roll follows, unheard by the silent tray; it breaks and the
  // player is stunned
  await act(async () => {
    bus.emit(GameEventNames.DiceRoll, {
      rollType: "Armour",
      diceType: "2d6",
      value: [5, 5],
      total: 10,
      description: "Armour broken: 10 against AV 9+",
    });
    player.status = PlayerStatus.STUNNED;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
  });

  for (let t = 0; t < 12; t++) {
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect({ card: card() === "Stunned", log: logged() }).toEqual({
      card: logged(),
      log: logged(),
    });
  }
  expect(card()).toBe("Stunned");
  expect(logged()).toBe(true);
});
