import { describe, it, expect, beforeEach, vi } from "vitest";
import { TurnManager } from "../../../src/game/managers/TurnManager";
import { GameState, GamePhase, SubPhase } from "../../../src/types/GameState";
import { Team } from "../../../src/types/Team";
import { GameEventNames } from "../../../src/types/events";

describe("TurnManager", () => {
  let manager: TurnManager;
  let mockEventBus;
  let mockState: GameState;
  let mockTeam1: Team;
  let mockTeam2: Team;
  let mockCallbacks;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    mockState = {
      phase: GamePhase.SETUP,
      subPhase: SubPhase.NONE,
      activeTeamId: null,
      turn: {
        teamId: "",
        turnNumber: 0,
        isHalf2: false,
        activatedPlayerIds: new Set(),
        hasBlitzed: false,
        hasPassed: false,
        hasHandedOff: false,
        hasFouled: false,
        movementUsed: new Map(),
      },
    } as GameState;

    mockTeam1 = {
      id: "team1",
      players: [],
    } as Team;

    mockTeam2 = {
      id: "team2",
      players: [],
    } as Team;

    mockCallbacks = {
      onPhaseChanged: vi.fn(),
    };

    manager = new TurnManager(
      mockEventBus,
      mockState,
      mockTeam1,
      mockTeam2,
      mockCallbacks
    );
  });

  describe("Start Game", () => {
    it("should set phase to PLAY", () => {
      manager.startGame("team1");

      expect(mockState.phase).toBe(GamePhase.PLAY);
    });

    it("should set receiving team as active", () => {
      manager.startGame("team1"); // Team1 kicks

      expect(mockState.activeTeamId).toBe("team2"); // Team2 receives
    });

    it("should set kicking team as active", () => {
      manager.startGame("team2"); // Team2 kicks

      expect(mockState.activeTeamId).toBe("team1"); // Team1 receives
    });

    it("should emit TurnStarted event", () => {
      manager.startGame("team1");

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.TurnStarted,
        expect.any(Object)
      );
    });

    it("should call onPhaseChanged callback", () => {
      manager.startGame("team1");

      expect(mockCallbacks.onPhaseChanged).toHaveBeenCalledWith(
        GamePhase.PLAY,
        expect.any(String)
      );
    });
  });

  describe("Start Turn", () => {
    it("should set active team", () => {
      manager.startTurn("team1");

      expect(mockState.activeTeamId).toBe("team1");
    });

    it("should increment turn counter", () => {
      manager.startTurn("team1");
      expect(manager.getTurnNumber("team1")).toBe(1);

      manager.startTurn("team1");
      expect(manager.getTurnNumber("team1")).toBe(2);
    });

    it("should reset turn state", () => {
      manager.startTurn("team1");

      expect(mockState.turn.hasBlitzed).toBe(false);
      expect(mockState.turn.hasPassed).toBe(false);
      expect(mockState.turn.hasFouled).toBe(false);
      expect(mockState.turn.activatedPlayerIds.size).toBe(0);
    });

    it("should emit TurnStarted event", () => {
      manager.startTurn("team1");

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.TurnStarted,
        expect.objectContaining({
          teamId: "team1",
          turnNumber: 1,
        })
      );
    });

    it("should set correct sub-phase for kicking team", () => {
      manager.setDriveKickingTeam("team1");
      manager.startTurn("team1");

      expect(mockState.subPhase).toBe(SubPhase.TURN_KICKING);
    });

    it("should set correct sub-phase for receiving team", () => {
      manager.setDriveKickingTeam("team1");
      manager.startTurn("team2");

      expect(mockState.subPhase).toBe(SubPhase.TURN_RECEIVING);
    });
  });

  describe("End Turn", () => {
    it("should switch to other team", () => {
      mockState.activeTeamId = "team1";

      manager.endTurn();

      expect(mockState.activeTeamId).toBe("team2");
    });

    it("should end half after 6 turns per team", () => {
      // Simulate 6 turns for each team
      for (let i = 0; i < 6; i++) {
        manager.startTurn("team1");
        manager.startTurn("team2");
      }

      manager.endTurn();

      expect(mockState.phase).toBe(GamePhase.HALFTIME);
    });

    it("should call onPhaseChanged on half-time", () => {
      // Simulate 6 turns for each team
      for (let i = 0; i < 6; i++) {
        manager.startTurn("team1");
        manager.startTurn("team2");
      }

      manager.endTurn();

      expect(mockCallbacks.onPhaseChanged).toHaveBeenCalledWith(
        GamePhase.HALFTIME
      );
    });
  });

  describe("Finish Activation", () => {
    it("should mark player as activated", () => {
      mockState.phase = GamePhase.PLAY;
      mockState.turn.activatedPlayerIds = new Set();

      manager.finishActivation("p1");

      expect(mockState.turn.activatedPlayerIds.has("p1")).toBe(true);
    });

    it("should emit PlayerActivated event", () => {
      mockState.phase = GamePhase.PLAY;
      mockState.turn.activatedPlayerIds = new Set();

      manager.finishActivation("p1");

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.PlayerActivated,
        "p1"
      );
    });

    it("should not activate same player twice", () => {
      mockState.phase = GamePhase.PLAY;
      mockState.turn.activatedPlayerIds = new Set();

      manager.finishActivation("p1");
      const emitCallCount = mockEventBus.emit.mock.calls.length;

      manager.finishActivation("p1");

      expect(mockEventBus.emit).toHaveBeenCalledTimes(emitCallCount); // No new call
    });
  });

  describe("Check Turnover", () => {
    it("should emit Turnover events", () => {
      mockState.activeTeamId = "team1";

      manager.checkTurnover("Failed Dodge");

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.UI_Turnover,
        expect.objectContaining({
          teamId: "team1",
          reason: "Failed Dodge",
        })
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.Turnover,
        expect.objectContaining({
          teamId: "team1",
        })
      );
    });
  });

  describe("Turn Counter", () => {
    it("should track turns per team independently", () => {
      manager.startTurn("team1");
      manager.startTurn("team2");
      manager.startTurn("team1");

      expect(manager.getTurnNumber("team1")).toBe(2);
      expect(manager.getTurnNumber("team2")).toBe(1);
    });

    it("should reset turn counters", () => {
      manager.startTurn("team1");
      manager.startTurn("team2");

      manager.reset();

      expect(manager.getTurnNumber("team1")).toBe(0);
      expect(manager.getTurnNumber("team2")).toBe(0);
    });
  });

  describe("Drive Kicking Team", () => {
    it("should set and get kicking team", () => {
      manager.setDriveKickingTeam("team1");

      expect(manager.getDriveKickingTeamId()).toBe("team1");
    });

    it("should reset kicking team on reset", () => {
      manager.setDriveKickingTeam("team1");
      manager.reset();

      expect(manager.getDriveKickingTeamId()).toBeNull();
    });
  });
});
