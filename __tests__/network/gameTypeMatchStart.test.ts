import { afterEach, describe, expect, it } from "vitest";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import {
  createOnlineMatch,
  type OnlineMatch,
} from "../../src/network/OnlineMatch";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { createLineupTeam } from "../../src/simulation/lineups";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { DEFAULT_SETTINGS, type LobbyDoc } from "../../src/firebase/lobby";
import {
  ensureMatchServices,
  resolveMatchStart,
} from "../../src/scenes/matchStart";
import { RosterName } from "../../src/types/Team";
import type { GameType } from "../../src/game/variants/gameTypes";

const matches: OnlineMatch[] = [];
afterEach(() => {
  matches.splice(0).forEach((match) => {
    match.close();
  });
  ServiceContainer.reset();
});

const teams = () => ({
  team1: stabilizeIds(createLineupTeam(RosterName.HUMAN, "H", 1), "team1"),
  team2: stabilizeIds(createLineupTeam(RosterName.ORC, "O", 2), "team2"),
});

const format = () => {
  const state = ServiceContainer.getInstance().gameService.getState();
  return [state.gameType, state.venue];
};

describe("a friendly match on the local screen", () => {
  it("starts on the Beach Bowl sand when the coaches pick Beach Bowl", () => {
    window.eventBus = new EventBus();
    ensureMatchServices(
      resolveMatchStart({ ...teams(), gameType: "beach-bowl" }, "GameScene"),
      false
    );
    expect(format()).toEqual(["beach-bowl", "beach"]);
  });

  it("follows a competition fixture's game type over the friendly choice", () => {
    window.eventBus = new EventBus();
    ensureMatchServices(
      resolveMatchStart(
        {
          ...teams(),
          gameType: "beach-bowl",
          competitionContext: {
            gameType: "street-bowl",
            competitionType: "league",
            competitionId: "league-1",
            fixtureId: "f1",
          },
        },
        "GameScene"
      ),
      false
    );
    expect(format()).toEqual(["street-bowl", "street"]);
  });

  it("keeps Sevens on the stadium with no format fields", () => {
    window.eventBus = new EventBus();
    ensureMatchServices(resolveMatchStart(teams(), "GameScene"), false);
    expect(format()).toEqual([undefined, undefined]);
  });
});

describe("a match against the computer", () => {
  it("plays the chosen game type", () => {
    const match = createComputerMatch({
      eventBus: new EventBus(),
      ...teams(),
      computerTeamId: "team2",
      gameType: "street-bowl",
    });
    matches.push(match);
    expect(format()).toEqual(["street-bowl", "street"]);
  });
});

function lobbyFor(gameType: GameType): LobbyDoc {
  const { team1, team2 } = teams();
  return {
    code: "GUTTER",
    hostUid: "host",
    guestUid: "guest",
    status: "active",
    settings: { ...DEFAULT_SETTINGS, gameType },
    players: {
      host: { uid: "host", displayName: "Host", ready: true, team: team1 },
      guest: { uid: "guest", displayName: "Guest", ready: true, team: team2 },
    },
    createdAt: null,
  };
}

function venueOnline(lobby: LobbyDoc, uid: string, seed: number) {
  const [transport] = createInMemoryTransportPair();
  const match = createOnlineMatch({
    lobby: structuredClone(lobby),
    user: {
      uid,
      displayName: uid,
      email: null,
      emailVerified: true,
      photoURL: null,
    },
    eventBus: new EventBus(),
    transport,
    seed,
  });
  matches.push(match);
  return format();
}

describe("an online match", () => {
  it("rolls the same Gutter Bowl venue on both machines from the shared seed (GB-P1)", () => {
    const lobby = lobbyFor("gutter-bowl");
    expect(venueOnline(lobby, "host", 8)).toEqual([
      "gutter-bowl",
      "gutter-street",
    ]);
    expect(venueOnline(lobby, "guest", 8)).toEqual([
      "gutter-bowl",
      "gutter-street",
    ]);
    expect(venueOnline(lobby, "host", 9)).toEqual([
      "gutter-bowl",
      "gutter-sewer",
    ]);
  });
});
