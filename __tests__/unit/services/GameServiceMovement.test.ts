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

    const p1 = new PlayerBuilder()
      .withId("p1")
      .withTeamId("t1")
      .withGridPosition(5, 5)
      .withStatus(PlayerStatus.ACTIVE)
      .withStats({ MA: 6, ST: 3, AG: 3, AV: 8, PA: 4 })
      .build();
    team1.players.push(p1);

    const initialState = {
      phase: 2,
      subPhase: 12,
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
    };

    const mockRngService = {
      rollDie: vi.fn().mockReturnValue(1),
      rollMultipleDice: vi
        .fn()
        .mockImplementation((count) => Array(count).fill(1)),
      getSeed: vi.fn().mockReturnValue(12345),
    };

    const mockBlockService = {
      rollBlockDice: vi.fn().mockReturnValue([]),
    } as any;

    gameService = new GameService({ eventBus: eventBus, team1: team1, team2: team2, rngService: mockRngService as any, blockResolutionService: mockBlockService, initialState: initialState as any }
    );
  });

  it("should calculate available movements for a player", () => {
    const moves = gameService.getAvailableMovements("p1");
    expect(moves.length).toBeGreaterThan(0);

    expect(moves.some((m: any) => m.x === 6 && m.y === 5)).toBe(true);
    expect(moves.some((m: any) => m.x === 8 && m.y === 5)).toBe(true);
  });

  it("should move a player and emit event", async () => {
    const emitSpy = vi.spyOn(eventBus, "emit");
    const path = [{ x: 6, y: 5 }];

    await gameService.movePlayer("p1", path);

    const p1 = gameService
      .getTeam("t1")
      ?.players.find((p: any) => p.id === "p1");
    expect(p1?.gridPosition).toEqual({ x: 6, y: 5 });
    expect(emitSpy).toHaveBeenCalledWith(
      "playerMoved",
      expect.objectContaining({ playerId: "p1", to: { x: 6, y: 5 } })
    );
  });
});
