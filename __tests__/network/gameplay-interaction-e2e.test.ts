/**
 * End-to-end regression for fix-multiplayer-infinite-block-desync.
 *
 * Everything else touching this bug is tested in isolation:
 * - sessions.test.ts pins the HOST's protocol-level refusals (HostSession/
 *   GuestSession directly, no NetworkedGameService/controller involved).
 * - defer-action-commitment.test.ts pins that NetworkedGameService emits
 *   NetworkCommandRejected with the right payload (a hand-mocked dispatch).
 * - GameplayInteractionController.test.ts pins the reconciliation logic in
 *   isolation (onNetworkCommandRejected called directly with a hand-built
 *   payload, a fully mocked IGameService).
 *
 * None of those drive a real command from a real GameplayInteractionController
 * through a real NetworkedGameService, over a real (in-memory) transport, to
 * a real host engine, and back — which is exactly the path the captured bug
 * traveled. This file wires that whole chain for real and asserts the
 * controller's local step-machine actually reconciles when the genuine
 * network round trip comes back as a rejection.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { HostSession } from "../../src/network/HostSession";
import { GuestSession } from "../../src/network/GuestSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameService } from "../../src/services/GameService";
import { EventBus } from "../../src/services/EventBus";
import {
  applySnapshotToTeams,
  deserializeGameState,
} from "../../src/headless/serialization";
import { HeadlessCommand, CommandResponse } from "../../src/headless/protocol";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";

const bloodlustDesyncScenario: Scenario = {
  id: "e2e-bloodlust-desync",
  name: "E2E Bloodlust desync",
  description:
    "Guest's Bloodlust-skilled player commits via the activation gate; a stale cancel/redeclare that follows must reconcile the guest's real UI, not just its engine replica.",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    team2Placements: [
      { playerIndex: 0, x: 4, y: 5, skills: [SkillType.BLOODLUST] },
    ],
    activeTeam: "team2",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

/** Minimal Phaser-free stand-ins — same shape as GameplayInteractionController's
 *  own unit tests use. Rendering isn't under test here; the network/state
 *  round trip is. */
function makeSceneMocks(team1: unknown, team2: unknown) {
  const scene = {
    highlightPlayer: vi.fn(),
    unhighlightPlayer: vi.fn(),
    setKickoffSolidDefenceDragPlayers: vi.fn(),
    team1,
    team2,
    add: { rectangle: vi.fn(), container: vi.fn() },
  };
  const pitch = {
    getContainer: vi.fn(() => ({ x: 0, y: 0 })),
    highlightHoverSquare: vi.fn(),
    highlightSquare: vi.fn(),
    drawRangeOverlay: vi.fn(),
    drawTackleZones: vi.fn(),
    drawMovementPath: vi.fn(),
    drawSprintRisks: vi.fn(),
    clearPath: vi.fn(),
    clearHighlights: vi.fn(),
    clearHover: vi.fn(),
    clearPassVisualization: vi.fn(),
    drawPassZones: vi.fn(),
    drawPassLine: vi.fn(),
    drawInterceptZone: vi.fn(),
    drawHandoffTargets: vi.fn(),
    clearLayer: vi.fn(),
  };
  const movementValidator = {
    findPath: vi.fn(),
    analyzePath: vi.fn().mockReturnValue({ requiresDodge: false }),
    findReachableSquares: vi.fn().mockReturnValue([]),
  };
  return { scene, pitch, movementValidator };
}

