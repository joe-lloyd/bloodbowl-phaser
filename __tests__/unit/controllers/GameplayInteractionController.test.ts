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
  getPassController: vi.fn().mockReturnValue({
    getAllRanges: vi.fn().mockReturnValue(new Map()),
    measureRange: vi.fn().mockReturnValue({ type: "Quick Pass", modifier: 0 }),
  }),
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
      (controller as any).onSquareClicked(targetX, targetY);

      // Expect findPath called
      expect(mockMovementValidator.findPath).toHaveBeenCalled();

      // Expect waypoint added -> drawCurrentPath called -> drawMovementPath called
      expect(mockPitch.drawMovementPath).toHaveBeenCalled();
    });

    it("should execute move and deselect if player has acted", async () => {
      // Mock hasPlayerActed to true (turn ended for player)
      mockGameService.hasPlayerActed.mockReturnValue(true);

      // 1. Add Waypoint
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5); // Add

      // 2. Click Same Spot (Confirm)
      (controller as any).onSquareClicked(6, 5); // Confirm

      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      // Wait for promise chain resolution
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).toHaveBeenCalled(); // Deselects after move
    });

    it("should execute move and KEEP player selected if player has NOT acted (partial move)", async () => {
      // Mock hasPlayerActed to false (partial move)
      mockGameService.hasPlayerActed.mockReturnValue(false);

      // 1. Add Waypoint
      mockMovementValidator.findPath.mockReturnValue({
        valid: true,
        path: [{ x: 6, y: 5 }],
        rolls: [],
      });
      (controller as any).onSquareClicked(6, 5); // Add

      // 2. Click Same Spot (Confirm)
      (controller as any).onSquareClicked(6, 5); // Confirm

      expect(mockGameService.movePlayer).toHaveBeenCalledWith("p1", [
        { x: 6, y: 5 },
      ]);

      // Wait for promise chain resolution
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockScene.unhighlightPlayer).not.toHaveBeenCalled(); // Should NOT deselect
      expect(mockScene.highlightPlayer).toHaveBeenCalled(); // Should refresh highlight
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
});
