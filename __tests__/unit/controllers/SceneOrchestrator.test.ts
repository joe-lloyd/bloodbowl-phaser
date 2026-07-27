import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SceneOrchestrator } from "../../../src/game/controllers/SceneOrchestrator";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { GamePhase } from "../../../src/types/GameState";

/**
 * Regression for the reported "game never ends" bug: reaching GAME_OVER must be
 * handled by the orchestrator — it stops routing to a phase handler rather than
 * falling through to the unhandled-phase warning. The full-time announcement
 * itself now lives in GameService (see GameService.test.ts's "Full time
 * announcement" suite) — it runs at the engine level so headless matches
 * announce identically to the browser, instead of only from a Phaser scene.
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

  const makeGameService = () =>
    ({
      getState: vi.fn(() => ({ phase: GamePhase.PLAY })),
      getActiveTeamId: vi.fn(() => null),
    }) as never;

  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles GAME_OVER without the unhandled-phase warning", () => {
    const eventBus = new EventBus();
    const scene = makeScene();
    const gameService = makeGameService();
    new SceneOrchestrator(scene, gameService, eventBus);

    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });

    // No unhandled-phase warning for GAME_OVER.
    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes("No handler for phase")
      )
    ).toBe(false);
  });
});
