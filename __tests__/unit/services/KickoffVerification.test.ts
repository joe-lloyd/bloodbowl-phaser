import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../../src/services/GameService.js";
import { type IGameService } from "../../../src/services/interfaces/IGameService.js";
import { EventBus } from "../../../src/services/EventBus.js";
import { TeamBuilder } from "../../utils/test-builders.js";
import { GamePhase } from "../../../src/types/GameState.js";
import type { Team } from "../../../src/types/Team.js";
import { GameEventNames } from "../../../src/types/events.js";
import { noDelay } from "../../../src/game/core/GameFlowManager.js";

describe("Kickoff Verification", () => {
  let gameService: IGameService;
  let eventBus: EventBus;
  let team1: Team;
  let team2: Team;

  beforeEach(async () => {
    eventBus = new EventBus();
    team1 = new TeamBuilder()
      .withId("t1")
      .withName("T1")
      .withPlayers(7)
      .build();
    team2 = new TeamBuilder()
      .withId("t2")
      .withName("T2")
      .withPlayers(7)
      .build();
    const mockRngService = {
      rollDie: vi.fn().mockReturnValue(1),
      rollMultipleDice: vi
        .fn()
        .mockImplementation((count: number) => Array.from({ length: count }, () => 1)),
      getSeed: vi.fn().mockReturnValue(12_345),
    };

    const mockBlockService = {
      rollBlockDice: vi.fn().mockReturnValue([]),
    } as any;

    gameService = new GameService({ eventBus: eventBus, team1: team1, team2: team2, rngService: mockRngService as any, blockResolutionService: mockBlockService, delay: noDelay }
    );

    gameService.startSetup("t1");
    const left = [
      [6, 3],
      [6, 5],
      [6, 7],
      [4, 2],
      [4, 4],
      [4, 6],
      [4, 8],
    ];
    for (const [index, [x, y]] of left.entries()) gameService.placePlayer(fixtureValue(team1.players[index]).id, fixtureValue(x), fixtureValue(y))
    ;
    gameService.confirmSetup("t1");
    await Promise.resolve();

    const mirrored = left.map(([x, y]) => [19 - fixtureValue(x), y]);
    for (const [index, [x, y]] of mirrored.entries()) gameService.placePlayer(fixtureValue(team2.players[index]).id, fixtureValue(x), fixtureValue(y))
      ;
    gameService.confirmSetup("t2");
  });

  it("should be in KICKOFF phase", () => {
    expect(gameService.getPhase()).toBe(GamePhase.KICKOFF);
  });

  it("should roll 2D6 (2-12) for kickoff result", () =>
    new Promise<void>((done) => {
      eventBus.on(GameEventNames.KickoffResult, (data: any) => {
        expect(data.roll).toBeGreaterThanOrEqual(2);
        expect(data.roll).toBeLessThanOrEqual(12);
        expect(typeof data.event).toBe("string");
        expect(data.event.length).toBeGreaterThan(0);
        done();
      });

      void gameService.kickBall({
        isTeam1Kicking: true,
        playerId: fixtureValue(team1.players[0]).id,
        targetX: 15,
        targetY: 5,
      });
    }));
});
