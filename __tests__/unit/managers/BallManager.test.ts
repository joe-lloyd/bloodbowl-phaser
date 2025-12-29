import { describe, it, expect, beforeEach, vi } from "vitest";
import { BallManager } from "../../../src/game/managers/BallManager";
import { GameState, GamePhase, SubPhase } from "../../../src/types/GameState";
import { Team } from "../../../src/types/Team";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { WeatherManager } from "../../../src/game/managers/WeatherManager";
import { GameEventNames } from "../../../src/types/events";

describe("BallManager", () => {
  let manager: BallManager;
  let mockEventBus: any;
  let mockState: GameState;
  let mockTeam1: Team;
  let mockTeam2: Team;
  let mockWeatherManager: WeatherManager;
  let mockCallbacks: any;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };

    mockState = {
      ballPosition: null,
      phase: GamePhase.SETUP,
      subPhase: SubPhase.NONE,
    } as GameState;

    mockTeam1 = {
      id: "team1",
      players: [
        {
          id: "p1",
          teamId: "team1",
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
          gridPosition: { x: 6, y: 5 },
          stats: { AG: 3 },
          status: PlayerStatus.ACTIVE,
        } as Player,
      ],
    } as Team;

    mockWeatherManager = {
      rollWeather: vi.fn(),
    } as any;

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
      mockCallbacks
    );
  });

  describe("Kick Ball", () => {
    it("should transition to ROLL_KICKOFF phase", () => {
      manager.kickBall("p1", 10, 5);

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(
        GamePhase.KICKOFF,
        SubPhase.ROLL_KICKOFF
      );
    });

    it("should roll scatter direction and distance", () => {
      manager.kickBall("p1", 10, 5);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Kickoff Scatter",
          diceType: "d8",
        })
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Kickoff Scatter",
          diceType: "d6",
        })
      );
    });

    it("should update ball position", () => {
      manager.kickBall("p1", 10, 5);

      expect(mockState.ballPosition).toBeDefined();
      expect(mockState.ballPosition?.x).toBeDefined();
      expect(mockState.ballPosition?.y).toBeDefined();
    });

    it("should emit BallKicked event", () => {
      manager.kickBall("p1", 10, 5);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.BallKicked,
        expect.objectContaining({
          playerId: "p1",
          targetX: 10,
          targetY: 5,
        })
      );
    });
  });

  describe("Roll Kickoff", () => {
    it("should transition to RESOLVE_KICKOFF phase", () => {
      manager.rollKickoff();

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(
        GamePhase.KICKOFF,
        SubPhase.RESOLVE_KICKOFF
      );
    });

    it("should roll 2d6 for kickoff event", () => {
      manager.rollKickoff();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Kickoff Event",
          diceType: "2d6",
        })
      );
    });

    it("should emit KickoffResult event", () => {
      manager.rollKickoff();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.KickoffResult,
        expect.objectContaining({
          roll: expect.any(Number),
          event: expect.any(String),
        })
      );
    });

    it("should call weather manager on Changing Weather (roll 7)", () => {
      const randomMock = vi.spyOn(Math, "random");
      randomMock.mockReturnValueOnce(2 / 6); // First die: 3
      randomMock.mockReturnValueOnce(3 / 6); // Second die: 4 (total = 7)

      manager.rollKickoff();

      expect(mockWeatherManager.rollWeather).toHaveBeenCalled();
    });
  });

  describe("Attempt Pickup", () => {
    it("should succeed when roll meets AG target", () => {
      vi.spyOn(Math, "random").mockReturnValue(2.5 / 6); // Roll 3 (just meets AG 3+)
      const player = mockTeam1.players[0];
      player.stats.AG = 3;

      const result = manager.attemptPickup(player, { x: 10, y: 10 }); // Away from tackle zones

      expect(result).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.BallPickup,
        expect.objectContaining({
          success: true,
        })
      );
    });

    it("should fail when roll is below target", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Roll 1
      const player = mockTeam1.players[0];
      player.stats.AG = 3;

      const result = manager.attemptPickup(player, { x: 5, y: 5 });

      expect(result).toBe(false);
      expect(mockCallbacks.onTurnover).toHaveBeenCalledWith("Failed Pickup");
    });

    it("should apply -1 per tackle zone", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      const player = mockTeam1.players[0];
      player.stats.AG = 3;

      // Team2 player is adjacent (tackle zone)
      const result = manager.attemptPickup(player, { x: 5, y: 5 });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          description: expect.stringContaining("Mod: -1"),
        })
      );
    });

    it("should always fail on natural 1", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Roll 1
      const player = mockTeam1.players[0];
      player.stats.AG = 2; // Easy target

      const result = manager.attemptPickup(player, { x: 10, y: 10 });

      expect(result).toBe(false);
    });

    it("should always succeed on natural 6", () => {
      vi.spyOn(Math, "random").mockReturnValue(5 / 6); // Roll 6
      const player = mockTeam1.players[0];
      player.stats.AG = 6; // Hard target

      const result = manager.attemptPickup(player, { x: 5, y: 5 });

      expect(result).toBe(true);
    });

    it("should emit dice roll event", () => {
      vi.spyOn(Math, "random").mockReturnValue(2 / 6); // Roll 3
      const player = mockTeam1.players[0];

      manager.attemptPickup(player, { x: 5, y: 5 });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Agility (Pickup)",
          diceType: "d6",
        })
      );
    });
  });
});
