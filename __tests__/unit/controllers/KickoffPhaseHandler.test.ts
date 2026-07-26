import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffPhaseHandler } from "../../../src/game/controllers/handlers/KickoffPhaseHandler";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";

describe("KickoffPhaseHandler single-ball lifecycle", () => {
  const eventBus = new EventBus();
  let handler: KickoffPhaseHandler;
  let scene: any;

  beforeEach(() => {
    const ballSprite = { x: 0, y: 0 };
    scene = {
      ballSprite: null,
      pendingKickoffData: null,
      playerSprites: new Map(),
      kickingTeam: { id: "team1" },
      pitch: {
        getPixelPosition: (x: number, y: number) => ({
          x: x * 60,
          y: y * 60,
        }),
      },
      placeBallVisual: vi.fn(() => {
        scene.ballSprite = ballSprite;
      }),
      refreshDugouts: vi.fn(),
      tweens: { add: vi.fn() },
    };
    const gameService = {
      getPlayerById: vi.fn(() => null),
      getTeam: vi.fn((teamId: string) => ({
        id: teamId,
        name: teamId === "team1" ? "Reikland Reavers" : "Gouged Eye",
      })),
      startGame: vi.fn(),
    };
    handler = new KickoffPhaseHandler(scene, gameService as any, eventBus);
    handler.enter();
  });

  afterEach(() => {
    handler.exit();
    eventBus.removeAllListeners();
  });

  it("uses a translucent single ball while keeping the camera fixed", () => {
    const cameraEvents: string[] = [];
    eventBus.on(GameEventNames.Camera_TrackBall, () =>
      cameraEvents.push("track")
    );
    eventBus.on(GameEventNames.Camera_Reset, () =>
      cameraEvents.push("reset")
    );

    eventBus.emit(GameEventNames.BallKicked, {
      playerId: "kicker",
      targetX: 10,
      targetY: 5,
      direction: 0,
      distance: 0,
      finalX: 13,
      finalY: 7,
      isTouchback: false,
    });

    expect(scene.placeBallVisual).toHaveBeenCalledTimes(1);
    expect(scene.tweens.add).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: scene.ballSprite,
        x: 780,
        y: 420,
        scaleX: 1.5,
        scaleY: 1.5,
        alpha: 0.55,
      })
    );

    eventBus.emit(GameEventNames.KickoffAirbornePositionChanged, {
      x: 14,
      y: 8,
    });
    expect(scene.placeBallVisual).toHaveBeenCalledTimes(1);
    expect(scene.tweens.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targets: scene.ballSprite,
        x: 840,
        y: 480,
        scaleX: 1.5,
        scaleY: 1.5,
        alpha: 0.55,
      })
    );

    eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: { x: 14, y: 8 },
      isTouchback: false,
    });
    expect(scene.tweens.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targets: scene.ballSprite,
        x: 840,
        y: 480,
        scaleX: 0.5,
        scaleY: 0.5,
        alpha: 1,
      })
    );

    eventBus.emit(GameEventNames.KickoffSequenceCompleted, {
      isTouchback: false,
    });
    expect(cameraEvents).toEqual([]);
    expect(scene.pendingKickoffData).toBeNull();
  });

  it("updates stunned player rendering during the kickoff phase", () => {
    const sprite = { updateStatus: vi.fn() };
    scene.playerSprites.set("invaded", sprite);
    const player = {
      id: "invaded",
      status: "Stunned",
      gridPosition: { x: 5, y: 5 },
    };

    eventBus.emit(GameEventNames.PlayerStatusChanged, player as any);

    expect(sprite.updateStatus).toHaveBeenCalledTimes(1);
    expect(scene.refreshDugouts).not.toHaveBeenCalled();
  });

  it("writes team names rather than ids in kickoff outcomes", () => {
    const logs: string[] = [];
    eventBus.on(GameEventNames.UI_GameLog, (line) => logs.push(line));

    eventBus.emit(GameEventNames.KickoffResult, {
      roll: 6,
      event: "Cheering Fans" as any,
      meaning: "Both coaches roll.",
      outcome: {
        event: "Cheering Fans" as any,
        meaning: "Both coaches roll.",
        perTeam: {
          team1: ["wins the Offensive Assist"],
          team2: ["loses the roll-off"],
        },
      },
    });

    expect(logs.at(-1)).toContain(
      "Reikland Reavers: wins the Offensive Assist"
    );
    expect(logs.at(-1)).toContain("Gouged Eye: loses the roll-off");
    expect(logs.at(-1)).not.toContain("team1:");
  });
});
