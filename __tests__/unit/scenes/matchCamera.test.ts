import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { NetworkedGameService } from "../../../src/network/NetworkedGameService";
import { SCENARIOS } from "../../../src/data/scenarios";
import { GameEventNames } from "../../../src/types/events";
import { followMatchWithCamera } from "../../../src/scenes/matchCamera";
import type { GameScene } from "../../../src/scenes/GameScene";

function setup() {
  const game = new HeadlessGame({
    scenario: SCENARIOS.find((s) => s.id === "camera-spread-team"),
    seed: 1,
  });
  let acknowledge = () => {};
  const gate = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const service = new NetworkedGameService(
    game.ctx.gameService,
    async (command) => {
      await gate;
      return game.execute(command);
    },
    () => game.pendingDecision()
  );
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
    team1: game.ctx.team1,
    team2: game.ctx.team2,
    isSetupActive: false,
  };
  followMatchWithCamera(scene as unknown as GameScene);
  const player = game.ctx.team1.players[0];
  game.ctx.gameService.declareAction(player.id, "move");
  return { game, service, camera, player, acknowledge };
}

describe("queued End activation camera intent", () => {
  it("waits for the queued engine completion, then fits only eligible teammates", async () => {
    const { game, service, camera, player, acknowledge } = setup();
    service.finishActivation(player.id);
    game.ctx.eventBus.emit(GameEventNames.Camera_ChooseNextPlayer, {
      teamId: player.teamId,
      playerId: player.id,
    });
    expect(camera.fitSquares).not.toHaveBeenCalled();
    acknowledge();
    await vi.waitFor(() =>
      expect(camera.fitSquares).toHaveBeenCalledWith(
        [
          { x: 9, y: 5 },
          { x: 0, y: 0 },
          { x: 19, y: 10 },
          { x: 0, y: 10 },
          { x: 19, y: 0 },
        ],
        420
      )
    );
  });

  it("drops the pending fit when the coach selects a teammate before acknowledgement", async () => {
    const { game, service, camera, player, acknowledge } = setup();
    service.finishActivation(player.id);
    game.ctx.eventBus.emit(GameEventNames.Camera_ChooseNextPlayer, {
      teamId: player.teamId,
      playerId: player.id,
    });
    game.ctx.eventBus.emit(GameEventNames.PlayerSelected, {
      player: game.ctx.team1.players[1],
    });
    acknowledge();
    await vi.waitFor(() =>
      expect(game.ctx.gameService.hasPlayerActed(player.id)).toBe(true)
    );
    expect(camera.fitSquares).not.toHaveBeenCalled();
    expect(camera.focusSquares).toHaveBeenCalledWith(
      expect.arrayContaining([{ x: 9, y: 5 }]),
      undefined
    );
  });
});
