import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayPhaseHandler } from "../../../src/game/controllers/handlers/PlayPhaseHandler";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";

/**
 * Graphical half of `match-state-visual-sync`: the play-phase handler must
 * route every touched path through the scene's reconcilers instead of moving
 * sprites itself, and must present (then acknowledge) a declared Punt.
 */
describe("PlayPhaseHandler board reconciliation", () => {
  const eventBus = new EventBus();
  let handler: PlayPhaseHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tweens: any[];

  beforeEach(() => {
    tweens = [];
    scene = {
      ballSprite: { x: 0, y: 0 },
      playerSprites: new Map([
        ["punter", { animateKickGesture: vi.fn(), updateStatus: vi.fn() }],
      ]),
      pitch: {
        getPixelPosition: (x: number, y: number) => ({ x: x * 60, y: y * 60 }),
      },
      placeBallVisual: vi.fn(),
      reconcileBallVisual: vi.fn(),
      reconcilePlayerLocation: vi.fn(),
      refreshDugouts: vi.fn(),
      startPlayPhase: vi.fn(),
      tweens: {
        add: vi.fn((config) => {
          tweens.push(config);
          return config;
        }),
      },
    };
    handler = new PlayPhaseHandler(
      scene,
      { getState: () => ({ activePlayer: null }) } as never,
      eventBus
    );
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

    // A mid-route pickup (success or failure) re-derives possession too.
    eventBus.emit(GameEventNames.BallPickup, {
      playerId: "punter",
      success: true,
      roll: 4,
      target: 3,
    });
    expect(scene.reconcileBallVisual).toHaveBeenCalledTimes(2);
  });

  it("routes a knocked-out player through the single location reconciler", () => {
    eventBus.emit(GameEventNames.PlayerStatusChanged, {
      id: "punter",
      status: PlayerStatus.KO,
      gridPosition: undefined,
    } as never);

    expect(scene.reconcilePlayerLocation).toHaveBeenCalledWith("punter");
    // The KO'd player may have been standing on the ball.
    expect(scene.reconcileBallVisual).toHaveBeenCalled();
  });

  it("presents a declared Punt and acknowledges it when the kick lands", () => {
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

    // The punter swings…
    expect(
      scene.playerSprites.get("punter").animateKickGesture
    ).toHaveBeenCalledWith(1);
    // …the ball flies to the declared landing square…
    expect(tweens).toHaveLength(1);
    expect(tweens[0]).toMatchObject({
      targets: scene.ballSprite,
      x: 840,
      y: 300,
    });
    // …and the operation is only released once the animation completes.
    expect(acks).toEqual([]);
    tweens[0].onComplete();
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
