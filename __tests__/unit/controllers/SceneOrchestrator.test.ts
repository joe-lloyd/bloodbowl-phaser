import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase } from "../../../src/types/GameState";

/**
 * Regression for the reported "game never ends" bug: reaching GAME_OVER must be
 * handled by the orchestrator — it resolves the match and surfaces the result
 * rather than falling through to the unhandled-phase warning.
 */
describe("SceneOrchestrator GAME_OVER handling", () => {
  const team1 = { id: "t1", name: "Reikland Reavers" };
  const team2 = { id: "t2", name: "Gouged Eye" };

  const makeScene = () =>
    ({
      team1,
      team2,
      startSetupPhase: vi.fn(),
      startKickoffPhase: vi.fn(),
    }) as never;

  const makeGameService = (score1: number, score2: number) =>
    ({
      getState: vi.fn(() => ({ phase: GamePhase.PLAY })),
      getActiveTeamId: vi.fn(() => null),
      getScore: vi.fn((id: string) => (id === team1.id ? score1 : score2)),
    }) as never;

  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles GAME_OVER without the unhandled-phase warning and surfaces the result", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    const gameService = makeGameService(2, 1);
    new SceneOrchestrator(scene, gameService, eventBus);

    const notifications: string[] = [];
    eventBus.on(GameEventNames.UI_Notification, (msg) =>
      notifications.push(msg as string)
    );

    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });

    // No unhandled-phase warning for GAME_OVER.
    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes("No handler for phase")
      )
    ).toBe(false);

    // The final result (winner + score) was surfaced to the HUD.
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain(team1.name);
    expect(notifications[0]).toContain("2");
    expect(notifications[0]).toContain("1");
  });

  it("announces a draw when scores are level", () => {
    const eventBus = new EventBus();
    new SceneOrchestrator(makeScene(), makeGameService(1, 1), eventBus);
    const notifications: string[] = [];
    eventBus.on(GameEventNames.UI_Notification, (msg) =>
      notifications.push(msg as string)
    );

    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
    expect(notifications[0].toLowerCase()).toContain("draw");
  });
});
