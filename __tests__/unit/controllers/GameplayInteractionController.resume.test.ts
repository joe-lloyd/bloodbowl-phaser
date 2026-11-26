import { pendingDecisionSpy } from "./GameplayInteractionController.setup";
import { serviceSpies } from "./GameplayInteractionController.setup";
import { eventHandler } from "./GameplayInteractionController.setup";
import { playerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { eventBusSpies } from "./GameplayInteractionController.setup";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, type GameState } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import {
  mockScene,
  mockPitch,
  mockMovementValidator,
  mockGameService,
  team1Id,
  team2Id,
  player1,
  player2,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("after a reload or resync", () => {
    const restoreHandler = () =>
      fixtureValue(eventBusSpies.on.mock.calls.find(
        ([event]) => event === GameEventNames.GameStateRestored
      ))[1];

    it("selects this coach's player the engine has mid-move, so the coach can carry on moving", async () => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: { id: "p1", action: "move", committed: true },
      }));
      mockGameService.getActiveTeamId = vi.fn().mockReturnValue(team1Id);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.hasPlayerActed.mockReturnValue(false);
      mockGameService.getMovementUsed.mockReturnValue(3);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.canActivate.mockReturnValue(true);
      mockMovementValidator.analyzePath.mockReturnValue({
        requiresDodge: false,
      });

      restoreHandler()();

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(eventBusSpies.emit).toHaveBeenCalledWith(
        "ui:updateActionSteps",
        expect.objectContaining({ currentStepId: "move" })
      );
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });

      await (controller).onSquareClicked(6, 5);
      await (controller).onSquareClicked(6, 5);
      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);
    });

    it("leaves the board alone when the active player is the other team's", () => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team2Id,
        weather: "Nice",
        activePlayer: { id: "p2", action: "move", committed: true },
      }));
      mockGameService.getActiveTeamId = vi.fn().mockReturnValue(team2Id);
      mockGameService.getPlayerById.mockReturnValue(player2);
      mockGameService.hasPlayerActed.mockReturnValue(false);

      restoreHandler()();

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p2");
    });
  });

  describe("a Bloodlust bite with a choice of Thralls", () => {
    const handler = eventHandler;
    const restored = () => {
      for (const [event, h] of eventBusSpies.on.mock.calls) {
        if (event === GameEventNames.GameStateRestored) h();
      }
    };
    const thralls: Record<string, { x: number; y: number }> = {
      t1: { x: 6, y: 5 },
      t2: { x: 5, y: 6 },
    };
    const request = {
      type: "bite-target" as const,
      playerId: "p1",
      chooserTeamId: team1Id,
      targetIds: ["t1", "t2"],
    };
    let pending: typeof request | null;

    beforeEach(() => {
      pending = request;
      pendingDecisionSpy.mockImplementation(() => pending);
      mockGameService.answerBiteTarget.mockImplementation(() => { pending = null; return true; });
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
      }));
      mockGameService.getAvailableMovements.mockReturnValue([]);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        { if (thralls[id]) { return playerWith({ id, teamId: team1Id, gridPosition: thralls[id] }); } if (id === "p1") { return player1; } return player2; }
      );
      mockPitch.highlightSquare.mockImplementation(function () {
        const marker = {
          scene: {},
          destroy: vi.fn(),
          setName: () => marker,
        };
        return marker;
      });
      handler(GameEventNames.DecisionRequested)(request);
    });

    it("marks every Thrall on the pitch", () => {
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("t1", 0xef4444);
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("t2", 0xef4444);
      expect(mockPitch.highlightSquare).toHaveBeenCalledWith({ x: 6, y: 5 }, 0xef4444);
      expect(mockPitch.highlightSquare).toHaveBeenCalledWith({ x: 5, y: 6 }, 0xef4444);
    });

    it("ignores clicks on anyone else, and on empty squares", async () => {
      controller.handlePlayerClick("p2");
      controller.handlePlayerClick("p1");
      await (controller).onSquareClicked(10, 10);

      expect(serviceSpies.answerBiteTarget).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).not.toHaveBeenCalledWith("p1");
      expect(serviceSpies.getAvailableMovements).not.toHaveBeenCalled();
    });

    it("bites the clicked Thrall, once, even if the click is reported twice", async () => {
      controller.handlePlayerClick("t2");
      await (controller).onSquareClicked(5, 6);

      expect(serviceSpies.answerBiteTarget).toHaveBeenCalledTimes(1);
      expect(serviceSpies.answerBiteTarget).toHaveBeenCalledWith("t2");
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("t1");
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("t2");
    });

    it("frees the board once the bite is settled elsewhere", () => {
      pending = null;
      handler(GameEventNames.DecisionResolved)({ type: "bite-target" });
      controller.handlePlayerClick("p1");

      expect(serviceSpies.answerBiteTarget).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("frees the board when a resync drops the bite without resolving it", () => {
      pending = null;
      restored();
      controller.handlePlayerClick("p1");

      expect(serviceSpies.answerBiteTarget).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("marks the Thralls again when the host refuses the bite, and a Thrall click still bites", () => {
      mockGameService.answerBiteTarget.mockImplementation(() => true);
      controller.handlePlayerClick("t1");
      mockScene.highlightPlayer.mockClear();
      mockPitch.highlightSquare.mockClear();

      handler(GameEventNames.NetworkCommandRejected)({
        commandType: "choose-bite-target",
        playerId: "t1",
        reason: "command-failed: no-bite-target-awaiting",
      });

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("t1", 0xef4444);
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("t2", 0xef4444);
      expect(mockPitch.highlightSquare).toHaveBeenCalledTimes(2);
      controller.handlePlayerClick("t2");
      expect(serviceSpies.answerBiteTarget).toHaveBeenLastCalledWith("t2");
      expect(serviceSpies.answerBiteTarget).toHaveBeenCalledTimes(2);
      expect(serviceSpies.getAvailableMovements).not.toHaveBeenCalled();
    });

    it("leaves the board free when a refused bite is no longer pending", () => {
      controller.handlePlayerClick("t1");
      mockScene.highlightPlayer.mockClear();

      handler(GameEventNames.NetworkCommandRejected)({
        commandType: "choose-bite-target",
        playerId: "t1",
        reason: "command-failed: no-bite-target-awaiting",
      });

      expect(mockScene.highlightPlayer).not.toHaveBeenCalledWith(
        "t1",
        0xef4444
      );
      controller.handlePlayerClick("p1");
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("marks the bite again when a resync restores one", () => {
      mockScene.highlightPlayer.mockClear();
      restored();

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("t1", 0xef4444);
      controller.handlePlayerClick("t1");
      expect(serviceSpies.answerBiteTarget).toHaveBeenCalledWith("t1");
    });
  });

  describe("switching players mid-activation", () => {
    const teammate = playerWith({
      id: "p3",
      teamId: team1Id,
      gridPosition: { x: 2, y: 2 },
      stats: { MA: 6 },
      status: "Active",
      skills: [],
    });
    const byId = (id: string) =>
      new Map([["p1", player1], ["p2", player2], ["p3", teammate]]).get(id);
    const setActive = (active: GameState["activePlayer"]) =>
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: active,
      }));

    beforeEach(() => {
      mockGameService.getPlayerById.mockImplementation(byId);
      mockGameService.getActiveTeamId = vi.fn().mockReturnValue(team1Id);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.hasPlayerActed.mockReturnValue(false);
      mockGameService.canActivate.mockReturnValue(true);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      mockGameService.getMovementUsed.mockReturnValue(3);
    });

    it("ends the moving player's activation when the coach picks another of theirs", () => {
      setActive({ id: "p1", action: "move", committed: true });
      controller.handlePlayerClick("p3");
      expect(serviceSpies.finishActivation).toHaveBeenCalledWith("p1");
      expect(mockScene.highlightPlayer).toHaveBeenLastCalledWith("p3");
    });

    it("releases a declaration nothing has happened on yet", () => {
      setActive({ id: "p1", action: "blitz", committed: false });
      controller.handlePlayerClick("p3");
      expect(serviceSpies.cancelAction).toHaveBeenCalledWith("p1");
      expect(serviceSpies.finishActivation).not.toHaveBeenCalled();
    });

    it("leaves the activation alone when the coach looks at an opponent", () => {
      setActive({ id: "p1", action: "move", committed: true });
      controller.selectPlayer("p2");
      expect(serviceSpies.finishActivation).not.toHaveBeenCalled();
      expect(serviceSpies.cancelAction).not.toHaveBeenCalled();
    });

    it("carries on with the player who moved when they are clicked again", async () => {
      setActive({ id: "p1", action: "move", committed: true });
      controller.handlePlayerClick("p1");
      mockMovementValidator.findPath.mockReturnValue({ cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      mockMovementValidator.analyzePath.mockReturnValue({
        requiresDodge: false,
      });
      await (controller).onSquareClicked(6, 5);
      await (controller).onSquareClicked(6, 5);
      expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);
      expect(serviceSpies.declareAction).not.toHaveBeenCalled();
    });
  });
});
