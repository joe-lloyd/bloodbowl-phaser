import { sceneWith, ballWith, visualWith, phaseServiceWith } from "./rendererFixtures";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { playerWith } from "./controllerFixtures";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlayPhaseHandler } from "../../../src/game/controllers/handlers/PlayPhaseHandler";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";

describe("PlayPhaseHandler board reconciliation", () => {
  const eventBus = new EventBus();
  let handler: PlayPhaseHandler;
  let scene: ReturnType<typeof sceneWith>;
  let tweens: { x:number; y:number; opts:unknown; onComplete:()=>void }[];

  beforeEach(() => {
    tweens = [];
    scene = sceneWith();
    const ball = ballWith();
    ball.flyTo.mockImplementation((to, opts) => new Promise<void>((resolve) => {
      tweens.push({ ...to, opts, onComplete: resolve });
    }));
    scene.ballSprite = ball;
    scene.playerSprites.set("punter", visualWith());
    handler = new PlayPhaseHandler(scene, phaseServiceWith({activePlayer:null}), eventBus);
    handler.enter();
  });

  afterEach(() => {
    handler.exit();
    eventBus.removeAllListeners();
  });

  it("reconciles the ball instead of imperatively placing it", () => {
    eventBus.emit(GameEventNames.BallPlaced, { x: 7, y: 3 });
    expect(scene.reconcileBallVisual).toHaveBeenCalledTimes(1);
    expect(scene.placeBallVisual).not.toHaveBeenCalled();

    eventBus.emit(GameEventNames.BallPickup, {
      playerId: "punter",
      success: true,
      roll: 4,
      target: 3,
    });
    expect(scene.reconcileBallVisual).toHaveBeenCalledTimes(2);
  });

  it("routes a knocked-out player through the single location reconciler", () => {
    eventBus.emit(GameEventNames.PlayerStatusChanged, playerWith({
      id: "punter",
      status: PlayerStatus.KO,
      
    }));

    expect(scene.reconcilePlayerLocation).toHaveBeenCalledWith("punter");

    expect(scene.reconcileBallVisual).toHaveBeenCalled();
  });

  it("drops a bounce the engine moved past before it could play, and still answers it", async () => {
    const acks: { id: string }[] = [];
    eventBus.on(GameEventNames.UI_PresentationAcknowledged, (data) =>
      acks.push(data)
    );
    eventBus.emit(GameEventNames.PassFumbled, {
      playerId: "bounce",
      position: { x: 4, y: 4 },
      bouncePosition: { x: 5, y: 4 },
      presentationId: "bounce-7",
    });

    eventBus.emit(GameEventNames.BallPlaced, { x: 9, y: 9 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(scene.placeBallVisual).not.toHaveBeenCalled();
    expect(fixtureValue(scene.ballSprite).flyTo).not.toHaveBeenCalled();
    expect(acks).toEqual([{ id: "bounce-7" }]);
  });

  it("drops a bounce whose board left while its dice were in the air, and still answers it", async () => {
    const acks: { id: string }[] = [];
    eventBus.on(GameEventNames.UI_PresentationAcknowledged, (data) =>
      acks.push(data)
    );

    eventBus.emit(GameEventNames.UI_DiceInAir, {
      count: 1,
      thrown: 1,
      landedThrough: 0,
    });
    eventBus.emit(GameEventNames.PassFumbled, {
      playerId: "bounce",
      position: { x: 4, y: 4 },
      bouncePosition: { x: 5, y: 4 },
      presentationId: "bounce-8",
    });

    handler.exit();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(scene.placeBallVisual).not.toHaveBeenCalled();
    expect(fixtureValue(scene.ballSprite).flyTo).not.toHaveBeenCalled();
    expect(acks).toEqual([{ id: "bounce-8" }]);
  });

  it("presents a declared Punt and acknowledges it when the kick lands", async () => {
    const acks: { id: string }[] = [];
    eventBus.on(GameEventNames.UI_PresentationAcknowledged, (data) =>
      acks.push(data)
    );

    eventBus.emit(GameEventNames.PuntDeclared, {
      playerId: "punter",
      presentationId: "punt-42",
      from: { x: 10, y: 5 },
      direction: { x: 1, y: 0 },
      distance: 4,
      landing: { x: 14, y: 5 },
      intoCrowd: false,
    });

    expect(
      fixtureValue(scene.playerSprites.get("punter")).animateKickGesture
    ).toHaveBeenCalledWith(1);

    expect(tweens).toHaveLength(1);
    expect(tweens[0]).toMatchObject({ x: 840, y: 300 });

    expect(acks).toEqual([]);
    fixtureValue(tweens[0]).onComplete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acks).toEqual([{ id: "punt-42" }]);
  });

  it("still acknowledges a Punt when there is nothing to animate", () => {
    const acks: { id: string }[] = [];
    eventBus.on(GameEventNames.UI_PresentationAcknowledged, (data) =>
      acks.push(data)
    );
    scene.ballSprite = null;

    eventBus.emit(GameEventNames.PuntDeclared, {
      playerId: "missing-sprite",
      presentationId: "punt-43",
      from: { x: 10, y: 5 },
      direction: { x: -1, y: 0 },
      distance: 2,
      landing: { x: 8, y: 5 },
      intoCrowd: true,
    });

    expect(acks).toEqual([{ id: "punt-43" }]);
  });
});
