import { beforeEach, describe, expect, it, vi } from "vitest";
import { Team } from "../../src/types/Team";
import { CompetitionEntrant } from "../../src/competition/types";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

const otherCoachTeams: { ownerUid: string; team: Team }[] = [];
vi.mock("../../src/firebase/cloudTeamRepository", () => ({
  fetchAllCoachTeams: vi.fn(async () => otherCoachTeams),
}));

import {
  loadTeams,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import {
  fetchEntrantTeam,
  refreshEntrantDisplays,
} from "../../src/competition/teamRefs";
import { RosterName } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import {
  applyAdvancement,
  eligibleSkills,
} from "../../src/game/progression/progression";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";

function team(id: string, overrides: Partial<Team> = {}): Team {
  return {
    id,
    name: id.toUpperCase(),
    rosterName: "Human",
    players: [],
    wins: 0,
    draws: 0,
    losses: 0,
    touchdowns: 0,
    ...overrides,
  } as unknown as Team;
}

function localEntrant(overrides: Partial<CompetitionEntrant> = {}): CompetitionEntrant {
  return {
    id: "e1",
    teamId: "home",
    ownerUid: null,
    name: "Home (stale)",
    rosterName: "Human",
    seed: 1,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
  otherCoachTeams.length = 0;
});

describe("fetchEntrantTeam", () => {
  it("resolves an entrant through this coach's own team library", async () => {
    saveTeams([team("home")]);
    const resolved = await fetchEntrantTeam(localEntrant());
    expect(resolved?.id).toBe("home");
  });

  it("resolves another coach's entrant through the live cross-coach read", async () => {
    otherCoachTeams.push({
      ownerUid: "coach-1",
      team: team("away", { name: "Away Live" }),
    });
    const resolved = await fetchEntrantTeam(
      localEntrant({
        id: "e2",
        teamId: "away",
        ownerUid: "coach-1",
      })
    );
    expect(resolved?.name).toBe("Away Live");
  });

  it("returns null when the entrant's team cannot be found anywhere", async () => {
    const resolved = await fetchEntrantTeam(localEntrant({ teamId: "missing" }));
    expect(resolved).toBeNull();
  });

  it("a skill gained after round one is present when round two's entrant is resolved", async () => {
    // A real roster, a real player, a real advancement — mirrors the
    // league-builder spec's scenario: advancement gained in round one must
    // be present when round two fetches the entrant's live roster.
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const homeTeam = team("home", { rosterName: RosterName.HUMAN });
    homeTeam.players = [createPlayer(roster.playerTemplates[0], "home", 1)];
    saveTeams([homeTeam]);

    // Round one: the player earns SPP and takes a skill, then the team saves
    // (exactly what recordCompetitionFixture's updateTeamRecord does).
    const afterRoundOne = loadTeams().find((candidate) => candidate.id === "home")!;
    const player = afterRoundOne.players[0];
    player.spp = 1000;
    const [skill] = eligibleSkills(player, player.primary ?? []);
    applyAdvancement(player, { kind: "chosen-primary", skill });
    saveTeams([afterRoundOne]);

    // Round two: the fixture launch fetches the entrant's roster by reference.
    const roundTwoTeam = await fetchEntrantTeam(localEntrant());
    const roundTwoPlayer = roundTwoTeam?.players[0];
    expect(roundTwoPlayer?.skills.some((s) => s.type === skill)).toBe(true);
    expect(roundTwoPlayer?.advancements).toHaveLength(1);
  });
});

describe("refreshEntrantDisplays", () => {
  it("refreshes a local entrant's cached name from the live team", () => {
    const renamed = team("home", { name: "New Name" });
    const competition = {
      id: "c1",
      type: "league" as const,
      name: "League",
      organizerUid: null,
      participantUids: [],
      status: "active" as const,
      entrants: [localEntrant()],
      fixtures: [],
      standings: [],
      points: { win: 3, draw: 1, loss: 0 },
      createdAt: 0,
      updatedAt: 0,
    };

    const refreshed = refreshEntrantDisplays(competition, [renamed]);
    expect(refreshed.entrants[0].name).toBe("New Name");
  });

  it("returns the same object when nothing changed", () => {
    const sameNamed = team("home", { name: "Home (stale)" });
    const competition = {
      id: "c1",
      type: "league" as const,
      name: "League",
      organizerUid: null,
      participantUids: [],
      status: "active" as const,
      entrants: [localEntrant({ rosterName: "Human" })],
      fixtures: [],
      standings: [],
      points: { win: 3, draw: 1, loss: 0 },
      createdAt: 0,
      updatedAt: 0,
    };

    const refreshed = refreshEntrantDisplays(competition, [sameNamed]);
    expect(refreshed).toBe(competition);
  });
});
