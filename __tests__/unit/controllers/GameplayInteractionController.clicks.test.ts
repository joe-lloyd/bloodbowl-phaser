import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase } from "../../../src/types/GameState";
import { PlayerStatus } from "../../../src/types/Player";
import {
  mockScene,
  mockEventBus,
  mockGameService,
  answerStepPrompt,
  player1,
  createController,
} from "./GameplayInteractionController.setup";

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    controller = createController();
  });

  describe("Player Click Handling", () => {
    it("should redirect to onSquareClicked if in Pass Mode and clicking a player", () => {
      controller["currentActionMode"] = "pass";
      controller["currentStepId"] = "pass";

      const mockPlayer = {
        id: "p2",
        gridPosition: { x: 5, y: 5 },
        teamId: "t2",
      };
      (controller as any).scene.team1.players = [];
      (controller as any).scene.team2.players = [mockPlayer];

      const spy = vi.spyOn(controller as any, "onSquareClicked");

      controller.handlePlayerClick("p2");

      expect(spy).toHaveBeenCalledWith(5, 5);
    });

    it("should complete a hand-off (not reselect) when clicking the target team-mate", () => {
      // Regression: a pending hand-off used to reselect the clicked team-mate
      // instead of completing the action.
      controller["currentActionMode"] = "handoff";
      controller["currentStepId"] = "handoff";
      controller["selectedPlayerId"] = "p1";

      const teammate = {
        id: "p3",
        gridPosition: { x: 6, y: 5 },
        teamId: "team1",
        status: "Active",
      };
      (controller as any).scene.team1.players = [teammate];
      (controller as any).scene.team2.players = [];
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        id === "p1"
          ? {
              id: "p1",
              teamId: "team1",
              gridPosition: { x: 5, y: 5 },
              status: "Active",
              skills: [],
            }
          : id === "p3"
            ? teammate
            : null
      );
      (controller as any).getPlayerAt = vi.fn().mockReturnValue(teammate);

      const selectSpy = vi.spyOn(controller, "selectPlayer");

      controller.handlePlayerClick("p3");

      // Hand-off resolves through handOffBall by target id; no reselection.
      expect(mockGameService.handOffBall).toHaveBeenCalledWith("p1", "p3");
      expect(mockGameService.throwBall).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it("should execute the hand-off when clicking a square in the 'handoff' step", () => {
      controller["currentActionMode"] = "handoff";
      controller["currentStepId"] = "handoff";
      controller["selectedPlayerId"] = "p1";
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        id === "p1"
          ? {
              id: "p1",
              teamId: "team1",
              gridPosition: { x: 5, y: 5 },
              status: "Active",
              skills: [],
            }
          : null
      );
      (controller as any).getPlayerAt = vi.fn().mockReturnValue({
        id: "p3",
        teamId: "team1",
        gridPosition: { x: 6, y: 5 },
        status: "Active",
      });

      (controller as any).onSquareClicked(6, 5);

      expect(mockGameService.handOffBall).toHaveBeenCalledWith("p1", "p3");
      expect(mockGameService.throwBall).not.toHaveBeenCalled();
    });

    it("should refuse a hand-off click on an illegal (Distracted) target without throwing", () => {
      controller["currentActionMode"] = "handoff";
      controller["currentStepId"] = "handoff";
      controller["selectedPlayerId"] = "p1";
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getPlayerById.mockImplementation((id: string) =>
        id === "p1"
          ? {
              id: "p1",
              teamId: "team1",
              gridPosition: { x: 5, y: 5 },
              status: "Active",
              skills: [],
            }
          : null
      );
      (controller as any).getPlayerAt = vi.fn().mockReturnValue({
        id: "p3",
        teamId: "team1",
        gridPosition: { x: 6, y: 5 },
        status: "Active",
        conditions: [{ type: "Distracted" }],
      });

      (controller as any).onSquareClicked(6, 5);

      expect(mockGameService.handOffBall).not.toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        "ui:notification",
        expect.stringContaining("Tackle Zone")
      );
    });

    it("should select player normally if not in Pass Mode", () => {
      controller["currentActionMode"] = null;

      // Mock player with stats for refreshPlayerVisualization
      mockGameService.getPlayerById.mockReturnValue({
        id: "p1",
        teamId: "team1",
        stats: { MA: 6, ST: 3, AG: 3, AV: 8 },
        status: "Active",
      });
      mockGameService.canActivate.mockReturnValue(true);
      mockGameService.getState.mockReturnValue({ activeTeamId: "team1" });

      const spy = vi.spyOn(controller, "selectPlayer");

      controller.handlePlayerClick("p1");

      expect(spy).toHaveBeenCalledWith("p1");
    });
  });

  describe("Foul target highlight timing", () => {
    // Regression: foulPlayer() only queues FoulOperation on GameService's
    // GameFlowManager (fire-and-forget) — the old code deselected right
    // after that resolved, clearing the red target highlight well before the
    // foul's KO/Casualty/Send-Off consequence had actually finished. The fix
    // awaits GameFlowManager.whenIdle() before deselecting.
    const target = {
      stats: { AV: 9 },
      skills: [],
      id: "p2",
      teamId: "team2",
      gridPosition: { x: 6, y: 5 },
      status: PlayerStatus.PRONE,
    };

    function armFoulClick() {
      controller["currentActionMode"] = "foul";
      controller["currentStepId"] = "foul";
      controller["selectedPlayerId"] = "p1";
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getState.mockReturnValue({ weather: "Nice" });
      (controller as any).getPlayerAt = vi.fn().mockReturnValue(target);
    }

    it("keeps the highlight while the flow queue is still draining", async () => {
      armFoulClick();
      let resolveIdle!: () => void;
      const idle = new Promise<void>((resolve) => {
        resolveIdle = resolve;
      });
      mockGameService.getFlowContext.mockReturnValue({
        flowManager: { whenIdle: () => idle },
      });

      const click = (controller as any).onSquareClicked(6, 5);
      await answerStepPrompt(true);

      // foulPlayer() itself has already resolved, but whenIdle() has not —
      // the KO/Casualty/Send-Off consequence is still "in flight".
      await Promise.resolve();
      await Promise.resolve();
      expect(mockGameService.foulPlayer).toHaveBeenCalledWith("p1", 6, 5);
      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled();

      // The queue drains — resolution has actually completed.
      resolveIdle();
      await click;

      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("p1");
    });

    it("clears the highlight once the queue is already idle", async () => {
      armFoulClick();
      mockGameService.getFlowContext.mockReturnValue({
        flowManager: { whenIdle: vi.fn().mockResolvedValue(undefined) },
      });

      const click = (controller as any).onSquareClicked(6, 5);
      await answerStepPrompt(true);
      await click;

      expect(mockGameService.foulPlayer).toHaveBeenCalledWith("p1", 6, 5);
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("p1");
    });
  });
});
