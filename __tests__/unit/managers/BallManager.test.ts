import { newKick } from "../../../src/game/kickoff/kickRecord";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { BallManager } from "../../../src/game/managers/BallManager";
import {
  type GameState,
  GamePhase,
  SubPhase,
} from "../../../src/types/GameState";
import { type Team } from "../../../src/types/Team";
import { type Player, PlayerStatus } from "../../../src/types/Player";

describe("BallManager", () => {
  let manager: BallManager;
  let mockEventBus: any;
  let mockState: GameState;
  let mockTeam1: Team;
  let mockTeam2: Team;
  let mockWeatherManager: any;
  let mockDiceController: any;
  let mockCallbacks: any;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    mockState = {
      ballPosition: null,
      phase: GamePhase.SETUP,
    } as GameState;

    mockTeam1 = {
      id: "team1",
      players: [
        {
          id: "p1",
          teamId: "team1",
          playerName: "P1",
          gridPosition: { x: 5, y: 5 },
          stats: { AG: 3 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ],
    } as Team;

    mockTeam2 = {
      id: "team2",
      players: [
        {
          id: "p2",
          teamId: "team2",
          playerName: "P2",
          gridPosition: { x: 6, y: 5 },
          stats: { AG: 3 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ],
    } as Team;

    mockWeatherManager = {
      rollWeather: vi.fn(),
    };

    mockDiceController = {
      rollD8: vi.fn().mockReturnValue(1),
      rollD6: vi.fn().mockReturnValue(3),
      roll2D6: vi.fn().mockReturnValue(7),
      rollLowerOf2D6: vi.fn().mockReturnValue(3),
      rollSkillCheck: vi.fn().mockReturnValue({ success: true, roll: 3 }),
    };

    mockCallbacks = {
      onTurnover: vi.fn(),
      onPhaseChange: vi.fn(),
      onBallPlaced: vi.fn(),
    };

    manager = new BallManager(
      mockEventBus,
      mockState,
      mockTeam1,
      mockTeam2,
      mockWeatherManager,
      mockDiceController,
      mockCallbacks
    );
  });

  describe("Kick Ball", () => {
    it("should transition to ROLL_KICKOFF phase", () => {
      manager.kickBall(true, "p1", 10, 5);

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(
        GamePhase.KICKOFF,
        SubPhase.ROLL_KICKOFF
      );
    });

    it("should roll scatter via DiceController", () => {
      manager.kickBall(true, "p1", 10, 5);

      expect(mockDiceController.rollD8).toHaveBeenCalled();
      expect(mockDiceController.rollLowerOf2D6).toHaveBeenCalled();
    });

    it("should update ball position", () => {
      manager.kickBall(true, "p1", 10, 5);

      expect(mockState.ballPosition).toBeDefined();
    });
  });

  describe("Kickoff Landing", () => {
    it("queues a normal bounce when the landing square is empty", async () => {
      const add = vi.fn();
      mockCallbacks.getFlowManager = () => ({ add });
      mockState.ballPosition = { x: 10, y: 10 };
      manager = new BallManager(
        mockEventBus,
        mockState,
        mockTeam1,
        mockTeam2,
        mockWeatherManager,
        mockDiceController,
        mockCallbacks,
        async () => {}
      );

      mockState.kick = newKick("team1", "placing");
      await manager.resumeKick();

      expect(add).toHaveBeenCalledTimes(1);
      expect(add.mock.calls[0][0].name).toBe("BounceOperation");
      expect(add.mock.calls[0][1]).toBe(true);
    });
  });

  describe("Attempt Pickup", () => {
    it("should succeed when roll meets AG target", () => {
      mockDiceController.rollD6.mockReturnValue(4);
      const player = mockTeam1.players[0];
      fixtureValue(player).stats.AG = 3;

      const result = manager.attemptPickup(fixtureValue(player), { x: 10, y: 10 });

      expect(result).toBe(true);
      expect(mockDiceController.rollD6).toHaveBeenCalled();
    });

    it("should fail and trigger turnover on natural 1", () => {
      mockDiceController.rollD6.mockReturnValue(1);
      const player = mockTeam1.players[0];

      const result = manager.attemptPickup(fixtureValue(player), { x: 5, y: 5 });

      expect(result).toBe(false);
      expect(mockCallbacks.onTurnover).toHaveBeenCalledWith("Failed Pickup");
    });
  });
});
