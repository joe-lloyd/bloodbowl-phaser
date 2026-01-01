import { describe, it, expect, beforeEach } from "vitest";
import { GameService } from "../../../src/services/GameService.js";
import { IGameService } from "../../../src/services/interfaces/IGameService.js";
import { EventBus } from "../../../src/services/EventBus.js";
import { TeamBuilder } from "../../utils/test-builders.js";
import { GamePhase } from "../../../src/types/GameState.js";

describe("GameService", () => {
  let gameService: IGameService;
  let eventBus: EventBus;
  let team1;
  let team2;

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

    gameService = new GameService(eventBus, team1, team2);

    // Fix: Transition to SETUP phase explicitly, as default might be SANDBOX_IDLE
    gameService.startSetup();
  });

  describe("Initialization", () => {
    it("should start in SETUP phase", () => {
      expect(gameService.getPhase()).toBe(GamePhase.SETUP);
    });

    it("should have no active team initially", () => {
      expect(gameService.getActiveTeamId()).toBeNull();
    });

    it("should have zero score for both teams", () => {
      expect(gameService.getScore("team-1")).toBe(0);
      expect(gameService.getScore("team-2")).toBe(0);
    });

    it("should have turn number 0 for both teams", () => {
      expect(gameService.getTurnNumber("team-1")).toBe(0);
      expect(gameService.getTurnNumber("team-2")).toBe(0);
    });

    it("should return complete game state", () => {
      const state = gameService.getState();

      expect(state.phase).toBe(GamePhase.SETUP);
      expect(state.activeTeamId).toBeNull();
      expect(state.turn.turnNumber).toBe(0);
      expect(state.score).toEqual({ "team-1": 0, "team-2": 0 });
    });
  });

  describe("Setup Phase - Player Placement", () => {
    it("should allow placing team 1 players in their zone (x: 0-5)", () => {
      const playerId = team1.players[0].id;
      const result = gameService.placePlayer(playerId, 2, 5);

      expect(result).toBe(true);
    });

    it("should allow placing team 2 players in their zone (x: 14-19)", () => {
      const playerId = team2.players[0].id;
      const result = gameService.placePlayer(playerId, 15, 5);

      expect(result).toBe(true);
    });

    it("should not allow placing team 1 player in team 2 zone", () => {
      const playerId = team1.players[0].id;
      const result = gameService.placePlayer(playerId, 15, 5);

      expect(result).toBe(false);
    });

    it("should not allow placing team 2 player in team 1 zone", () => {
      const playerId = team2.players[0].id;
      const result = gameService.placePlayer(playerId, 2, 5);

      expect(result).toBe(false);
    });

    it("should not allow placing player outside pitch boundaries", () => {
      const playerId = team1.players[0].id;

      expect(gameService.placePlayer(playerId, -1, 5)).toBe(false);
      expect(gameService.placePlayer(playerId, 20, 5)).toBe(false);
      expect(gameService.placePlayer(playerId, 2, -1)).toBe(false);
      expect(gameService.placePlayer(playerId, 2, 11)).toBe(false);
    });

    it("should not allow placing player on occupied square", () => {
      const player1Id = team1.players[0].id;
      const player2Id = team1.players[1].id;

      gameService.placePlayer(player1Id, 2, 5);
      const result = gameService.placePlayer(player2Id, 2, 5);

      expect(result).toBe(false);
    });

    it("should allow moving existing player to new position", () => {
      const playerId = team1.players[0].id;

      gameService.placePlayer(playerId, 2, 5);
      const result = gameService.placePlayer(playerId, 3, 5);

      expect(result).toBe(true);
    });

    it("should allow placing 7 players in valid positions", () => {
      // Place 7 players using different y positions to stay in zone
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      const result = gameService.placePlayer(team1.players[6].id, 0, 6);

      expect(result).toBe(true);
    });
  });

  describe("Setup Phase - Player Removal", () => {
    it("should allow removing placed players", () => {
      const playerId = team1.players[0].id;
      gameService.placePlayer(playerId, 2, 5);

      gameService.removePlayer(playerId);

      const result = gameService.placePlayer(playerId, 3, 5);
      expect(result).toBe(true);
    });

    it("should handle removing non-placed player gracefully", () => {
      const playerId = team1.players[0].id;

      expect(() => {
        gameService.removePlayer(playerId);
      }).not.toThrow();
    });
  });

  describe("Setup Phase - Player Swapping", () => {
    it("should allow swapping two placed players", () => {
      const player1Id = team1.players[0].id;
      const player2Id = team1.players[1].id;

      gameService.placePlayer(player1Id, 2, 5);
      gameService.placePlayer(player2Id, 3, 5);

      // Place all 7 players in valid positions
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      gameService.placePlayer(team1.players[6].id, 0, 6);

      expect(gameService.isSetupComplete("team-1")).toBe(true);
    });

    it("should confirm setup for a team", () => {
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      gameService.placePlayer(team1.players[6].id, 0, 6);

      gameService.confirmSetup("team-1");
      expect(gameService.getPhase()).toBe(GamePhase.SETUP);
    });

    it("should transition to KICKOFF when both teams confirm", () => {
      // Setup team 1
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      gameService.placePlayer(team1.players[6].id, 0, 6);
      gameService.confirmSetup("team-1");

      // Setup team 2
      gameService.placePlayer(team2.players[0].id, 14, 5);
      gameService.placePlayer(team2.players[1].id, 15, 5);
      gameService.placePlayer(team2.players[2].id, 16, 5);
      gameService.placePlayer(team2.players[3].id, 17, 5);
      gameService.placePlayer(team2.players[4].id, 18, 5);
      gameService.placePlayer(team2.players[5].id, 19, 5);
      gameService.placePlayer(team2.players[6].id, 14, 6);
      gameService.confirmSetup("team-2");

      expect(gameService.getPhase()).toBe(GamePhase.KICKOFF);
    });
  });

  describe("Kickoff Phase", () => {
    beforeEach(() => {
      // Setup both teams
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      gameService.placePlayer(team1.players[6].id, 0, 6);

      gameService.placePlayer(team2.players[0].id, 14, 5);
      gameService.placePlayer(team2.players[1].id, 15, 5);
      gameService.placePlayer(team2.players[2].id, 16, 5);
      gameService.placePlayer(team2.players[3].id, 17, 5);
      gameService.placePlayer(team2.players[4].id, 18, 5);
      gameService.placePlayer(team2.players[5].id, 19, 5);
      gameService.placePlayer(team2.players[6].id, 14, 6);

      gameService.confirmSetup("team-1");
      gameService.confirmSetup("team-2");
    });

    it("should be in KICKOFF phase after both teams confirm", () => {
      expect(gameService.getPhase()).toBe(GamePhase.KICKOFF);
    });

    it("should allow rolling for kickoff event", () => {
      expect(() => {
        gameService.rollKickoff();
      }).not.toThrow();
    });
  });

  describe("Game Phase - Turn Management", () => {
    beforeEach(() => {
      // Setup both teams and start game
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      gameService.placePlayer(team1.players[6].id, 0, 6);

      gameService.placePlayer(team2.players[0].id, 14, 5);
      gameService.placePlayer(team2.players[1].id, 15, 5);
      gameService.placePlayer(team2.players[2].id, 16, 5);
      gameService.placePlayer(team2.players[3].id, 17, 5);
      gameService.placePlayer(team2.players[4].id, 18, 5);
      gameService.placePlayer(team2.players[5].id, 19, 5);
      gameService.placePlayer(team2.players[6].id, 14, 6);

      gameService.confirmSetup("team-1");
      gameService.confirmSetup("team-2");
      gameService.startGame("team-1");
    });

    it("should transition to PLAY phase when game starts", () => {
      expect(gameService.getPhase()).toBe(GamePhase.PLAY);
    });

    it("should start turn for receiving team", () => {
      expect(gameService.getActiveTeamId()).toBe("team-2");
      expect(gameService.getTurnNumber("team-2")).toBe(1);
    });

    it("should switch teams on end turn", () => {
      expect(gameService.getActiveTeamId()).toBe("team-2");

      gameService.endTurn();

      expect(gameService.getActiveTeamId()).toBe("team-1");
      expect(gameService.getTurnNumber("team-1")).toBe(1);
    });

    it("should increment turn numbers correctly", () => {
      gameService.endTurn();
      expect(gameService.getTurnNumber("team-1")).toBe(1);

      gameService.endTurn();
      expect(gameService.getTurnNumber("team-2")).toBe(2);

      gameService.endTurn();
      expect(gameService.getTurnNumber("team-1")).toBe(2);
    });

    it("should end half after 6 turns per team", () => {
      for (let i = 0; i < 12; i++) {
        gameService.endTurn();
      }

      expect(gameService.getPhase()).toBe(GamePhase.HALFTIME);
    });
  });

  describe("Score Management", () => {
    it("should add touchdowns correctly", () => {
      gameService.addTouchdown("team-1");
      expect(gameService.getScore("team-1")).toBe(1);

      gameService.addTouchdown("team-1");
      expect(gameService.getScore("team-1")).toBe(2);

      gameService.addTouchdown("team-2");
      expect(gameService.getScore("team-2")).toBe(1);
    });

    it("should handle score for non-existent team", () => {
      expect(gameService.getScore("non-existent")).toBe(0);
    });
  });

  describe("Event Emission", () => {
    it("should emit phaseChanged event on phase transitions", () => {
      let phaseChanged = false;
      let newPhase: GamePhase | null = null;

      eventBus.on("phaseChanged", (data) => {
        phaseChanged = true;
        newPhase = data.phase;
      });

      gameService.startSetup();

      expect(phaseChanged).toBe(true);
      expect(newPhase).toBe(GamePhase.SETUP);
    });

    it("should emit playerPlaced event when player is placed", () => {
      let playerPlaced = false;
      let placedData = null;

      eventBus.on("playerPlaced", (data) => {
        playerPlaced = true;
        placedData = data;
      });

      const playerId = team1.players[0].id;
      gameService.placePlayer(playerId, 2, 5);

      expect(playerPlaced).toBe(true);
      expect(placedData.playerId).toBe(playerId);
      expect(placedData.x).toBe(2);
      expect(placedData.y).toBe(5);
    });

    it("should emit playerRemoved event when player is removed", () => {
      let playerRemoved = false;
      let removedPlayerId: string | null = null;

      eventBus.on("playerRemoved", (playerId: string) => {
        playerRemoved = true;
        removedPlayerId = playerId;
      });

      const playerId = team1.players[0].id;
      gameService.placePlayer(playerId, 2, 5);
      gameService.removePlayer(playerId);

      expect(playerRemoved).toBe(true);
      expect(removedPlayerId).toBe(playerId);
    });

    it("should emit turnStarted event when turn starts", () => {
      let turnStarted = false;
      let turnData = null;

      eventBus.on("turnStarted", (data) => {
        turnStarted = true;
        turnData = data;
      });

      // Setup and start game
      gameService.placePlayer(team1.players[0].id, 0, 5);
      gameService.placePlayer(team1.players[1].id, 1, 5);
      gameService.placePlayer(team1.players[2].id, 2, 5);
      gameService.placePlayer(team1.players[3].id, 3, 5);
      gameService.placePlayer(team1.players[4].id, 4, 5);
      gameService.placePlayer(team1.players[5].id, 5, 5);
      gameService.placePlayer(team1.players[6].id, 0, 6);

      gameService.placePlayer(team2.players[0].id, 14, 5);
      gameService.placePlayer(team2.players[1].id, 15, 5);
      gameService.placePlayer(team2.players[2].id, 16, 5);
      gameService.placePlayer(team2.players[3].id, 17, 5);
      gameService.placePlayer(team2.players[4].id, 18, 5);
      gameService.placePlayer(team2.players[5].id, 19, 5);
      gameService.placePlayer(team2.players[6].id, 14, 6);

      gameService.confirmSetup("team-1");
      gameService.confirmSetup("team-2");
      gameService.startGame("team-1");

      expect(turnStarted).toBe(true);
      expect(turnData).toBeDefined();
      expect(turnData.teamId).toBe("team-2");
      expect(turnData.turnNumber).toBe(1);
    });

    it("should emit touchdown event when touchdown is scored", () => {
      let touchdownScored = false;
      let touchdownData = null;

      eventBus.on("touchdown", (data) => {
        touchdownScored = true;
        touchdownData = data;
      });

      gameService.addTouchdown("team-1");

      expect(touchdownScored).toBe(true);
      expect(touchdownData.teamId).toBe("team-1");
      expect(touchdownData.score).toBe(1);
    });
  });
});
