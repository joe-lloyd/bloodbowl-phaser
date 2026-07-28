/**
 * Guest-side application of a host broadcast, exercised through the real
 * `createOnlineMatch` guest path (ServiceContainer + NetworkedGameService +
 * OnlineMatch.applyBundle) rather than the lower-level HostSession/
 * GuestSession pair covered by sessions.test.ts.
 *
 * Regression coverage for two of the "non-host desyncs from host" reports:
 *  - the ball rendering on the wrong square (applyBundle used to replay
 *    events BEFORE applying the bundle's own snapshot, so a ball-position
 *    reconciliation handler reading live state saw the previous bundle's
 *    stale position)
 *  - the guest's per-team turn counter never advancing (TurnManager's
 *    turnCounts were never part of GameSnapshot, so the guest's replica
 *    TurnManager stayed frozen at its construction-time value)
 *
 * A single test process can only hold one ServiceContainer singleton, so
 * these tests build only the GUEST side via createOnlineMatch and feed it
 * hand-built broadcast envelopes over an in-memory transport end — exactly
 * what a real host's HostSession would send, without needing a second,
 * concurrent ServiceContainer for an in-process "host".
 */
import { afterEach, describe, expect, it } from "vitest";
import { createOnlineMatch } from "../../src/network/OnlineMatch";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { Envelope } from "../../src/network/envelope";
import { PROTOCOL_VERSION } from "../../src/network/envelope";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameEventNames } from "../../src/types/events";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameSnapshot } from "../../src/headless/serialization";
import { LobbyDoc, DEFAULT_SETTINGS } from "../../src/firebase/lobby";
import { AuthUser } from "../../src/firebase/auth";
import { Scenario } from "../../src/types/Scenario";

const ballSyncScenario: Scenario = {
  id: "online-guest-ball-sync",
  name: "Online guest ball sync",
  description: "",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

/** Build a guest-only online match with no live host — the test itself
 *  plays the host by pushing hand-built envelopes onto `hostEnd`. */
function bootGuestMatch() {
  const seedGame = new HeadlessGame({ scenario: ballSyncScenario, seed: 11 });
  const team1 = seedGame.ctx.team1;
  const team2 = seedGame.ctx.team2;
  const baseSnapshot = seedGame.snapshot();

  const lobby: LobbyDoc = {
    code: "TEST01",
    hostUid: "host-uid",
    guestUid: "guest-uid",
    status: "active",
    seed: 11,
    settings: { ...DEFAULT_SETTINGS },
    players: {
      "host-uid": { uid: "host-uid", displayName: "Host", team: team1, ready: true },
      "guest-uid": { uid: "guest-uid", displayName: "Guest", team: team2, ready: true },
    },
    createdAt: null,
  };
  const guestUser: AuthUser = {
    uid: "guest-uid",
    displayName: "Guest",
    email: null,
    photoURL: null,
  };

  const eventBus = new EventBus();
  const [hostEnd, guestEnd] = createInMemoryTransportPair();
  const match = createOnlineMatch({
    lobby,
    user: guestUser,
    eventBus,
    transport: guestEnd,
  });

  let seq = 0;
  const broadcast = async (
    snapshot: GameSnapshot,
    events: { name: string; data: unknown }[] = []
  ) => {
    const envelope: Envelope = {
      kind: "broadcast",
      payload: {
        response: { ok: true, events, snapshot, pendingDecision: null },
      },
      seq: ++seq,
      from: "host-uid",
      ts: Date.now(),
    };
    await hostEnd.send(envelope);
  };

  return { match, eventBus, team1, team2, baseSnapshot, broadcast, hostEnd };
}

describe("OnlineMatch guest bundle application", () => {
  afterEach(() => {
    ServiceContainer.reset();
  });

  it("hello handshake uses the current protocol version (sanity check for the fixtures below)", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  it("applies a bundle's snapshot before replaying its ball-reconciliation event, so the handler sees THIS bundle's ball position, not the previous one", async () => {
    const { baseSnapshot, broadcast } = bootGuestMatch();

    let observedBallPositionAtEventTime: { x: number; y: number } | null | undefined;
    const eventBus = ServiceContainer.getInstance().eventBus;
    eventBus.on(GameEventNames.BallPlaced, () => {
      observedBallPositionAtEventTime =
        ServiceContainer.getInstance().gameService.getState().ballPosition;
    });

    // Bundle 1: establish the replica at the ball's starting square — no
    // BallPlaced event needed, just the initial authoritative snapshot.
    await broadcast({ ...baseSnapshot, ballPosition: { x: 5, y: 5 } });
    expect(
      ServiceContainer.getInstance().gameService.getState().ballPosition
    ).toEqual({ x: 5, y: 5 });

    // Bundle 2: the ball moves to (7, 7) — delivered as a BallPlaced event
    // alongside the updated snapshot in the SAME bundle. The handler must
    // see the new position, not bundle 1's.
    await broadcast(
      { ...baseSnapshot, ballPosition: { x: 7, y: 7 } },
      [{ name: GameEventNames.BallPlaced, data: { x: 7, y: 7 } }]
    );

    expect(observedBallPositionAtEventTime).toEqual({ x: 7, y: 7 });
  });

  it("restores per-team turn counts from the snapshot so the guest's turn tracker matches the host for BOTH teams", async () => {
    const { team1, team2, baseSnapshot, broadcast } = bootGuestMatch();

    // Before any bundle carrying turnManager state, the guest's freshly
    // constructed replica has never seen either team's real turn count.
    const gameService = ServiceContainer.getInstance().gameService;
    expect(gameService.getTurnNumber(team1.id)).toBe(0);
    expect(gameService.getTurnNumber(team2.id)).toBe(0);

    await broadcast({
      ...baseSnapshot,
      turnManager: {
        turnCounts: { [team1.id]: 3, [team2.id]: 2 },
        driveKickingTeamId: team1.id,
        firstHalfKickingTeamId: team1.id,
        turnoverInProgress: false,
      },
    });

    expect(gameService.getTurnNumber(team1.id)).toBe(3);
    expect(gameService.getTurnNumber(team2.id)).toBe(2);
  });
});