describe("e2e: guest reconciliation over a real network round trip", () => {
  afterEach(() => {
    ServiceContainer.reset();
  });

  it("reconciles a real cancel-action rejection and a real declare-action rejection, both driven by the actual controller through a live host/guest pair", async () => {
    // ===== Host: a real HeadlessGame/GameService, exactly as HostSession
    // executes guest commands against in production. =====
    const hostGame = new HeadlessGame({
      scenario: bloodlustDesyncScenario,
      seed: 5,
    });
    const hostTeamId = hostGame.ctx.team1.id;
    const guestTeamId = hostGame.ctx.team2.id;
    const vampireId = hostGame.ctx.team2.players[0].id;
    const opponentId = hostGame.ctx.team1.players[0].id;

    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const hostSession = new HostSession({
      transport: hostEnd,
      game: hostGame,
      hostTeamId,
      guestTeamId,
      selfId: "host-uid",
    });

    // ===== Guest: independent team object graphs (as a real second browser
    // would deserialize its own copy of the lobby's team data), a real
    // passive replica GameService, and the real NetworkedGameService proxy —
    // the same factory wiring OnlineMatch.ts uses for a live match. =====
    const guestTeam1 = structuredClone(hostGame.ctx.team1);
    const guestTeam2 = structuredClone(hostGame.ctx.team2);
    const guestEventBus = new EventBus();

    let pendingDecision: CommandResponse["pendingDecision"] = null;
    let guestReplica: GameService | null = null;
    // Captures whatever command NetworkedGameService most recently sent, so
    // the test can await the REAL round trip (host processing + response +
    // NetworkedGameService's own rejection-handling .then()) instead of the
    // fire-and-forget send() racing ahead of assertions.
    let lastRoundTrip: Promise<CommandResponse> = Promise.resolve({
      ok: true,
      events: [],
      snapshot: hostGame.snapshot(),
      pendingDecision: null,
    });
    const dispatch = (command: HeadlessCommand): Promise<CommandResponse> => {
      const roundTrip = guestSession.sendCommand(command);
      lastRoundTrip = roundTrip;
      return roundTrip;
    };

    const guestInitialState = GameService.createInitialState(
      guestTeam1,
      guestTeam2,
      GamePhase.SETUP,
      SubPhase.INTRO
    );
    const container = ServiceContainer.initialize(
      guestEventBus,
      guestTeam1,
      guestTeam2,
      guestInitialState,
      5,
      (inner) => {
        guestReplica = inner;
        return new NetworkedGameService(
          inner,
          dispatch,
          () => pendingDecision,
          guestEventBus
        );
      },
      false
    );
    const guestGameService = container.gameService;

    const guestSession = new GuestSession({
      transport: guestEnd,
      selfId: "guest-uid",
      onApply: (response) => applyToReplica(response.snapshot, response.pendingDecision),
      onBroadcast: (payload) =>
        applyToReplica(payload.response.snapshot, payload.response.pendingDecision),
      onResync: (payload) => applyToReplica(payload.snapshot, payload.pendingDecision),
    });

    function applyToReplica(
      snapshot: CommandResponse["snapshot"],
      pending: CommandResponse["pendingDecision"]
    ): void {
      if (guestReplica) {
        applySnapshotToTeams(snapshot, [guestTeam1, guestTeam2]);
        Object.assign(guestReplica.getState(), deserializeGameState(snapshot));
      }
      pendingDecision = pending;
    }

    // Bring the guest's replica up to the host's current (already-mid-PLAY)
    // authoritative state — mirrors the real hello -> resync bootstrap.
    await hostSession.sendResync();

    // ===== A real GameplayInteractionController, wired to the real guest
    // event bus and the real NetworkedGameService. =====
    const { scene, pitch, movementValidator } = makeSceneMocks(
      guestTeam1,
      guestTeam2
    );
    const controller = new GameplayInteractionController(
      scene as never,
      guestGameService,
      guestEventBus,
      pitch as never,
      movementValidator as never
    );

    const notifications: string[] = [];
    guestEventBus.on(GameEventNames.UI_Notification, (message) => {
      if (typeof message === "string") notifications.push(message);
    });

    // ----- 1. Commit a real declaration on the host via the real UI path -----
    controller.selectPlayer(vampireId);
    await (controller as any).onActionSelected({
      action: "handoff",
      playerId: vampireId,
    });
    await lastRoundTrip;

    // Bloodlust's downgrade-to-Move reaction, if the roll failed: decline it
    // so the committed action is deterministically still "handoff" (a
    // once-per-turn action — required for the redeclare rejection below).
    if (pendingDecision?.type === "reaction") {
      guestGameService.answerReaction(false);
      await lastRoundTrip;
    }

    expect(hostGame.snapshot().activePlayer).toMatchObject({
      id: vampireId,
      action: "handoff",
      committed: true,
    });
    expect((controller as any).currentActionMode).toBe("handoff");

    // ----- 2. A stale "Back" click: optimistic locally, really rejected -----
    (controller as any).onCancelAction();
    // Optimistic: the controller already believes the menu reset.
    expect((controller as any).currentActionMode).toBeNull();
    await lastRoundTrip;

    // The host really refused it — over the real wire, through the real
    // NetworkedGameService, into the real NetworkCommandRejected handler.
    expect(
      notifications.some((message) => message.includes("out of sync"))
    ).toBe(true);
    // Reconciliation re-selected the same player (not left deselected).
    expect((controller as any).selectedPlayerId).toBe(vampireId);
    expect((controller as any).currentActionMode).toBeNull();
    // The host's committed Hand-off was never actually touched.
    expect(hostGame.snapshot().activePlayer).toMatchObject({
      id: vampireId,
      action: "handoff",
      committed: true,
    });

    // ----- 3. A stale redeclare, believing the cancel had gone through -----
    notifications.length = 0;
    await (controller as any).onActionSelected({
      action: "blitz",
      playerId: vampireId,
    });
    // Optimistic: the controller already switched to the Blitz step-machine
    // (Move, Block) — this is exactly the state the captured bug's guest UI
    // got stuck in ("Switched action step to: block").
    expect((controller as any).currentActionMode).toBe("blitz");
    await lastRoundTrip;

    // The host really refused THIS too (illegal-action-declaration) — and
    // the real rejection reconciled the controller instead of leaving it
    // stranded on a Blitz/Block step the host never accepted.
    expect(
      notifications.some((message) => message.includes("out of sync"))
    ).toBe(true);
    expect((controller as any).currentActionMode).toBeNull();
    expect((controller as any).actionSteps).toEqual([]);

    // ----- 4. Sanity: a real block attempt in this (now-clean) state still
    // correctly fails — proving there is no leftover "block" step to loop
    // on, the actual symptom the captured log showed. -----
    const blockedResponse = await dispatch({
      type: "block",
      attackerId: vampireId,
      defenderId: opponentId,
    });
    expect(blockedResponse.ok).toBe(false);
    expect(blockedResponse.reason).toBe("command-failed: block-not-declared");

    // The original committed Hand-off is still exactly what it was —
    // nothing in this whole stale sequence, guest-side or host-side, ever
    // mutated it.
    expect(hostGame.snapshot().activePlayer).toMatchObject({
      id: vampireId,
      action: "handoff",
      committed: true,
    });
  });
});
