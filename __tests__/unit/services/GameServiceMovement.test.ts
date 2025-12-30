import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../../src/services/GameService";
import { TeamBuilder, PlayerBuilder } from "../../utils/test-builders";
import { PlayerStatus } from "../../../src/types/Player";
import { EventBus } from "../../../src/services/EventBus";

describe("GameService Movement Integration", () => {
  let gameService: GameService;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    const team1 = new TeamBuilder().withId("t1").withName("Humans").build();
    const team2 = new TeamBuilder().withId("t2").withName("Orcs").build();

    // Add players BEFORE creating GameService
    const p1 = new PlayerBuilder()
      .withId("p1")
      .withTeamId("t1")
      .withGridPosition(5, 5)
      .withStatus(PlayerStatus.ACTIVE)
      .withStats({ MA: 6, ST: 3, AG: 3, AV: 8, PA: 4 })
      .build();
    team1.players.push(p1);

    // Create initial state with active team
    const initialState = {
      phase: 2, // PLAY phase
      subPhase: 12, // KICK_OFF (approx, or just ignore for movement)
      activeTeamId: "t1",
      turn: {
        teamId: "t1",
        turnNumber: 1,
        isHalf2: false,
        activatedPlayerIds: new Set(),
        hasBlitzed: false,
        hasPassed: false,
        hasHandedOff: false,
        hasFouled: false,
        movementUsed: new Map(),
      },
      score: { t1: 0, t2: 0 },
      weather: "Nice",
      ballPosition: null,
      activePlayer: null,
    }; // Cast or partial GameState if needed, or better use GameStateBuilder if available

    gameService = new GameService(eventBus, team1, team2, initialState);
  });

  it("should calculate available movements for a player", () => {
    const moves = gameService.getAvailableMovements("p1");
    expect(moves.length).toBeGreaterThan(0);
    // Movements include cost property, so use .some() to check
    expect(moves.some((m) => m.x === 6 && m.y === 5)).toBe(true); // Adjacent
    expect(moves.some((m) => m.x === 8 && m.y === 5)).toBe(true); // 3 steps
  });

  it("should move a player and emit event", async () => {
    const emitSpy = vi.spyOn(eventBus, "emit");
    const path = [{ x: 6, y: 5 }]; // 1 step move

    await gameService.movePlayer("p1", path);

    const p1 = gameService["team1"].players.find((p) => p.id === "p1");
    expect(p1?.gridPosition).toEqual({ x: 6, y: 5 });
    expect(emitSpy).toHaveBeenCalledWith(
      "playerMoved",
      expect.objectContaining({ playerId: "p1", to: { x: 6, y: 5 } })
    );
  });
});
