import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameService } from "../../../src/services/GameService";
import { type IEventBus } from "../../../src/services/EventBus";
import { type Team } from "../../../src/types/Team";
import { PlayerStatus } from "../../../src/types/Player";

describe("GameService Setup Flow", () => {
  let gameService: GameService;
  let eventBus: IEventBus;
  let team1: Team;
  let team2: Team;

  beforeEach(() => {
    eventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    team1 = {
      id: "team1",
      name: "Team 1",
      players: [],
      colors: { primary: 0x0000ff, secondary: 0xffffff },
    };
    team2 = {
      id: "team2",
      name: "Team 2",
      players: [],
      colors: { primary: 0xff0000, secondary: 0x000000 },
    };

    gameService = new GameService({ eventBus: eventBus, team1: team1, team2: team2 });
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
    gameService = new GameService({ eventBus: eventBus, team1: team1, team2: team2 });

    fixtureValue(gameService.getPlayerById("ko")).status = PlayerStatus.KO;
    expect(gameService.isSetupEligible("fit")).toBe(true);
    expect(gameService.isSetupEligible("ko")).toBe(false);
    expect(gameService.isSetupEligible("nobody")).toBe(false);
  });
});
