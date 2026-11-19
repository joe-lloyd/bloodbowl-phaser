import { fixtureValue } from "../../../src/testing/fixtureValue";
import { sceneWith, phaseServiceWith } from "./rendererFixtures";
import { teamWith, playerWith } from "./controllerFixtures";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase, SubPhase } from "../../../src/types/GameState";

describe("TouchdownPhaseHandler", () => {
  const team1 = { id: "t1", name: "Reikland Reavers" };
  const team2 = { id: "t2", name: "Gouged Eye" };

  const makeScene = () => sceneWith({team1,team2});

  const makeGameService = () => {
 const service = phaseServiceWith({phase:GamePhase.PLAY, score:{t1:2,t2:1}});
 service.getActiveTeamId.mockReturnValue(team1.id);
 service.getSubPhase.mockReturnValue(SubPhase.SCORING);
 service.getTeam.mockImplementation((id: string)=> teamWith(id===team1.id?team1:team2));
 service.getPlayerById.mockReturnValue(playerWith({id:"p1",playerName:"Griff Oberwald",teamId:team1.id}));
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

  it("owns touchdown and half time while the engine announces the score", () => {
    const eventBus = new EventBus();
    new SceneOrchestrator({ scene: makeScene(),gameService: makeGameService(),eventBus });

    for (const phase of [GamePhase.TOUCHDOWN, GamePhase.HALFTIME]) {
      eventBus.emit(GameEventNames.PhaseChanged, {
        phase,
        subPhase: SubPhase.SCORING,
      });
      expect(warnSpy).not.toHaveBeenCalled();
      expect(eventBus.listenerCount(GameEventNames.PlayerStatusChanged)).toBe(
        1
      );
    }
  });

  it("exits the previous handler before entering, and releases the scene after", () => {
    const eventBus = new EventBus();
    const orchestrator = new SceneOrchestrator(
      { scene: makeScene(),gameService: makeGameService(),eventBus }    );

    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.PLAY });
    const playListeners = eventBus.listenerCount(
      GameEventNames.UI_RollBlockDice
    );
    expect(playListeners).toBeGreaterThan(0);

    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });

    expect(eventBus.listenerCount(GameEventNames.UI_RollBlockDice)).toBe(0);
    expect(
      eventBus.listenerCount(GameEventNames.PlayerStatusChanged)
    ).toBeGreaterThan(0);

    orchestrator.destroy();
    expect(eventBus.listenerCount(GameEventNames.PlayerStatusChanged)).toBe(0);
  });

  it("lets the local coach request a skipped recovery beat", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    new SceneOrchestrator({ scene: scene,gameService: makeGameService(),eventBus });

    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });

    expect(scene.input.on).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function)
    );
    const skip = fixtureValue(scene.input.on.mock.calls[0])[1];
    let skipped = 0;
    eventBus.on(GameEventNames.UI_SkipDriveSequence, () => skipped++);
    Reflect.apply(skip, undefined, []);
    expect(skipped).toBe(1);
  });
});
