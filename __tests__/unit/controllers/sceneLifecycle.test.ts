import { sceneWith, phaseServiceWith } from "./rendererFixtures";
import { teamWith } from "./controllerFixtures";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase, SubPhase } from "../../../src/types/GameState";

describe("scene lifecycle: a second match in the same session", () => {
  const team1 = { id: "t1", name: "Reikland Reavers" };
  const team2 = { id: "t2", name: "Gouged Eye" };

  const makeScene = () => { const scene = sceneWith({team1, team2}); scene.pitch.getPixelPosition.mockImplementation((x,y)=>({x,y})); scene.pitch.getPointPosition.mockImplementation((x,y)=>({x,y})); return scene; };

  const makeGameService = () => {
 const service = phaseServiceWith({phase:GamePhase.KICKOFF, score:{}});
 service.getActiveTeamId.mockReturnValue(team1.id);
 service.getSubPhase.mockReturnValue(SubPhase.ROLL_KICKOFF);
 service.getTeam.mockImplementation((id: string)=> teamWith(id===team1.id?team1:team2));
 
 return service;
};

  const kickoff = {
    playerId: "kicker",
    targetX: 10,
    targetY: 5,
    direction: 0,
    distance: 0,
    finalX: 10,
    finalY: 5,
    isTouchback: false,
  };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves no live subscriptions behind when the match is torn down", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    const orchestrator = new SceneOrchestrator(
      { scene: scene,gameService: makeGameService(),eventBus }    );
    orchestrator.initialize();

    expect(eventBus.listenerCount(GameEventNames.BallKicked)).toBeGreaterThan(
      0
    );

    orchestrator.destroy();

    expect(eventBus.listenerCount(GameEventNames.BallKicked)).toBe(0);
    expect(eventBus.listenerCount(GameEventNames.PhaseChanged)).toBe(0);
    expect(eventBus.listenerCount(GameEventNames.KickoffResult)).toBe(0);
  });

  it("delivers the second match's kickoff to the second scene only, with no crash", () => {
    const eventBus = new EventBus();

    const firstScene = makeScene();
    const first = new SceneOrchestrator(
      { scene: firstScene,gameService: makeGameService(),eventBus }    );
    first.initialize();
    eventBus.emit(GameEventNames.BallKicked, kickoff);
    expect(firstScene.placeBallVisual).toHaveBeenCalledTimes(1);
    first.destroy();

    const secondScene = makeScene();
    const second = new SceneOrchestrator(
      { scene: secondScene,gameService: makeGameService(),eventBus }    );
    second.initialize();

    expect(() => {
      eventBus.emit(GameEventNames.BallKicked, kickoff);
    }).not.toThrow();

    expect(secondScene.placeBallVisual).toHaveBeenCalledTimes(1);

    expect(firstScene.placeBallVisual).toHaveBeenCalledTimes(1);

    second.destroy();
    expect(eventBus.listenerCount(GameEventNames.BallKicked)).toBe(0);
  });
});
