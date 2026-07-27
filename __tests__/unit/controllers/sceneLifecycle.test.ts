import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase, SubPhase } from "../../../src/types/GameState";

/**
 * Regression for the reported second-match crash:
 *   "Cannot read properties of null (reading 'queueDepthSort')" from
 *   `new BallSprite` at the kickoff of the SECOND match in a session.
 *
 * The cause was listener lifetime, not the sprite: the first match's
 * KickoffPhaseHandler stayed subscribed to the shared EventBus (which
 * outlives the Phaser scene) and captured a destroyed scene. Tearing the
 * orchestrator down must remove the active handler AND its subscriptions.
 */
describe("scene lifecycle: a second match in the same session", () => {
  const team1 = { id: "t1", name: "Reikland Reavers" };
  const team2 = { id: "t2", name: "Gouged Eye" };

  const makeScene = () => ({
    team1,
    team2,
    kickingTeam: team1,
    receivingTeam: team2,
    playerSprites: new Map(),
    ballSprite: null,
    pendingKickoffData: null,
    pitch: { getPixelPosition: (x: number, y: number) => ({ x, y }) },
    placeBallVisual: vi.fn(),
    refreshDugouts: vi.fn(),
    startKickoffPhase: vi.fn(),
    startSetupPhase: vi.fn(),
    disableSetupInteraction: vi.fn(),
    highlightSetupZone: vi.fn(),
    enablePlacement: vi.fn(),
    tweens: { add: vi.fn() },
    input: { on: vi.fn(), off: vi.fn() },
  });

  const makeGameService = () =>
    ({
      getState: vi.fn(() => ({ phase: GamePhase.KICKOFF, score: {} })),
      getActiveTeamId: vi.fn(() => team1.id),
      getSubPhase: vi.fn(() => SubPhase.ROLL_KICKOFF),
      getPlayerById: vi.fn(() => undefined),
      getTeam: vi.fn(() => team1),
      getScore: vi.fn(() => 0),
      startGame: vi.fn(),
    }) as never;

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
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves no live subscriptions behind when the match is torn down", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    const orchestrator = new SceneOrchestrator(
      scene as never,
      makeGameService(),
      eventBus
    );
    orchestrator.initialize();

    // The kickoff handler is live while the match is.
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

    // Match one: start, kick off, then leave.
    const firstScene = makeScene();
    const first = new SceneOrchestrator(
      firstScene as never,
      makeGameService(),
      eventBus
    );
    first.initialize();
    eventBus.emit(GameEventNames.BallKicked, kickoff);
    expect(firstScene.placeBallVisual).toHaveBeenCalledTimes(1);
    first.destroy();

    // Match two: a brand-new scene on the same, still-live EventBus.
    const secondScene = makeScene();
    const second = new SceneOrchestrator(
      secondScene as never,
      makeGameService(),
      eventBus
    );
    second.initialize();

    expect(() =>
      eventBus.emit(GameEventNames.BallKicked, kickoff)
    ).not.toThrow();

    expect(secondScene.placeBallVisual).toHaveBeenCalledTimes(1);
    // The shut-down first scene was never touched again.
    expect(firstScene.placeBallVisual).toHaveBeenCalledTimes(1);

    second.destroy();
    expect(eventBus.listenerCount(GameEventNames.BallKicked)).toBe(0);
  });
});
