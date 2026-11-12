import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScene } from "../../../src/scenes/GameScene";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase } from "../../../src/types/GameState";

/**
 * A dropped player goes straight to where they were dropped. Against the
 * computer and online the engine runs the placement a moment after the drop,
 * and until then the record still has the player on the square they left.
 * The board used to redraw from that record at once, drawing the player back
 * on their old square for a frame before they jumped to the new one.
 *
 * Drives GameScene's real event wiring with stand-ins for the service, the
 * placement controller and the sprites, so it runs without a browser.
 * e2e/browser/setup-drop-no-flashback.e2e.ts checks the frames in the app.
 */

type Handler = (...args: unknown[]) => void;

/** Records listeners like an event emitter, so a test can fire them. */
function emitterStub() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    fire: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args),
  };
}

describe("a drop waits for the engine before redrawing", () => {
  const eventBus = new EventBus();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scene: any;
  let controller: ReturnType<typeof emitterStub> & Record<string, unknown>;
  let service: {
    runsCommandsLater?: boolean;
    placePlayer: ReturnType<typeof vi.fn>;
    removePlayer: ReturnType<typeof vi.fn>;
    placeKickoffEventPlayer: ReturnType<typeof vi.fn>;
    getPhase: () => GamePhase;
  };

  const build = (runsCommandsLater: boolean) => {
    service = {
      runsCommandsLater: runsCommandsLater || undefined,
      placePlayer: vi.fn(() => true),
      removePlayer: vi.fn(),
      placeKickoffEventPlayer: vi.fn(() => true),
      getPhase: () => GamePhase.SETUP,
    };
    scene = Object.create(GameScene.prototype);
    Object.assign(scene, {
      eventBus,
      busSubscriptions: [],
      sys: { settings: { status: 5, key: "GameScene" } },
      gameService: service,
      team1: { id: "team1", players: [] },
      team2: { id: "team2", players: [] },
      playerSprites: new Map(),
      pitch: {
        getContainer: () => ({ x: 0, y: 0 }),
        worldToGrid: () => ({ x: 1, y: 3 }),
      },
      input: { setDraggable: vi.fn() },
      isSetupActive: true,
      refreshDugouts: vi.fn(),
      placePlayersOnPitch: vi.fn(),
      checkSetupCompleteness: vi.fn(),
    });
    scene["initializeControllers"]();
    controller = Object.assign(emitterStub(), { syncFromTeam: vi.fn() });
    scene.placementController = controller;
    scene["setupSceneSpecificListeners"]();
  };

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe("in a hot-seat match the engine has already answered", () => {
    beforeEach(() => build(false));

    it("redraws a placement at once", () => {
      controller.fire(GameEventNames.PlayerPlaced, {
        playerId: "p1",
        x: 1,
        y: 3,
      });
      expect(service.placePlayer).toHaveBeenCalledWith("p1", 1, 3);
      expect(scene.refreshDugouts).toHaveBeenCalledTimes(1);
    });

    it("redraws a removal at once", () => {
      controller.fire(GameEventNames.PlayerRemoved, "p1");
      expect(scene.refreshDugouts).toHaveBeenCalledTimes(1);
    });
  });

  describe("against the computer or online", () => {
    beforeEach(() => build(true));

    it("leaves a placement as dropped until the engine's answer redraws", () => {
      controller.fire(GameEventNames.PlayerPlaced, {
        playerId: "p1",
        x: 1,
        y: 3,
      });
      expect(service.placePlayer).toHaveBeenCalledWith("p1", 1, 3);
      expect(scene.refreshDugouts).not.toHaveBeenCalled();

      // ComputerMatch / OnlineMatch once the command has run
      eventBus.emit(GameEventNames.UI_SyncBoard);
      expect(scene.refreshDugouts).toHaveBeenCalledTimes(1);
    });

    it("leaves a player sent to the dugout as dropped until the answer", () => {
      controller.fire(GameEventNames.PlayerRemoved, "p1");
      expect(service.removePlayer).toHaveBeenCalledWith("p1");
      expect(scene.refreshDugouts).not.toHaveBeenCalled();
    });

    it("redraws a placement the service turns down on the spot", () => {
      service.placePlayer.mockReturnValue(false);
      controller.fire(GameEventNames.PlayerPlaced, {
        playerId: "p1",
        x: 1,
        y: 3,
      });
      expect(scene.refreshDugouts).toHaveBeenCalledTimes(1);
    });

    it("puts the player back when the engine refuses the drop", () => {
      for (const commandType of [
        "place-player",
        "remove-player",
        "kickoff-place-player",
      ]) {
        eventBus.emit(GameEventNames.NetworkCommandRejected, {
          commandType,
          playerId: "p1",
          reason: "refused",
        });
      }
      expect(scene.refreshDugouts).toHaveBeenCalledTimes(3);
    });

    it("does not redraw for other refused commands", () => {
      eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "declare-action",
        playerId: "p1",
        reason: "refused",
      });
      expect(scene.refreshDugouts).not.toHaveBeenCalled();
    });
  });

  describe("the Solid Defence drag", () => {
    const solidDefenceSprite = () => {
      const sprite = Object.assign(emitterStub(), {
        x: 0,
        y: 0,
        input: {},
        setInteractive: vi.fn(),
        disableInteractive: vi.fn(),
        setDepth: vi.fn(),
        setPosition: vi.fn(),
      });
      scene.playerSprites.set("p1", sprite);
      scene.isSetupActive = false;
      scene.setKickoffSolidDefenceDragPlayers(["p1"]);
      return sprite;
    };

    it("redraws at once in a hot-seat match", () => {
      build(false);
      solidDefenceSprite().fire("dragend");
      expect(service.placeKickoffEventPlayer).toHaveBeenCalledWith("p1", 1, 3);
      expect(scene.placePlayersOnPitch).toHaveBeenCalledTimes(1);
    });

    it("waits for the engine against the computer or online", () => {
      build(true);
      solidDefenceSprite().fire("dragend");
      expect(service.placeKickoffEventPlayer).toHaveBeenCalledWith("p1", 1, 3);
      expect(scene.placePlayersOnPitch).not.toHaveBeenCalled();
    });

    it("sends a refused drop back at once", () => {
      build(true);
      service.placeKickoffEventPlayer.mockReturnValue(false);
      solidDefenceSprite().fire("dragend");
      expect(scene.placePlayersOnPitch).toHaveBeenCalledTimes(1);
    });
  });
});
