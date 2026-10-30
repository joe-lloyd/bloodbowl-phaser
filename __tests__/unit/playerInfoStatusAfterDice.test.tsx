/**
 * The player card names a fall or an injury only once the dice that decide
 * it have landed in the tray. The engine settles the injury at once, while
 * the armour and injury dice are still rolling, so the card must not read
 * the live status during that time. With no tray it updates at once.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { Player, PlayerStatus } from "../../src/types/Player";
import { PlayerInfoPanel } from "../../src/ui/components/hud/PlayerInfoPanel";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let player: Player;

beforeEach(async () => {
  const game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  player = game.ctx.team1.players[0];
  player.gridPosition = { x: 5, y: 5 };
  player.status = PlayerStatus.ACTIVE;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PlayerInfoPanel eventBus={bus} />));
  await act(async () => bus.emit(GameEventNames.PlayerSelected, { player }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
});

/** The status chip, or null while the player stands. */
const status = () =>
  container.querySelector('[data-testid="player-status"]')?.textContent ?? null;

const tray = (thrown: number, landedThrough: number) =>
  bus.emit(GameEventNames.UI_DiceInAir, {
    count: thrown - landedThrough,
    thrown,
    landedThrough,
  });

it("waits for the armour and injury dice to land before naming the injury", async () => {
  await act(async () => {
    // A failed Rush: the player falls, armour breaks, the injury roll says
    // Badly Hurt. The engine decides all of it before the dice land.
    tray(1, 0);
    player.status = PlayerStatus.PRONE;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
    tray(2, 0);
    tray(3, 0);
    player.status = PlayerStatus.INJURED;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
    // Anything else that redraws the card must not show it early either
    bus.emit(GameEventNames.PlayerMoved, {
      playerId: player.id,
      from: { x: 5, y: 5 },
      to: { x: 5, y: 5 },
    });
  });
  expect(status()).toBeNull();

  await act(async () => tray(3, 1));
  expect(status()).toBe("Prone");

  await act(async () => tray(3, 2));
  expect(status()).toBe("Prone");

  await act(async () => tray(3, 3));
  expect(status()).toBe("Injured");
});

it("updates at once with no dice in the tray", async () => {
  await act(async () => {
    player.status = PlayerStatus.STUNNED;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
  });
  expect(status()).toBe("Stunned");
});
