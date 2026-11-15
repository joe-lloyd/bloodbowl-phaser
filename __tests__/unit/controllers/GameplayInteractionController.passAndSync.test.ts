import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, GameState } from "../../../src/types/GameState";
import {
  mockScene,
  mockPitch,
  mockMovementValidator,
  mockEventBus,
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
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
        weather: "Nice",
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.throwBall.mockResolvedValue({ success: true });

      // Simulate generic Action Selected flow
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "pass",
        playerId: "p1",
      });
    });

    it("should initialize stepper sequence for Pass action", () => {
      // Check event emission
      expect(mockEventBus.emit).toHaveBeenCalledWith(
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
      // By default, we should be able to move
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
      });

      (controller as any).onSquareClicked(6, 5); // Addwaypoint
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
      expect(mockGameService.throwBall).not.toHaveBeenCalled();
    });

    it("should switch to 'pass' step and show pass visuals", () => {
      // Switch step
      (controller as any).onStepSelected({ stepId: "pass" });

      // Hovering should now trigger pass visualization
      (controller as any).onSquareHovered(7, 5);
      expect(mockPitch.drawPassZones).toHaveBeenCalled();
      expect(mockPitch.drawPassLine).toHaveBeenCalled();
      expect(mockPitch.drawMovementPath).not.toHaveBeenCalled();
    });

    it("should execute throw when clicking in 'pass' step", () => {
      // Switch to pass
      (controller as any).onStepSelected({ stepId: "pass" });

      // Click target
      (controller as any).onSquareClicked(10, 5);
      expect(mockGameService.throwBall).toHaveBeenCalledWith(
        "p1",
        10,
        5,
        false
      );
    });

    it("should switch back to 'move' and allow movement", () => {
      // Switch to pass then back to move
      (controller as any).onStepSelected({ stepId: "pass" });
      (controller as any).onStepSelected({ stepId: "move" });

      // Click to move
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
      });
      (controller as any).onSquareClicked(6, 5);
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
      expect(mockGameService.throwBall).not.toHaveBeenCalled();
    });

    it("should switch to 'block' step", () => {
      // Setup Blitz Mode
      (controller as any).actionSteps = [
        { id: "move", label: "Move" },
        { id: "block", label: "Block" },
      ];
      (controller as any).currentActionMode = "blitz";

      // Switch
      (controller as any).onStepSelected({ stepId: "block" });
      expect(controller["currentStepId"]).toBe("block");
    });

    it("should execute block when clicking opponent in 'block' step", () => {
      (controller as any).selectedPlayerId = "p1";
      (controller as any).currentActionMode = "blitz";
      (controller as any).currentStepId = "block";

      // Mock Player At Square (Opponent)
      const mockOpponent = { id: "p2", teamId: "team2" };
      mockGameService.getPlayerById.mockImplementation((id) => {
        if (id === "p1") return { id: "p1", teamId: "team1", stats: { MA: 6 } };
        if (id === "p2") return mockOpponent;
        return null;
      });
      // Mock getPlayerAt helper via prototype or just ensure logic uses getPlayerById/Grid
      // The controller uses private getPlayerAt(x,y). We need to mock that response.
      // Since it's private and hard to mock directly without refactoring,
      // we can mock getPlayerById AND we rely on the fact that existing logic calls getPlayerAt.
      // Actually, onSquareClicked calls getPlayerAt.
      // Let's assume we can mock `controller.getPlayerAt` if we cast to any.
      (controller as any).getPlayerAt = vi.fn().mockReturnValue(mockOpponent);

      (controller as any).onSquareClicked(10, 10);

      expect(mockGameService.previewBlock).toHaveBeenCalledWith("p1", "p2");
      expect(mockScene.unhighlightPlayer).toHaveBeenCalled();
    });

    it("should prevent double execution if busy (e.g. throwing)", async () => {
      // simulate Pass Mode
      controller["currentActionMode"] = "pass";
      controller["currentStepId"] = "pass";
      controller["selectedPlayerId"] = "p1";
      controller["isBusy"] = true; // Simulating busy state

      await (controller as any).onSquareClicked(10, 10);

      expect(mockGameService.throwBall).not.toHaveBeenCalled();
    });
  });

  // Regression for the captured "infinite roll on a block, Bloodlust
  // skipped" online bug: NetworkedGameService.declareAction()/cancelAction()
  // answer optimistically (true) before the host has actually ruled, so
  // onActionSelected/onCancelAction advance this local step-machine on an
  // assumption that can turn out wrong. NetworkCommandRejected is how the
  // (guest-only) network layer reports that the host actually refused a
  // command this controller already treated as done; onNetworkCommandRejected
  // must reconcile instead of leaving the coach stuck on a step the host
  // never agreed to.
  describe("Network command rejection reconciliation", () => {
    beforeEach(() => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);
    });

    it("resets the optimistic step-machine when the host rejects the declare-action it came from", async () => {
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "blitz",
        playerId: "p1",
      });
      expect((controller as any).currentActionMode).toBe("blitz");
      expect((controller as any).actionSteps.length).toBeGreaterThan(0);

      (controller as any).onNetworkCommandRejected({
        commandType: "declare-action",
        playerId: "p1",
        action: "blitz",
        reason: "command-failed: illegal-action-declaration",
      });

      // Deselected (and immediately reselected fresh against the — now
      // corrected — replica) rather than left claiming a Blitz the host
      // never accepted: no stale "block" step for every future click to
      // bounce off of.
      expect((controller as any).currentActionMode).toBeNull();
      expect((controller as any).actionSteps).toEqual([]);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "ui:notification",
        expect.stringContaining("out of sync")
      );
    });

    it("resets local state when a stale cancel-action is rejected (the action was actually still committed)", async () => {
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "move",
        playerId: "p1",
      });
      expect((controller as any).currentActionMode).toBe("move");

      // Go through the real optimistic cancel path (as an online guest's
      // "Back" button does) so onCancelAction records the pending-cancel
      // baseline onNetworkCommandRejected checks against.
      mockGameService.cancelAction.mockReturnValue(true);
      (controller as any).onCancelAction();
      expect((controller as any).currentActionMode).toBeNull();

      // ...the host's real (late) verdict: the cancel was actually refused.
      (controller as any).onNetworkCommandRejected({
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      expect((controller as any).currentActionMode).toBeNull();
      expect((controller as any).actionSteps).toEqual([]);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "ui:notification",
        expect.stringContaining("out of sync")
      );
    });

    it("does NOT reconcile a stale cancel-action rejection once the coach has moved on to a different action for the same player", async () => {
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "move",
        playerId: "p1",
      });

      // Optimistic cancel (e.g. a mis-click on "Back")...
      mockGameService.cancelAction.mockReturnValue(true);
      (controller as any).onCancelAction();
      expect((controller as any).currentActionMode).toBeNull();

      // ...but before the host's rejection round-trips back, the coach
      // declares a brand new action for the same player.
      await (controller as any).onActionSelected({
        action: "blitz",
        playerId: "p1",
      });
      expect((controller as any).currentActionMode).toBe("blitz");

      // The stale rejection for the FIRST cancel now arrives late. It must
      // not clobber the newer Blitz declaration the coach has since made —
      // that would itself be a stale-response-resets-newer-state desync.
      (controller as any).onNetworkCommandRejected({
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      expect((controller as any).currentActionMode).toBe("blitz");
    });

    it("does NOT reconcile a stale cancel-action rejection once the coach has deselected and reselected the player", async () => {
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "move",
        playerId: "p1",
      });

      mockGameService.cancelAction.mockReturnValue(true);
      (controller as any).onCancelAction();

      // The coach moves on entirely: deselects, then selects the same
      // player fresh (a legitimate new interaction, not a continuation of
      // the earlier cancel).
      controller.deselectPlayer();
      controller.selectPlayer("p1");
      const notificationCallsBefore = (
        mockEventBus.emit as ReturnType<typeof vi.fn>
      ).mock.calls.filter(
        (call) =>
          call[0] === "ui:notification" &&
          typeof call[1] === "string" &&
          call[1].includes("out of sync")
      ).length;

      (controller as any).onNetworkCommandRejected({
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      const notificationCallsAfter = (
        mockEventBus.emit as ReturnType<typeof vi.fn>
      ).mock.calls.filter(
        (call) =>
          call[0] === "ui:notification" &&
          typeof call[1] === "string" &&
          call[1].includes("out of sync")
      ).length;
      // No new "out of sync" reconciliation fired for the stale cancel.
      expect(notificationCallsAfter).toBe(notificationCallsBefore);
    });

    it("ignores a rejection for a command that is not the current optimistic state", async () => {
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "move",
        playerId: "p1",
      });
      expect((controller as any).currentActionMode).toBe("move");

      // A stale rejection arriving for a DIFFERENT declared action (e.g. one
      // already superseded locally) must not clobber current state.
      (controller as any).onNetworkCommandRejected({
        commandType: "declare-action",
        playerId: "p1",
        action: "blitz",
        reason: "command-failed: illegal-action-declaration",
      });
      expect((controller as any).currentActionMode).toBe("move");
    });

    it("ignores a rejection for a different player than the one currently selected", async () => {
      controller.selectPlayer("p1");
      await (controller as any).onActionSelected({
        action: "move",
        playerId: "p1",
      });

      (controller as any).onNetworkCommandRejected({
        commandType: "cancel-action",
        playerId: "some-other-player",
        reason: "command-failed: action-already-committed",
      });
      expect((controller as any).currentActionMode).toBe("move");
    });
  });
});
