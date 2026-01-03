import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../../src/services/GameService.js";
import { IGameService } from "../../../src/services/interfaces/IGameService.js";
import { EventBus } from "../../../src/services/EventBus.js";
import { TeamBuilder } from "../../utils/test-builders.js";
import { GamePhase } from "../../../src/types/GameState.js";

describe("GameService", () => {
  let gameService: IGameService;
  let eventBus: EventBus;
  let team1: any;
  let team2: any;
  let mockRngService: any;
  let mockBlockResolutionService: any;

  beforeEach(() => {
    eventBus = new EventBus();

    team1 = new TeamBuilder()
      .withId("team-1")
      .withName("Team 1")
      .withPlayers(7)
      .build();

    team2 = new TeamBuilder()
      .withId("team-2")
      .withName("Team 2")
      .withPlayers(7)
      .build();

    mockRngService = {
      rollDie: vi.fn().mockReturnValue(1),
      rollMultipleDice: vi
        .fn()
        .mockImplementation((count) => Array(count).fill(1)),
      getSeed: vi.fn().mockReturnValue(12345),
    };

    mockBlockResolutionService = {
      rollBlockDice: vi.fn().mockReturnValue([]),
      getValidPushDirections: vi.fn().mockReturnValue([]),
      allowsFollowUp: vi.fn().mockReturnValue(true),
    } as any;

    gameService = new GameService(
      eventBus,
      team1,
      team2,
      mockRngService,
      mockBlockResolutionService
    );

    // Fix: Transition to SETUP phase explicitly
    gameService.startSetup();
  });

  describe("Initialization", () => {
    it("should start in SETUP phase", () => {
      expect(gameService.getPhase()).toBe(GamePhase.SETUP);
    });

    it("should have no active team initially", () => {
      expect(gameService.getActiveTeamId()).toBeNull();
    });
  });

  describe("Setup Phase - Player Placement", () => {
    it("should allow placing team 1 players in their zone (x: 0-5)", () => {
      const playerId = team1.players[0].id;
      const result = gameService.placePlayer(playerId, 2, 5);

      expect(result).toBe(true);
    });

    it("should not allow placing team 1 player in team 2 zone", () => {
      const playerId = team1.players[0].id;
      const result = gameService.placePlayer(playerId, 15, 5);

      expect(result).toBe(false);
    });
  });

  describe("Game Phase - Turn Management", () => {
    beforeEach(() => {
      // Setup both teams
      team1.players.forEach((p: any, i: number) =>
        gameService.placePlayer(p.id, i % 6, Math.floor(i / 6))
      );
      team2.players.forEach((p: any, i: number) =>
        gameService.placePlayer(p.id, 14 + (i % 6), Math.floor(i / 6))
      );

      gameService.confirmSetup("team-1");
      gameService.confirmSetup("team-2");
      gameService.startGame("team-1");
    });

    it("should transition to PLAY phase when game starts", () => {
      expect(gameService.getPhase()).toBe(GamePhase.PLAY);
    });

    it("should switch teams on end turn", () => {
      const initiallyActive = gameService.getActiveTeamId();
      gameService.endTurn();
      expect(gameService.getActiveTeamId()).not.toBe(initiallyActive);
    });
  });
});
