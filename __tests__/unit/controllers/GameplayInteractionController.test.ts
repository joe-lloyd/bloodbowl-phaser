import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, GameState } from "../../../src/types/GameState"; // Adjust path if needed

// Mock dependencies
const mockScene = {
  highlightPlayer: vi.fn(),
  unhighlightPlayer: vi.fn(),
  add: {
    rectangle: vi.fn(),
    container: vi.fn(),
  },
};

const mockPitch = {
  getContainer: vi.fn(() => ({ x: 0, y: 0 })),
  highlightHoverSquare: vi.fn(),
  highlightSquare: vi.fn(),
  drawRangeOverlay: vi.fn(),
  drawTackleZones: vi.fn(),
  drawMovementPath: vi.fn(),
  drawSprintRisks: vi.fn(),
  clearPath: vi.fn(),
  clearHighlights: vi.fn(),
  clearHover: vi.fn(),
  clearPassVisualization: vi.fn(),
  drawPassZones: vi.fn(),
  drawPassLine: vi.fn(),
};

const mockMovementValidator = {
  findPath: vi.fn(),
  analyzePath: vi.fn().mockReturnValue({ requiresDodge: false }),
};

const mockEventBus = {
  on: vi.fn(),
  emit: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  listenerCount: vi.fn(),
};

const mockGameService = {
  getState: vi.fn(),
  getPlayerById: vi.fn(),
  getAvailableMovements: vi.fn(),
  getMovementUsed: vi.fn().mockReturnValue(0),
  movePlayer: vi.fn().mockResolvedValue(true),
  getPhase: vi.fn().mockReturnValue(GamePhase.PLAY),
  canActivate: vi.fn().mockReturnValue(true),
  standUp: vi.fn(),
  finishActivation: vi.fn(),
  declareAction: vi.fn(),
  previewBlock: vi.fn(),
  hasPlayerActed: vi.fn(),
  getSubPhase: vi.fn(),
  selectKicker: vi.fn(),
  kickBall: vi.fn(),
  executePush: vi.fn(),
  throwBall: vi.fn(),
};

describe("GameplayInteractionController", () => {
  let controller: GameplayInteractionController;

  const team1Id = "team1";
  const team2Id = "team2";

  const player1 = {
    id: "p1",
    teamId: team1Id,
    gridPosition: { x: 5, y: 5 },
    stats: { MA: 6 },
    status: "Active",
  };
  const player2 = {
    id: "p2",
    teamId: team2Id,
    gridPosition: { x: 6, y: 6 },
    stats: { MA: 6 },
    status: "Active",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default scene mock for teams (as the controller accesses them directly in a temporary hack)
    mockScene.team1 = {
      id: team1Id,
      players: [player1],
      colors: { primary: 0xff0000 },
    };
    mockScene.team2 = {
      id: team2Id,
      players: [player2],
      colors: { primary: 0x0000ff },
    };

    controller = new GameplayInteractionController(
      mockScene,
      mockGameService,
      mockEventBus,
      mockPitch,
      mockMovementValidator
    );
  });

  describe("Player Selection", () => {
    it("should select player and show visuals if it is their turn", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);

      controller.selectPlayer("p1");

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(mockPitch.drawRangeOverlay).toHaveBeenCalled();
      expect(mockPitch.drawTackleZones).toHaveBeenCalled();
      // Expect overlays since it IS own turn
    });

    it("should select player but NOT show movement visuals if NOT their turn", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team2Id,
      } as GameState); // Team 2 is active
      mockGameService.getPlayerById.mockReturnValue(player1); // Selecting Team 1 player

      controller.selectPlayer("p1");

      expect(mockScene.highlightPlayer).toHaveBeenCalledWith("p1");
      expect(mockPitch.drawRangeOverlay).not.toHaveBeenCalled(); // Should NOT show ranges
    });
  });

  describe("Movement Planning (Waypoints)", () => {
    beforeEach(() => {
      // Setup active turn and select player
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);

      controller.selectPlayer("p1");
    });

    it("should add a waypoint when clicking an empty square", () => {
      const targetX = 6;
      const targetY = 5;

      // Mock Pathfinder Result
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: targetX, y: targetY }],
        rolls: [],
      });

      // Simulate Click
      controller.onSquareClicked(targetX, targetY);

      // Expect findPath called
      expect(mockMovementValidator.findPath).toHaveBeenCalled();

      // Expect waypoint added -> drawCurrentPath called -> drawMovementPath called
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
    });

    it("should execute move when clicking the last waypoint", async () => {
      // 1. Add Waypoint
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      controller.onSquareClicked(6, 5); // Add

      // 2. Click Same Spot (Confirm)
      controller.onSquareClicked(6, 5); // Confirm

      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      // Wait for promise chain resolution
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).toHaveBeenCalled(); // Deselects after move
    });
  });

  describe("Pass Action Stepper Logic", () => {
    beforeEach(async () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
      mockGameService.declareAction.mockReturnValue(true);

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

      controller.onSquareClicked(6, 5); // Add waypoint
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
      expect(mockGameService.throwBall).not.toHaveBeenCalled();
    });

    it("should switch to 'pass' step and show pass visuals", () => {
      // Switch step
      (controller as any).onStepSelected({ stepId: "pass" });

      // Hovering should now trigger pass visualization
      controller.onSquareHovered(7, 5);
      expect(mockPitch.drawPassZones).toHaveBeenCalled();
      expect(mockPitch.drawPassLine).toHaveBeenCalled();
      expect(mockPitch.drawMovementPath).not.toHaveBeenCalled();
    });

    it("should execute throw when clicking in 'pass' step", () => {
      // Switch to pass
      (controller as any).onStepSelected({ stepId: "pass" });

      // Click target
      controller.onSquareClicked(10, 5);
      expect(mockGameService.throwBall).toHaveBeenCalledWith("p1", 10, 5);
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
      controller.onSquareClicked(6, 5);
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
      expect(mockGameService.throwBall).not.toHaveBeenCalled();
    });

    it("should ignore invalid steps", () => {
      // Try to switch to invalid step
      (controller as any).onStepSelected({ stepId: "invalid_step" });

      // Should remain in 'move'
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
      });
      controller.onSquareClicked(6, 5);
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
    });
  });
});
