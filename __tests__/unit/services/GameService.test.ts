import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../../src/services/GameService.js";
import { IGameService } from "../../../src/services/interfaces/IGameService.js";
import { EventBus } from "../../../src/services/EventBus.js";
import { TeamBuilder } from "../../utils/test-builders.js";
import { GamePhase } from "../../../src/types/GameState.js";
import { GameEventNames } from "../../../src/types/events.js";

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
    beforeEach(() => {
      gameService.startSetup("team-1");
    });

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

  describe("Full time announcement", () => {
    const notificationsOf = () => {
      const notifications: string[] = [];
      eventBus.on(GameEventNames.UI_Notification, (msg) =>
        notifications.push(msg as string)
      );
      const gameLog: string[] = [];
      eventBus.on(GameEventNames.UI_GameLog, (msg) => gameLog.push(msg));
      return { notifications, gameLog };
    };

    it("announces the played score and winner on screen and in the match log", () => {
      const { notifications, gameLog } = notificationsOf();
      gameService.getState().score["team-1"] = 2;
      gameService.getState().score["team-2"] = 1;

      eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.GAME_OVER,
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toContain("Team 1");
      expect(notifications[0]).toContain("2");
      expect(notifications[0]).toContain("1");
      expect(notifications[0]).toContain("win");
      expect(gameLog).toEqual(notifications);
    });

    it("announces a draw when scores are level", () => {
      const { notifications } = notificationsOf();
      gameService.getState().score["team-1"] = 1;
      gameService.getState().score["team-2"] = 1;

      eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.GAME_OVER,
      });

      expect(notifications[0].toLowerCase()).toContain("draw");
    });

    it("labels a concession by the conceding team without inventing a score", () => {
      const { notifications } = notificationsOf();
      // A concession never touches the played score — it stays 0-0.
      gameService.getState().result = {
        reason: "concession",
        concedingTeamId: "team-1",
      };

      eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.GAME_OVER,
      });

      expect(notifications[0]).toContain("0 : 0");
      expect(notifications[0]).toContain("Team 1 conceded");
    });
  });
});
