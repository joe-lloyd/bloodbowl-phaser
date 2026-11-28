import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { NetworkedGameService } from "../../../src/network/NetworkedGameService";
import { SCENARIOS } from "../../../src/data/scenarios";
import { GameEventNames } from "../../../src/types/events";
import { followMatchWithCamera } from "../../../src/scenes/matchCamera";
import type { GameScene } from "../../../src/scenes/GameScene";

const acknowledgeNothing = () => {};

function setup() {
  const game = new HeadlessGame({
    scenario: fixtureValue(SCENARIOS.find((s) => s.id === "camera-spread-team")),
    seed: 1,
  });
  let acknowledge = acknowledgeNothing;
  const gate = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const service = new NetworkedGameService({ inner: game.ctx.gameService, dispatch: async (command) => {
      await gate;
      return game.execute(command);
    }, pendingDecision: () => game.pendingDecision() });
  const camera = {
    release: vi.fn(),
    fitSquares: vi.fn(),
    focusSquares: vi.fn(),
    overview: vi.fn(),
  };
  const scene = {
    subscribe: game.ctx.eventBus.on.bind(game.ctx.eventBus),
    cameraController: camera,
    gameService: service,
    teams: game.ctx.teams,
    isSetupActive: false,
  };
  followMatchWithCamera(scene as unknown as GameScene);
  const player = game.ctx.teams[0].players[0];
  game.ctx.gameService.declareAction({ playerId: fixtureValue(player).id, action: "move" });
  return { game, service, camera, player, acknowledge };
}

describe("queued End activation camera intent", () => {
  it("waits for the queued engine completion, then fits only eligible teammates", async () => {
    const { game, service, camera, player, acknowledge } = setup();
    service.finishActivation(fixtureValue(player).id);
    game.ctx.eventBus.emit(GameEventNames.Camera_ChooseNextPlayer, {
      teamId: fixtureValue(player).teamId,
      playerId: fixtureValue(player).id,
    });
    expect(camera.fitSquares).not.toHaveBeenCalled();
    acknowledge();
    await vi.waitFor(() => {
      expect(camera.fitSquares).toHaveBeenCalledWith(
        [
          { x: 9, y: 5 },
          { x: 0, y: 0 },
          { x: 19, y: 10 },
          { x: 0, y: 10 },
          { x: 19, y: 0 },
        ],
        420
      );
    });
  });

  it("drops the pending fit when the coach selects a teammate before acknowledgement", async () => {
    const { game, service, camera, player, acknowledge } = setup();
    service.finishActivation(fixtureValue(player).id);
    game.ctx.eventBus.emit(GameEventNames.Camera_ChooseNextPlayer, {
      teamId: fixtureValue(player).teamId,
      playerId: fixtureValue(player).id,
    });
    game.ctx.eventBus.emit(GameEventNames.PlayerSelected, {
      player: fixtureValue(game.ctx.teams[0].players[1]),
    });
    acknowledge();
    await vi.waitFor(() => {
      expect(game.ctx.gameService.hasPlayerActed(fixtureValue(player).id)).toBe(true);
    });
    expect(camera.fitSquares).not.toHaveBeenCalled();
    expect(camera.focusSquares).toHaveBeenCalledWith(
      expect.arrayContaining([{ x: 9, y: 5 }]),
      undefined
    );
  });
});
