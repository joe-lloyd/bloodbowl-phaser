import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { readLobby } from "../../src/boundary/firebaseLobby";
import { createComputerTeamFromTemplate } from "../../src/competition/computerTeamTemplates";
import {
  canStart,
  DEFAULT_SETTINGS,
  type LobbyDoc,
  teamFitsLobby,
} from "../../src/firebase/lobby";
import type { TeamValueRange } from "../../src/social/teamValueRange";

const goblins = createComputerTeamFromTemplate("goblin-max-weapons");

function readyLobby(teamValue: TeamValueRange, fixture = false): LobbyDoc {
  return {
    code: "RANGE1",
    hostUid: "host",
    guestUid: "guest",
    status: "lobby",
    settings: { ...DEFAULT_SETTINGS, teamValue },
    players: {
      host: { uid: "host", displayName: "Host", team: goblins, ready: true },
      guest: { uid: "guest", displayName: "Guest", team: goblins, ready: true },
    },
    seedCommits: { host: "a", guest: "b" },
    seedReveals: { host: "c", guest: "d" },
    createdAt: null,
    ...(fixture
      ? { competitionContext: { competitionType: "league" as const, competitionId: "cup", fixtureId: "round-1-match-1" } }
      : {}),
  };
}

describe("a lobby's team value range", () => {
  it("lets a 490k team start inside 450k to 500k, and stops it under a 450k cap", () => {
    expect(canStart(readyLobby({ min: 450_000, max: 500_000 }))).toBe(true);
    expect(canStart(readyLobby({ max: 450_000 }))).toBe(false);
    expect(teamFitsLobby(goblins, readyLobby({ min: 500_000 }))).toBe(false);
  });

  it("does not apply to a competition fixture, whose teams are fixed", () => {
    expect(teamFitsLobby(goblins, readyLobby({ max: 400_000 }, true))).toBe(true);
  });

  it("is read back from a stored lobby in every shape the settings write", () => {
    for (const teamValue of [{}, { min: 450_000 }, { max: 500_000 }, { min: 450_000, max: 500_000 }]) {
      const stored: unknown = structuredClone(readyLobby(teamValue));
      expect(readLobby(stored).settings.teamValue).toEqual(teamValue);
    }
  });
});
