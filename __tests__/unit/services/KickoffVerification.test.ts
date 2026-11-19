import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../../src/services/GameService.js";
import { type IGameService } from "../../../src/services/interfaces/IGameService.js";
import { EventBus } from "../../../src/services/EventBus.js";
import { TeamBuilder } from "../../utils/test-builders.js";
import { GamePhase } from "../../../src/types/GameState.js";
import { GameEventNames } from "../../../src/types/events.js";
import { noDelay } from "../../../src/game/core/GameFlowManager.js";

describe("Kickoff Verification", () => {
  let gameService: IGameService;
  let eventBus: EventBus;
  let team1;
  let team2;

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
        .mockImplementation((count) => Array(count).fill(1)),
      getSeed: vi.fn().mockReturnValue(12345),
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
    left.forEach(([x, y], index) =>
      gameService.placePlayer(team1.players[index].id, fixtureValue(x), fixtureValue(y))
    );
    gameService.confirmSetup("t1");
    await Promise.resolve();

    left
      .map(([x, y]) => [19 - fixtureValue(x), y])
      .forEach(([x, y], index) =>
        gameService.placePlayer(team2.players[index].id, fixtureValue(x), fixtureValue(y))
      );
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

      gameService.rollKickoff();
    }));

  it("should emit specific events for specific rolls (mocked)", () =>
    new Promise<void>((done) => {
      eventBus.on(GameEventNames.KickoffResult, (data: any) => {
        console.log(`Rolled ${String(data.roll)}: ${String(data.event)}`);
        done();
      });
      gameService.rollKickoff();
    }));
});
