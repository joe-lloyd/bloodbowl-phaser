import { GamePhase } from "../../../src/types/GameState";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { KickoffEvent } from "../../../src/game/kickoff/kickoffEvents";
import { newKick } from "../../../src/game/kickoff/kickRecord";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KickoffPhaseHandler } from "../../../src/game/controllers/handlers/KickoffPhaseHandler";
import { colorDistance } from "../../../src/game/presentation/kits";
import { kickTargetColor } from "../../../src/game/presentation/kickTarget";
import { DiceWatch } from "../../../src/game/presentation/diceWatch";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { ballWith, phaseServiceWith, sceneWith } from "./rendererFixtures";

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the landing square marker", () => {
  let eventBus: EventBus;
  let handler: KickoffPhaseHandler;
  let marked: { x: number; y: number } | null;

  beforeEach(() => {
    eventBus = new EventBus();
    DiceWatch.shared(eventBus);
    marked = null;
    const scene = sceneWith();
    const ball = ballWith();
    scene.placeBallVisual.mockImplementation(() => {
      scene.ballSprite = ball;
    });
    scene.pitch.markKickTarget.mockImplementation((square) => {
      marked = square;
    });
    scene.pitch.clearKickTarget.mockImplementation(() => {
      marked = null;
    });
    handler = new KickoffPhaseHandler(scene, phaseServiceWith(), eventBus);
    handler.enter();
  });

  afterEach(() => {
    handler.exit();
    eventBus.removeAllListeners();
  });

  const dice = (thrown: number, landedThrough: number) => {
    eventBus.emit(GameEventNames.UI_DiceInAir, {
      count: thrown - landedThrough,
      thrown,
      landedThrough,
    });
  };
  const kick = (isTouchback = false) => {
    eventBus.emit(GameEventNames.BallKicked, {
      playerId: "kicker",
      targetX: 10,
      targetY: 5,
      direction: 0,
      distance: 0,
      finalX: 13,
      finalY: 7,
      isTouchback,
    });
  };

  it("waits for the deviation dice before it names the square", async () => {
    dice(2, 0);
    kick();
    await settled();
    expect(marked).toBeNull();
    dice(2, 2);
    await settled();
    expect(marked).toEqual({ x: 13, y: 7 });
  });

  it("comes back on a board restored mid-Charge, and goes with the landing", async () => {
    const state = new HeadlessGame({ seed: 1 }).ctx.gameService.getState();
    state.phase = GamePhase.KICKOFF;
    state.ballPosition = { x: 14, y: 4 };
    state.kick = newKick("team1", "coach");
    eventBus.emit(GameEventNames.GameStateRestored, state);
    await settled();
    expect(marked).toEqual({ x: 14, y: 4 });
    eventBus.emit(GameEventNames.KickoffTurnStarted, {
      event: KickoffEvent.CHARGE,
      teamId: "team1",
    });
    await settled();
    expect(marked).toEqual({ x: 14, y: 4 });
    eventBus.emit(GameEventNames.KickoffSequenceCompleted, { isTouchback: false });
    expect(marked).toBeNull();
  });

  it("follows a ball the wind moves, then goes when the ball lands", async () => {
    kick();
    await settled();
    eventBus.emit(GameEventNames.KickoffAirbornePositionChanged, {
      x: 14,
      y: 8,
    });
    await settled();
    expect(marked).toEqual({ x: 14, y: 8 });
    eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: { x: 14, y: 8 },
      isTouchback: false,
    });
    await settled();
    expect(marked).toBeNull();
  });

  it("never marks a touchback", async () => {
    kick(true);
    await settled();
    expect(marked).toBeNull();
  });

  it("goes when the wind blows the ball out for a touchback", async () => {
    kick();
    await settled();
    eventBus.emit(GameEventNames.KickoffBallLanding, {
      landingSquare: null,
      isTouchback: true,
    });
    expect(marked).toBeNull();
  });

  it("drops a reveal that is still waiting when the kick-off ends", async () => {
    dice(1, 0);
    kick();
    await settled();
    handler.exit();
    dice(1, 1);
    await settled();
    expect(marked).toBeNull();
  });
});

describe("the marker colour", () => {
  it("is red, green or blue, whichever is furthest from the teams and the pitch", () => {
    expect(kickTargetColor([0x2b4bd6, 0xd62b2b], "cobbles")).toBe(0x3dff5c);
    expect(kickTargetColor([0x0000ff, 0x006400], "grass")).toBe(0xff2b2b);
    expect(kickTargetColor([0xd62b2b, 0x22aa33], "sand")).toBe(0x1fa2ff);
  });

  it("stays clear of every pitch for a red team against a blue one", () => {
    for (const surface of ["grass", "cobbles", "sand", "sewer"] as const) {
      const color = kickTargetColor([0x2b4bd6, 0xd62b2b], surface);
      expect(colorDistance(color, 0x2b4bd6)).toBeGreaterThan(140);
      expect(colorDistance(color, 0xd62b2b)).toBeGreaterThan(140);
    }
  });
});
