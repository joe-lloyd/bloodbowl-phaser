/**
 * A turnover ends the activation, so the action panel closes under the
 * turnover banner instead of offering Move and End Activation for a turn
 * that is over.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { PlayerActionMenu } from "../../src/ui/components/hud/PlayerActionMenu";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let game: HeadlessGame;

beforeEach(() => {
  game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
});

it("closes the action panel when a turnover happens", async () => {
  const teamId = game.ctx.team1.id;
  const player = game.ctx.team1.players[0];
  player.gridPosition = { x: 5, y: 5 };
  await act(async () =>
    root.render(
      <PlayerActionMenu
        eventBus={bus}
        turnData={{
          phase: GamePhase.PLAY,
          activeTeamId: teamId,
          movementUsed: new Map(),
          hasBlitzed: false,
          hasPassed: false,
          hasHandedOff: false,
          hasFouled: false,
        }}
      />
    )
  );
  await act(async () => bus.emit(GameEventNames.PlayerSelected, { player }));
  const menu = () =>
    container.querySelector('[data-testid="player-action-menu"]');
  expect(menu()).not.toBeNull();

  await act(async () => bus.emit(GameEventNames.Turnover, { teamId }));

  expect(menu()).toBeNull();
});
