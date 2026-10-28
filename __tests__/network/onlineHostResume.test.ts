/**
 * A host whose page reloads rebuilds the match from what it last saved.
 * Without its dice state the RNG would start again from the match seed and
 * replay the opening rolls; without its match stats the SPP earned so far
 * would vanish.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnlineMatch } from "../../src/network/OnlineMatch";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { LobbyDoc, DEFAULT_SETTINGS } from "../../src/firebase/lobby";

const saves = vi.hoisted(() => ({ turns: [] as number[] }));
vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistSnapshot: async (
    _code: string,
    snapshot: { turn: { turnNumber: number } }
  ) => {
    saves.turns.push(snapshot.turn.turnNumber);
  },
}));
import { Scenario } from "../../src/types/Scenario";

const midMatch: Scenario = {
  id: "online-host-resume",
  name: "Online host resume",
  description: "",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 5 },
  },
};

afterEach(() => ServiceContainer.reset());

describe("online host resume", () => {
  it("a reloaded host carries on with the saved dice, match stats and turn counts", () => {
    // The match as the host last saved it
    const before = new HeadlessGame({ scenario: midMatch, seed: 11 });
    const { team1, team2 } = before.ctx;
    before.ctx.rng.rollMultipleDice(5, 6);
    before.ctx.matchStats.assignAwardedTouchdown(team1.players[0].id);
    const snapshot = {
      ...before.snapshot(),
      turnManager: {
        turnCounts: { [team1.id]: 3, [team2.id]: 2 },
        driveKickingTeamId: team2.id,
        firstHalfKickingTeamId: team2.id,
        turnoverInProgress: false,
      },
    };
    const hostState = {
      seed: 11,
      rng: before.ctx.rng.captureState(),
      matchStats: before.ctx.matchStats.captureState(),
    };
    const nextRolls = before.ctx.rng.rollMultipleDice(4, 6);

    const lobby: LobbyDoc = {
      code: "RESUME",
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
      seed: null,
      settings: { ...DEFAULT_SETTINGS },
      snapshot,
      players: {
        "host-uid": {
          uid: "host-uid",
          displayName: "Host",
          team: team1,
          ready: true,
        },
        "guest-uid": {
          uid: "guest-uid",
          displayName: "Guest",
          team: team2,
          ready: true,
        },
      },
      createdAt: null,
    };
    const [hostEnd] = createInMemoryTransportPair();
    const match = createOnlineMatch({
      lobby,
      user: {
        uid: "host-uid",
        displayName: "Host",
        email: null,
        photoURL: null,
      },
      eventBus: new EventBus(),
      transport: hostEnd,
      hostState,
    });

    const container = ServiceContainer.getInstance();
    expect(container.rngService.rollMultipleDice(4, 6)).toEqual(nextRolls);
    expect(container.matchStats.captureState()).toEqual(hostState.matchStats);
    expect(container.gameService.getTurnNumber(team1.id)).toBe(3);
    expect(container.gameService.getTurnNumber(team2.id)).toBe(2);
    match.close();
  });

  it("a host saves at every change of turn, so a reload loses at most one turn", async () => {
    const game = new HeadlessGame({ scenario: midMatch, seed: 5 });
    const { team1, team2 } = game.ctx;
    const lobby: LobbyDoc = {
      code: "TURNS",
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
      seed: 5,
      settings: { ...DEFAULT_SETTINGS },
      snapshot: game.snapshot(),
      players: {
        "host-uid": {
          uid: "host-uid",
          displayName: "Host",
          team: team1,
          ready: true,
        },
        "guest-uid": {
          uid: "guest-uid",
          displayName: "Guest",
          team: team2,
          ready: true,
        },
      },
      createdAt: null,
    };
    const [hostEnd] = createInMemoryTransportPair();
    const match = createOnlineMatch({
      lobby,
      user: {
        uid: "host-uid",
        displayName: "Host",
        email: null,
        photoURL: null,
      },
      eventBus: new EventBus(),
      transport: hostEnd,
    });
    const gameService = ServiceContainer.getInstance().gameService;
    const flushed = () => new Promise((resolve) => setTimeout(resolve, 400));

    saves.turns.length = 0;
    gameService.endTurn();
    await flushed();
    gameService.endTurn();
    await flushed();

    // Two turns ended inside the 15 s throttle; both were saved
    expect(saves.turns.length).toBeGreaterThanOrEqual(2);
    match.close();
  });
});
