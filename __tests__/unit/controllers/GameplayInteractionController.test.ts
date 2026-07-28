import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import { GamePhase, GameState } from "../../../src/types/GameState"; // Adjust path if needed
import { KickoffEvent } from "../../../src/game/kickoff/kickoffEvents";
import { PlayerStatus } from "../../../src/types/Player";

// Mock dependencies
const mockScene = {
  highlightPlayer: vi.fn(),
  unhighlightPlayer: vi.fn(),
  setKickoffSolidDefenceDragPlayers: vi.fn(),
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
  drawInterceptZone: vi.fn(),
  drawHandoffTargets: vi.fn(),
  clearLayer: vi.fn(),
};

const mockMovementValidator = {
  findPath: vi.fn(),
  analyzePath: vi.fn().mockReturnValue({ requiresDodge: false }),
  findReachableSquares: vi.fn().mockReturnValue([]),
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
  handOffBall: vi.fn(),
  getTeammates: vi.fn().mockReturnValue([]),
  isTouchbackPending: vi.fn().mockReturnValue(false),
  awardTouchback: vi.fn(),
  getKickoffEventStep: vi.fn().mockReturnValue(null),
  selectKickoffEventPlayer: vi.fn().mockReturnValue(true),
  moveKickoffEventPlayer: vi.fn().mockReturnValue(true),
  placeKickoffEventPlayer: vi.fn().mockReturnValue(true),
  getTeam: vi.fn(),
  getOpponents: vi.fn().mockReturnValue([]),
  getPassController: vi.fn().mockReturnValue({
    getAllRanges: vi.fn().mockReturnValue(new Map()),
    measureRange: vi.fn().mockReturnValue({ type: "Quick Pass", modifier: 0 }),
    getInterceptionSquares: vi.fn().mockReturnValue([]),
    checkInterceptions: vi.fn().mockReturnValue([]),
  }),
  foulPlayer: vi.fn().mockResolvedValue(undefined),
  // Default: the flow queue is already idle, so unrelated tests that never
  // touch the foul path see no delay. The foul-highlight tests below replace
  // this with a controllable promise.
  getFlowContext: vi.fn().mockReturnValue({
    flowManager: { whenIdle: vi.fn().mockResolvedValue(undefined) },
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
    mockGameService.getKickoffEventStep.mockReturnValue(null);
    mockGameService.selectKickoffEventPlayer.mockReturnValue(true);
    mockGameService.moveKickoffEventPlayer.mockReturnValue(true);
    mockGameService.placeKickoffEventPlayer.mockReturnValue(true);

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
    it("draws no tackle-zone squares for a Distracted opponent", () => {
      mockGameService.getState.mockReturnValue({
        activeTeamId: team1Id,
      } as GameState);
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getAvailableMovements.mockReturnValue([]);
      // player2 (the only opponent) is Distracted — still Standing, but
      // hasTackleZone must exclude them from the drawn overlay.
      mockScene.team2.players = [
        {
          ...player2,
          conditions: [{ type: "Distracted" }],
        },
      ];

      controller.selectPlayer("p1");

      expect(mockPitch.drawTackleZones).toHaveBeenCalledWith([]);
    });

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

      (controller as any).onNetworkCommandRejected({
        commandType: "cancel-action",
        playerId: "p1",
        reason: "command-failed: action-already-committed",
      });

      expect((controller as any).currentActionMode).toBeNull();
      expect((controller as any).actionSteps).toEqual([]);
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

      await (controller as any).onSquareClicked(6, 5);

      expect(mockGameService.foulPlayer).toHaveBeenCalledWith("p1", 6, 5);
      expect(mockScene.unhighlightPlayer).toHaveBeenCalledWith("p1");
    });
  });

  describe("Kickoff event pitch interaction", () => {
    it("enables Solid Defence dragging without selecting on click", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.SOLID_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [],
        movedPlayerIds: [],
        awaitingPlacement: [],
      });
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);
      mockScene.team2.players = [];

      (controller as any).syncKickoffStepInteraction();
      controller.handlePlayerClick(player1.id);

      expect(
        mockScene.setKickoffSolidDefenceDragPlayers
      ).toHaveBeenLastCalledWith([player1.id]);
      expect(mockGameService.selectKickoffEventPlayer).not.toHaveBeenCalled();
      expect(mockGameService.placeKickoffEventPlayer).not.toHaveBeenCalled();
    });

    it("does not use click-to-place during Solid Defence", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.SOLID_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [],
        movedPlayerIds: [],
        awaitingPlacement: [],
      });

      (controller as any).onSquareClicked(4, 4);

      expect(mockGameService.placeKickoffEventPlayer).not.toHaveBeenCalled();
      expect(mockGameService.selectKickoffEventPlayer).not.toHaveBeenCalled();
    });

    it("removes already-redeployed Solid Defence players from drag eligibility", () => {
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.SOLID_DEFENCE,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [player1.id],
        movedPlayerIds: [player1.id],
        awaitingPlacement: [],
      });
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      (controller as any).syncKickoffStepInteraction();

      expect(
        mockScene.setKickoffSolidDefenceDragPlayers
      ).toHaveBeenLastCalledWith([]);
      expect(mockScene.highlightPlayer).toHaveBeenCalledWith(
        player1.id,
        0xffd700
      );
    });

    it("places a High Kick receiver under the ball from one pitch click", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.HIGH_KICK,
        teamId: team2Id,
        selectionLimit: 1,
        selectedPlayerIds: [],
        movedPlayerIds: [],
        awaitingPlacement: [],
        landingSquare: { x: 12, y: 6 },
      });
      mockGameService.getPlayerById.mockReturnValue(player2);
      mockGameService.getTeam.mockReturnValue(mockScene.team2);

      controller.handlePlayerClick(player2.id);

      expect(mockGameService.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player2.id
      );
      expect(mockGameService.placeKickoffEventPlayer).toHaveBeenCalledWith(
        player2.id,
        12,
        6
      );
    });

    it("moves a selected Quick Snap player to an adjacent pitch square", () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.QUICK_SNAP,
        teamId: team1Id,
        selectionLimit: 2,
        selectedPlayerIds: [],
        movedPlayerIds: [],
        awaitingPlacement: [],
      });
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);

      controller.handlePlayerClick(player1.id);
      (controller as any).onSquareClicked(6, 5);

      expect(mockGameService.selectKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id
      );
      expect(mockGameService.moveKickoffEventPlayer).toHaveBeenCalledWith(
        player1.id,
        6,
        5
      );
    });

    it("lets an active Charge player use normal board actions", async () => {
      mockGameService.getPhase.mockReturnValue(GamePhase.KICKOFF);
      mockGameService.getKickoffEventStep.mockReturnValue({
        event: KickoffEvent.CHARGE,
        teamId: team1Id,
        selectionLimit: 1,
        selectedPlayerIds: [player1.id],
        movedPlayerIds: [],
        awaitingPlacement: [],
        charge: {
          queue: [],
          budget: { blitz: 1, throwTeammate: 1, kickTeammate: 1 },
          activePlayerId: player1.id,
          aborted: false,
        },
      });
      mockGameService.isTouchbackPending.mockReturnValue(false);
      mockGameService.getState.mockReturnValue({ activeTeamId: team1Id });
      mockGameService.getPlayerById.mockReturnValue(player1);
      mockGameService.declareAction.mockReturnValue(true);
      mockGameService.getTeam.mockReturnValue(mockScene.team1);
      (controller as any).selectedPlayerId = player1.id;

      await (controller as any).onActionSelected({
        playerId: player1.id,
        action: "move",
      });

      expect(mockGameService.declareAction).toHaveBeenCalledWith(
        player1.id,
        "move",
        undefined
      );
      expect((controller as any).currentActionMode).toBe("move");
    });
  });
});
