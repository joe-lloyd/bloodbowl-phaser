import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { TurnManager } from "../../../src/game/managers/TurnManager";
import {
  type GameState,
  GamePhase,
  SubPhase,
} from "../../../src/types/GameState";
import { type Team } from "../../../src/types/Team";
import { GameEventNames } from "../../../src/types/events";
import { createInitialState } from "../../../src/services/gameService/matchStart";
import { busWith, teamWith } from "../controllers/controllerFixtures";
import { seatTeams } from "../../../src/game/seating";
import { activeLayout } from "../../../src/game/variants/activeMatch";

const noop = () => {};

describe("TurnManager", () => {
  let manager: TurnManager;
  let mockEventBus: ReturnType<typeof busWith>;
  let mockState: GameState;
  let mockTeam1: Team;
  let mockTeam2: Team;
  let mockCallbacks: {
    onPhaseChanged: Mock<[phase: GamePhase, subPhase?: SubPhase], void>;
  };

  beforeEach(() => {
    mockEventBus = busWith();

    mockTeam1 = teamWith({ id: "team1", players: [] });
    mockTeam2 = teamWith({ id: "team2", players: [] });

    mockState = createInitialState({
      team1: mockTeam1,
      team2: mockTeam2,
      startingPhase: GamePhase.SETUP,
    });

    mockCallbacks = {
      onPhaseChanged: vi.fn<[phase: GamePhase, subPhase?: SubPhase], void>(),
    };

    manager = new TurnManager(
      mockEventBus,
      mockState,
      seatTeams([mockTeam1, mockTeam2], activeLayout()),
      mockCallbacks
    );
  });

  describe("Start Game", () => {
    it("should set phase to PLAY", () => {
      manager.startGame("team1");

      expect(mockState.phase).toBe(GamePhase.PLAY);
    });

    it("should set receiving team as active", () => {
      manager.startGame("team1");

      expect(mockState.activeTeamId).toBe("team2");
    });

    it("should set kicking team as active", () => {
      manager.startGame("team2");

      expect(mockState.activeTeamId).toBe("team1");
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

      expect(mockState.turn.spend.blitzed).toHaveLength(0);
      expect(mockState.turn.spend.passes).toBe(0);
      expect(mockState.turn.spend.fouled).toHaveLength(0);
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
      for (let i = 0; i < 6; i++) {
        manager.startTurn("team1");
        manager.startTurn("team2");
      }

      manager.endTurn();

      expect(mockState.phase).toBe(GamePhase.HALFTIME);
    });

    it("should call onPhaseChanged on half-time", () => {
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

      expect(mockEventBus.emit).toHaveBeenCalledTimes(emitCallCount);
    });
  });

  describe("Automatic end of turn", () => {
    it("does not end the next team's turn when the coach presses End Turn first", async () => {
      let autoEnd: () => void = noop;
      const manual = new TurnManager(
        mockEventBus,
        mockState,
        seatTeams([mockTeam1, mockTeam2], activeLayout()),
        mockCallbacks,
        (ms) =>
          new Promise<void>(ms === 500 ? (resolve) => (autoEnd = resolve) : () => {})
      );
      manual.startGame("team1");

      manual.finishActivation("p1");

      manual.endTurn();
      expect(mockState.activeTeamId).toBe("team1");

      autoEnd();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockState.activeTeamId).toBe("team1");
    });
  });

  describe("Check Turnover", () => {
    it("emits Turnover and hands back the banner for later", () => {
      mockState.activeTeamId = "team1";

      expect(manager.checkTurnover("Failed Dodge")).toEqual(
        expect.objectContaining({ teamId: "team1", reason: "Failed Dodge" })
      );
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(
        GameEventNames.UI_Turnover,
        expect.anything()
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
