import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase, SubPhase } from "../../../src/types/GameState";

/**
 * Regression for "[Orchestrator] No handler for phase: TOUCHDOWN": the
 * celebration window must have an owner, because that is exactly when the
 * pitch is being cleared underneath the scene.
 */
describe("TouchdownPhaseHandler", () => {
  const team1 = { id: "t1", name: "Reikland Reavers" };
  const team2 = { id: "t2", name: "Gouged Eye" };

  const makeScene = () => ({
    team1,
    team2,
    playerSprites: new Map(),
    refreshDugouts: vi.fn(),
    startSetupPhase: vi.fn(),
    startKickoffPhase: vi.fn(),
    startPlayPhase: vi.fn(),
    input: { on: vi.fn(), off: vi.fn() },
  });

  const makeGameService = () =>
    ({
      getState: vi.fn(() => ({
        phase: GamePhase.PLAY,
        score: { t1: 2, t2: 1 },
      })),
      getActiveTeamId: vi.fn(() => team1.id),
      getSubPhase: vi.fn(() => SubPhase.SCORING),
      getTeam: vi.fn((id: string) => (id === team1.id ? team1 : team2)),
      getPlayerById: vi.fn(() => ({
        id: "p1",
        playerName: "Griff Oberwald",
        teamId: team1.id,
      })),
      getScore: vi.fn(() => 0),
    }) as never;

  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("owns the TOUCHDOWN phase and announces scorer, team and score", () => {
    const eventBus = new EventBus();
    new SceneOrchestrator(makeScene() as never, makeGameService(), eventBus);

    const notifications: string[] = [];
    const log: string[] = [];
    eventBus.on(GameEventNames.UI_Notification, (m) =>
      notifications.push(m as string)
    );
    eventBus.on(GameEventNames.UI_GameLog, (m) => log.push(m as string));

    // The engine emits the phase change first, then the score.
    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });
    eventBus.emit(GameEventNames.Touchdown, {
      teamId: team1.id,
      score: 2,
      scorerId: "p1",
    });

    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes("No handler for phase")
      )
    ).toBe(false);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain("Griff Oberwald");
    expect(notifications[0]).toContain(team1.name);
    expect(notifications[0]).toContain("2");
    expect(notifications[0]).toContain("1");
    // The same line is recorded in the match log, not just flashed on screen.
    expect(log).toEqual(notifications);
  });

  it("exits the previous handler before entering, and releases the scene after", () => {
    const eventBus = new EventBus();
    const orchestrator = new SceneOrchestrator(
      makeScene() as never,
      makeGameService(),
      eventBus
    );

    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.PLAY });
    const playListeners = eventBus.listenerCount(
      GameEventNames.UI_RollBlockDice
    );
    expect(playListeners).toBeGreaterThan(0);

    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });
    // The play handler's subscriptions are gone before the touchdown one runs.
    expect(eventBus.listenerCount(GameEventNames.UI_RollBlockDice)).toBe(0);
    expect(eventBus.listenerCount(GameEventNames.Touchdown)).toBeGreaterThan(0);

    orchestrator.destroy();
    expect(eventBus.listenerCount(GameEventNames.Touchdown)).toBe(0);
  });

  it("lets the local coach skip the celebration beat", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    new SceneOrchestrator(scene as never, makeGameService(), eventBus);

    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });

    // A local match wires a pointer click to the skip intent.
    expect(scene.input.on).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function)
    );
    const skip = scene.input.on.mock.calls[0][1] as () => void;
    let skipped = 0;
    eventBus.on(GameEventNames.UI_SkipDriveSequence, () => skipped++);
    skip();
    expect(skipped).toBe(1);
  });
});
