import { sceneWith, phaseServiceWith } from "./rendererFixtures";
import { teamWith } from "./controllerFixtures";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase } from "../../../src/types/GameState";

describe("SceneOrchestrator GAME_OVER handling", () => {
  const team1 = { id: "t1", name: "Reikland Reavers" };
  const team2 = { id: "t2", name: "Gouged Eye" };

  const makeScene = () => sceneWith({team1,team2});

  const makeGameService = () => {
 const service = phaseServiceWith({phase:GamePhase.PLAY, score:{}});
 service.getActiveTeamId.mockReturnValue(null);
 
 service.getTeam.mockImplementation((id: string)=> teamWith(id===team1.id?team1:team2));
 
 return service;
};

  let warnSpy: { mock: { calls: unknown[][] } };

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles GAME_OVER without the unhandled-phase warning", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    const gameService = makeGameService();
    new SceneOrchestrator({ scene,gameService,eventBus });

    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });

    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes("No handler for phase")
      )
    ).toBe(false);
  });
});
