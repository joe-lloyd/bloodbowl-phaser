import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, GameState } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import {
  mockScene,
  mockPitch,
  mockMovementValidator,
  mockEventBus,
  mockGameService,
  answerStepPrompt,
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
      mockEventBus.on.mock.calls.find(
        ([event]) => event === GameEventNames.GameStateRestored
      )![1] as () => void;

    it("selects this coach's player the engine has mid-move, so the coach can carry on moving", async () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: { id: "p1", action: "move", committed: true },
      } as unknown as GameState);
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
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "ui:updateActionSteps",
        expect.objectContaining({ currentStepId: "move" })
      );
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      // Plan the step, then confirm it on the same square
      await (controller as any).onSquareClicked(6, 5);
      await (controller as any).onSquareClicked(6, 5);
      await answerStepPrompt(true);
      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);
    });

    it("leaves the board alone when the active player is the other team's", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team2Id,
        weather: "Nice",
        activePlayer: { id: "p2", action: "move", committed: true },
      } as unknown as GameState);
      mockGameService.getActiveTeamId = vi.fn().mockReturnValue(team2Id);
      mockGameService.getPlayerById.mockReturnValue(player2);
      mockGameService.hasPlayerActed.mockReturnValue(false);

      restoreHandler()();

      // Locally the board drives whichever team is active; online only its own
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p2");
    });
  });

  describe("a Bloodlust bite with a choice of Thralls", () => {
    const handler = (name: string) =>
      mockEventBus.on.mock.calls.find(([event]) => event === name)?.[1];
    const restored = () =>
      mockEventBus.on.mock.calls
        .filter(([event]) => event === GameEventNames.GameStateRestored)
        .forEach(([, h]) => h());
    const thralls: Record<string, { x: number; y: number }> = {
      t1: { x: 6, y: 5 },
      t2: { x: 5, y: 6 },
    };
    const request = {
      type: "bite-target",
      playerId: "p1",
      chooserTeamId: team1Id,
      targetIds: ["t1", "t2"],
    };
    let pending: typeof request | null;

    beforeEach(() => {
      pending = request;
      Object.assign(mockGameService, {
        getDecisionService: vi.fn(() => ({ pending: () => pending })),
        answerBiteTarget: vi.fn(() => {
          pending = null;
          return true;
        }),
      });
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        thralls[id]
          ? { id, teamId: team1Id, gridPosition: thralls[id] }
          : id === "p1"
            ? player1
            : player2
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
      expect(mockPitch.highlightSquare).toHaveBeenCalledWith(6, 5, 0xef4444);
      expect(mockPitch.highlightSquare).toHaveBeenCalledWith(5, 6, 0xef4444);
    });

    it("ignores clicks on anyone else, and on empty squares", async () => {
      controller.handlePlayerClick("p2");
      controller.handlePlayerClick("p1");
      await (controller as any).onSquareClicked(10, 10);

      expect(mockGameService.answerBiteTarget).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).not.toHaveBeenCalledWith("p1");
      expect(mockGameService.getAvailableMovements).not.toHaveBeenCalled();
    });

    it("bites the clicked Thrall, once, even if the click is reported twice", async () => {
      controller.handlePlayerClick("t2");
      await (controller as any).onSquareClicked(5, 6);

      expect(mockGameService.answerBiteTarget).toHaveBeenCalledTimes(1);
      expect(mockGameService.answerBiteTarget).toHaveBeenCalledWith("t2");
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("t1");
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("t2");
    });

    it("frees the board once the bite is settled elsewhere", () => {
      pending = null;
      handler(GameEventNames.DecisionResolved)({ type: "bite-target" });
      controller.handlePlayerClick("p1");

      expect(mockGameService.answerBiteTarget).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("frees the board when a resync drops the bite without resolving it", () => {
      pending = null;
      restored();
      controller.handlePlayerClick("p1");

      expect(mockGameService.answerBiteTarget).not.toHaveBeenCalled();
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("marks the Thralls again when the host refuses the bite, and a Thrall click still bites", () => {
      // Online the answer is only sent: the bite stays pending until it returns
      (mockGameService.answerBiteTarget as any).mockImplementation(() => true);
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
      expect(mockGameService.answerBiteTarget).toHaveBeenLastCalledWith("t2");
      expect(mockGameService.answerBiteTarget).toHaveBeenCalledTimes(2);
      expect(mockGameService.getAvailableMovements).not.toHaveBeenCalled();
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
      expect(mockGameService.answerBiteTarget).toHaveBeenCalledWith("t1");
    });
  });

  describe("switching players mid-activation", () => {
    const teammate = {
      id: "p3",
      teamId: team1Id,
      gridPosition: { x: 2, y: 2 },
      stats: { MA: 6 },
      status: "Active",
      skills: [],
    };
    const byId = (id: string) =>
      ({ p1: player1, p2: player2, p3: teammate })[id as "p1"];
    const stateWith = (active: object | null) =>
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        weather: "Nice",
        activePlayer: active,
      } as unknown as GameState);

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
      stateWith({ id: "p1", action: "move", committed: true });
      controller.handlePlayerClick("p3");
      expect(mockGameService.finishActivation).toHaveBeenCalledWith("p1");
      expect(mockScene.highlightPlayer).toHaveBeenLastCalledWith("p3");
    });

    it("releases a declaration nothing has happened on yet", () => {
      stateWith({ id: "p1", action: "blitz", committed: false });
      controller.handlePlayerClick("p3");
      expect(mockGameService.cancelAction).toHaveBeenCalledWith("p1");
      expect(mockGameService.finishActivation).not.toHaveBeenCalled();
    });

    it("leaves the activation alone when the coach looks at an opponent", () => {
      stateWith({ id: "p1", action: "move", committed: true });
      controller.selectPlayer("p2");
      expect(mockGameService.finishActivation).not.toHaveBeenCalled();
      expect(mockGameService.cancelAction).not.toHaveBeenCalled();
    });

    it("carries on with the player who moved when they are clicked again", async () => {
      stateWith({ id: "p1", action: "move", committed: true });
      controller.handlePlayerClick("p1");
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      mockMovementValidator.analyzePath.mockReturnValue({
        requiresDodge: false,
      });
      await (controller as any).onSquareClicked(6, 5);
      await (controller as any).onSquareClicked(6, 5);
      await answerStepPrompt(true);
      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);
      expect(mockGameService.declareAction).not.toHaveBeenCalled();
    });
  });
});
