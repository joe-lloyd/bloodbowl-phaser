import { fixtureValue } from "../../src/testing/fixtureValue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnlineMatch } from "../../src/network/OnlineMatch";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  type LobbyDoc,
  DEFAULT_SETTINGS,
  type MatchResume,
} from "../../src/firebase/lobby";
import { type Team, RosterName } from "../../src/types/Team";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { CasualtyOperation } from "../../src/game/operations/CasualtyOperation";
import { InjuryResult } from "../../src/game/controllers/InjuryController";

const saves = vi.hoisted(() => {
  const turns: number[] = [];
  const teams: ([Team, Team] | undefined)[] = [];
  return { turns, teams };
});
vi.mock("../../src/firebase/lobby", async (load) => ({
  ...(await load<typeof import("../../src/firebase/lobby")>()),
  persistMatch: async (
    _code: string,
    snapshot: { turn: { turnNumber: number } },
    resume: MatchResume
  ) => {
    saves.turns.push(snapshot.turn.turnNumber);
    saves.teams.push(resume.teams);
  },
}));
import { type Scenario } from "../../src/types/Scenario";

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

afterEach(() => {
  ServiceContainer.reset();
});

describe("online host resume", () => {
  it("restores and persists a complete raised player beyond the original lobby roster", async () => {
    const scenario: Scenario = {
      ...midMatch,
      setup: {
        ...midMatch.setup,
        team1Roster: RosterName.TOMB_KINGS,
        team2Roster: RosterName.HUMAN,
      },
    };
    const before = new HeadlessGame({ scenario, seed: 1 });
    const { team1, team2 } = before.ctx;
    const originalTeams = structuredClone([team1, team2]);
    before.ctx.gameService.flowManager.add(
      new CasualtyOperation(
        fixtureValue(team2.players[0]).id,
        InjuryResult.DEAD
      )
    );
    await before.ctx.gameService.flowManager.whenIdle();
    const raised = fixtureValue(team1.players.at(-1));
    expect(raised.positionName).toBe("Skeleton Lineman");
    raised.status = PlayerStatus.INJURED;
    raised.injuries.push(InjuryType.MISS_NEXT_GAME);
    const lobby: LobbyDoc = {
      code: "RAISED",
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
      settings: { ...DEFAULT_SETTINGS },
      snapshot: before.snapshot(),
      resume: {
        rng: before.ctx.rng.captureState(),
        matchStats: before.ctx.matchStats.captureState(),
        applied: 4,
        teams: structuredClone([team1, team2]),
      },
      players: {
        "host-uid": {
          uid: "host-uid",
          displayName: "Host",
          team: fixtureValue(originalTeams[0]),
          ready: true,
        },
        "guest-uid": {
          uid: "guest-uid",
          displayName: "Guest",
          team: fixtureValue(originalTeams[1]),
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
        emailVerified: false,
        photoURL: null,
      },
      eventBus: new EventBus(),
      transport: hostEnd,
      seed: 1,
    });
    try {
      expect(match.teams.team1.players.find((p) => p.id === raised.id)).toEqual(
        {
          ...raised,
          conditions: [],
        }
      );
      saves.teams.length = 0;
      match.saveState();
      expect(
        saves.teams[0]?.[0].players.find((p) => p.id === raised.id)
      ).toEqual({ ...raised, conditions: [] });
    } finally {
      match.close();
    }
  });
  it("a reloaded coach carries on with the saved dice, match stats and turn counts", () => {
    const before = new HeadlessGame({ scenario: midMatch, seed: 11 });
    const { team1, team2 } = before.ctx;
    before.ctx.rng.rollMultipleDice(5, 6);
    before.ctx.matchStats.assignAwardedTouchdown(
      fixtureValue(team1.players[0]).id
    );
    const snapshot = {
      ...before.snapshot(),
      turnManager: {
        turnCounts: { [team1.id]: 3, [team2.id]: 2 },
        driveKickingTeamId: team2.id,
        firstHalfKickingTeamId: team2.id,
        turnoverInProgress: false,
      },
    };
    const resume = {
      rng: before.ctx.rng.captureState(),
      matchStats: before.ctx.matchStats.captureState(),
      applied: 40,
    };
    const nextRolls = before.ctx.rng.rollMultipleDice(4, 6);

    const lobby: LobbyDoc = {
      code: "RESUME",
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
      settings: { ...DEFAULT_SETTINGS },
      snapshot,
      resume,
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
        emailVerified: false,
        photoURL: null,
      },
      eventBus: new EventBus(),
      transport: hostEnd,
      seed: 11,
    });

    const container = ServiceContainer.getInstance();
    expect(container.rngService.rollMultipleDice(4, 6)).toEqual(nextRolls);
    expect(container.matchStats.captureState()).toEqual(resume.matchStats);
    expect(container.gameService.getTurnNumber(team1.id)).toBe(3);
    expect(container.gameService.getTurnNumber(team2.id)).toBe(2);
    match.close();
  });

  it("the coach who ends their turn saves the match, so a reload loses at most one turn", async () => {
    const game = new HeadlessGame({ scenario: midMatch, seed: 5 });
    const { team1, team2 } = game.ctx;
    const lobby: LobbyDoc = {
      code: "TURNS",
      hostUid: "host-uid",
      guestUid: "guest-uid",
      status: "active",
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
        emailVerified: false,
        photoURL: null,
      },
      eventBus: new EventBus(),
      transport: hostEnd,
      seed: 5,
    });
    const gameService = ServiceContainer.getInstance().gameService;
    const flushed = () => new Promise((resolve) => setTimeout(resolve, 200));

    saves.turns.length = 0;

    gameService.endTurn();

    for (let i = 0; i < 25 && saves.turns.length === 0; i++) await flushed();

    expect(saves.turns.length).toBe(1);
    match.close();
  });
});
