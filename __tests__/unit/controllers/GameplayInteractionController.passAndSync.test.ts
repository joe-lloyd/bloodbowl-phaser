import { serviceSpies } from "./GameplayInteractionController.setup";
import { eventBusSpies } from "./GameplayInteractionController.setup";
import { playerWith } from "./controllerFixtures";
import { stateWith } from "./GameplayInteractionController.setup";
import { GameEventNames } from "../../../src/types/events";
import { dispatchAction } from "./GameplayInteractionController.setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import {
  mockScene,
  mockPitch,
  mockMovementValidator,
  mockGameService,
  team1Id,
  player1,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("Pass Action Stepper Logic", () => {
    beforeEach(async () => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
        weather: "Nice",
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.throwBall.mockResolvedValue({ success: true });

      controller.selectPlayer("p1");
      await dispatchAction({
        action: "pass",
        playerId: "p1",
      });
    });

    it("should initialize stepper sequence for Pass action", () => {
      expect(eventBusSpies.emit).toHaveBeenCalledWith(
        "ui:updateActionSteps",
        expect.objectContaining({
          currentStepId: "move",
          steps: [
            { id: "move", label: "Move" },
            { id: "pass", label: "Pass" },
          ],
        })
      );
    });

    it("should default to 'move' step when Pass action is declared", () => {
      mockMovementValidator.findPath.mockReturnValue({ rolls: [],  cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
      });

      void (controller).onSquareClicked(6, 5);
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
      expect(serviceSpies.throwBall).not.toHaveBeenCalled();
    });

    it("should switch to 'pass' step and show pass visuals", () => {
      controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "pass" });

      (controller).onSquareHovered(7, 5);
      expect(mockPitch.drawPassZones).toHaveBeenCalled();
      expect(mockPitch.drawPassLine).toHaveBeenCalled();
      expect(mockPitch.drawMovementPath).not.toHaveBeenCalled();
    });

    it("should execute throw when clicking in 'pass' step", () => {
      controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "pass" });

      void (controller).onSquareClicked(10, 5);
      expect(serviceSpies.throwBall).toHaveBeenCalledWith(
        { passerId: "p1", targetX: 10, targetY: 5, hailMary: false }
      );
    });

    it("should switch back to 'move' and allow movement", () => {
      controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "pass" });
      controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "move" });

      mockMovementValidator.findPath.mockReturnValue({ rolls: [],  cost: 0,
        valid: true,
        path: [{ x: 6, y: 5 }],
      });
      void (controller).onSquareClicked(6, 5);
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
      expect(serviceSpies.throwBall).not.toHaveBeenCalled();
    });

    it("should switch to 'block' step", () => {
      (controller).actionSteps = [
        { id: "move", label: "Move" },
        { id: "block", label: "Block" },
      ];
      (controller).currentActionMode = "blitz";

      controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "block" });
      expect(controller.currentStepId).toBe("block");
    });

    it("should execute block when clicking opponent in 'block' step", () => {
      (controller).selectedPlayerId = "p1";
      (controller).currentActionMode = "blitz";
      (controller).currentStepId = "block";

      const mockOpponent = playerWith({ id: "p2", teamId: "team2" });
      mockGameService.getPlayerById.mockImplementation((id) => {
        if (id === "p1") return playerWith({ id: "p1", teamId: "team1", stats: { MA: 6 } });
        if (id === "p2") return mockOpponent;
        return undefined;
      });

      (controller).getPlayerAt = vi.fn().mockReturnValue(mockOpponent);

      void (controller).onSquareClicked(10, 10);

      expect(serviceSpies.previewBlock).toHaveBeenCalledWith("p1", "p2");
      expect(mockScene.unhighlightPlayer).toHaveBeenCalled();
    });

    it("should prevent double execution if busy (e.g. throwing)", async () => {
      controller.currentActionMode = "pass";
      controller.currentStepId = "pass";
      controller.selectedPlayerId = "p1";
      controller.isBusy = true;

      await (controller).onSquareClicked(10, 10);

      expect(serviceSpies.throwBall).not.toHaveBeenCalled();
    });
  });

  describe("Network command rejection reconciliation", () => {
    beforeEach(() => {
      mockGameService.getState.mockReturnValue(stateWith({
        activeTeamId: team1Id,
      }));
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);
    });

    it("resets the optimistic step-machine when the host rejects the declare-action it came from", async () => {
      controller.selectPlayer("p1");
      await dispatchAction({
        action: "blitz",
        playerId: "p1",
      });
      expect((controller).currentActionMode).toBe("blitz");
      expect((controller).actionSteps.length).toBeGreaterThan(0);

      controller.eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "declare-action",
        playerId: "p1",
        action: "blitz",
        reason: "command-failed: illegal-action-declaration",
      });

      expect((controller).currentActionMode).toBeNull();
      expect((controller).actionSteps).toEqual([]);
      expect(eventBusSpies.emit).toHaveBeenCalledWith(
        "ui:notification",
        expect.stringContaining("out of sync")
      );
    });

    it("resets local state when a stale cancel-action is rejected (the action was actually still committed)", async () => {
      controller.selectPlayer("p1");
      await dispatchAction({
        action: "move",
        playerId: "p1",
      });
      expect((controller).currentActionMode).toBe("move");

      mockGameService.cancelAction.mockReturnValue(true);
      controller.eventBus.emit(GameEventNames.UI_CancelAction, undefined);
      expect((controller).currentActionMode).toBeNull();

      controller.eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      expect((controller).currentActionMode).toBeNull();
      expect((controller).actionSteps).toEqual([]);
      expect(eventBusSpies.emit).toHaveBeenCalledWith(
        "ui:notification",
        expect.stringContaining("out of sync")
      );
    });

    it("does NOT reconcile a stale cancel-action rejection once the coach has moved on to a different action for the same player", async () => {
      controller.selectPlayer("p1");
      await dispatchAction({
        action: "move",
        playerId: "p1",
      });

      mockGameService.cancelAction.mockReturnValue(true);
      controller.eventBus.emit(GameEventNames.UI_CancelAction, undefined);
      expect((controller).currentActionMode).toBeNull();

      await dispatchAction({
        action: "blitz",
        playerId: "p1",
      });
      expect((controller).currentActionMode).toBe("blitz");

      controller.eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      expect((controller).currentActionMode).toBe("blitz");
    });

    it("does NOT reconcile a stale cancel-action rejection once the coach has deselected and reselected the player", async () => {
      controller.selectPlayer("p1");
      await dispatchAction({
        action: "move",
        playerId: "p1",
      });

      mockGameService.cancelAction.mockReturnValue(true);
      controller.eventBus.emit(GameEventNames.UI_CancelAction, undefined);

      controller.deselectPlayer();
      controller.selectPlayer("p1");
      const notificationCallsBefore = eventBusSpies.emit.mock.calls.filter(
        (call) =>
          call[0] === "ui:notification" &&
          typeof call[1] === "string" &&
          call[1].includes("out of sync")
      ).length;

      controller.eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      const notificationCallsAfter = eventBusSpies.emit.mock.calls.filter(
        (call) =>
          call[0] === "ui:notification" &&
          typeof call[1] === "string" &&
          call[1].includes("out of sync")
      ).length;

      expect(notificationCallsAfter).toBe(notificationCallsBefore);
    });

    it("ignores a rejection for a command that is not the current optimistic state", async () => {
      controller.selectPlayer("p1");
      await dispatchAction({
        action: "move",
        playerId: "p1",
      });
      expect((controller).currentActionMode).toBe("move");

      controller.eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "declare-action",
        playerId: "p1",
        action: "blitz",
        reason: "command-failed: illegal-action-declaration",
      });
      expect((controller).currentActionMode).toBe("move");
    });

    it("ignores a rejection for a different player than the one currently selected", async () => {
      controller.selectPlayer("p1");
      await dispatchAction({
        action: "move",
        playerId: "p1",
      });

      controller.eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "cancel-action",
        playerId: "some-other-player",
        reason: "command-failed: action-already-committed",
      });
      expect((controller).currentActionMode).toBe("move");
    });
  });
});
