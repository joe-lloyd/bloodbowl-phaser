import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type LobbyDoc } from "../../src/firebase/lobby";
import { openGames, turnTimerLabel } from "../../src/social/openGames";
import { createOrcTeam } from "../fixtures/teams";

const NOW = 1_000_000;

function lobby(change: Partial<LobbyDoc> = {}): LobbyDoc {
  return {
    code: "ABC234",
    hostUid: "host",
    guestUid: null,
    status: "lobby",
    settings: DEFAULT_SETTINGS,
    players: {
      host: {
        uid: "host",
        displayName: "Grim",
        team: createOrcTeam(),
        ready: false,
        lastSeen: NOW - 10_000,
      },
    },
    createdAt: null,
    listed: true,
    ...change,
  };
}

describe("open games", () => {
  it("lists a listed lobby whose host is still there", () => {
    expect(openGames({ lobbies: [lobby()], now: NOW, me: "guest" })).toEqual([
      {
        code: "ABC234",
        hostName: "Grim",
        teamName: "Da Boyz",
        rosterName: "Orc",
        turnSeconds: 120,
      },
    ]);
  });

  it("leaves out your own lobby, a taken seat, an unlisted lobby and a host gone 90 seconds", () => {
    const gone = lobby();
    const host = gone.players["host"];
    if (host) host.lastSeen = NOW - 90_001;
    const lobbies = [
      gone,
      lobby({ guestUid: "someone" }),
      lobby({ listed: false }),
      lobby({ status: "active" }),
    ];

    expect(openGames({ lobbies, now: NOW, me: "guest" })).toEqual([]);
    expect(openGames({ lobbies: [lobby()], now: NOW, me: "host" })).toEqual([]);
  });

  it("describes the turn timer", () => {
    expect(turnTimerLabel(120)).toBe("2 min turns");
    expect(turnTimerLabel(0)).toBe("No time limit");
  });
});
