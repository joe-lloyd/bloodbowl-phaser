import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach } from "vitest";
import { GameService } from "../../../src/services/GameService";
import { EventBus, type IEventBus } from "../../../src/services/EventBus";
import { RNGService } from "../../../src/services/rng/RNGService";
import { BlockResolutionService } from "../../../src/services/BlockResolutionService";
import { teamWith } from "../controllers/controllerFixtures";
import { type Team } from "../../../src/types/Team";
import { PlayerStatus } from "../../../src/types/Player";

describe("GameService Setup Flow", () => {
  let gameService: GameService;
  let eventBus: IEventBus;
  let team1: Team;
  let team2: Team;

  const newGameService = () => {
    const rngService = new RNGService(1);
    return new GameService({
      eventBus,
      teams: [team1, team2],
      rngService,
      blockResolutionService: new BlockResolutionService(rngService),
    });
  };

  beforeEach(() => {
    eventBus = new EventBus();
    team1 = teamWith({
      id: "team1",
      name: "Team 1",
      players: [],
      colors: { primary: 0x0000ff, secondary: 0xffffff },
    });
    team2 = teamWith({
      id: "team2",
      name: "Team 2",
      players: [],
      colors: { primary: 0xff0000, secondary: 0x000000 },
    });

    gameService = newGameService();
  });

  it("should set active team on startSetup", () => {
    gameService.startSetup("team1");
    expect(gameService.getActiveTeamId()).toBe("team1");
    expect(gameService.getSetupZone("team1")).toEqual({
      minX: 0,
      maxX: 6,
      minY: 0,
      maxY: 10,
    });
  });

  it("should return correct setup zone based on active team", () => {
    gameService.startSetup("team1");

    let activeId = gameService.getActiveTeamId();
    let zone = gameService.getSetupZone(fixtureValue(activeId));

    expect(zone?.minX).toBe(0);

    gameService.startSetup("team2");

    activeId = gameService.getActiveTeamId();
    expect(activeId).toBe("team2");

    zone = gameService.getSetupZone(fixtureValue(activeId));
    expect(zone?.minX).toBe(13);
  });

  it("answers who may be placed this drive from the setup rule", () => {
    team1.players.push(
      { id: "fit", teamId: "team1", status: "Active" } as never,
      { id: "ko", teamId: "team1", status: "Active" } as never
    );
    gameService = newGameService();

    fixtureValue(gameService.getPlayerById("ko")).status = PlayerStatus.KO;
    expect(gameService.isSetupEligible("fit")).toBe(true);
    expect(gameService.isSetupEligible("ko")).toBe(false);
    expect(gameService.isSetupEligible("nobody")).toBe(false);
  });
});
