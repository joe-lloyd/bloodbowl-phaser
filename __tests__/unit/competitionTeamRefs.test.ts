import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Team } from "../../src/types/Team";
import { type CompetitionEntrant } from "../../src/competition/types";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

const viewer = vi.hoisted((): { uid: string | null } => ({ uid: null }));
vi.mock("../../src/firebase/auth", () => ({
  getCurrentUser: () => (viewer.uid ? { uid: viewer.uid } : null),
}));

const otherCoachTeams: { ownerUid: string; team: Team }[] = [];
vi.mock("../../src/firebase/cloudTeamRepository", () => ({
  fetchCoachTeam: vi.fn(
    async ({ ownerUid, teamId }: { ownerUid: string; teamId: string }) =>
      otherCoachTeams.find(
        (owned) => owned.ownerUid === ownerUid && owned.team.id === teamId
      )?.team ?? null
  ),
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

function localEntrant(
  overrides: Partial<CompetitionEntrant> = {}
): CompetitionEntrant {
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
  viewer.uid = null;
});

describe("another coach's entrant that names one of your team ids", () => {
  const copied = () =>
    localEntrant({ id: "coach:mallory:home", ownerUid: "mallory", name: "Mallory's entry" });

  it("never loads or relabels your own team for it", async () => {
    viewer.uid = "amy";
    await saveTeams([team("home", { name: "Amy's Team" })]);
    otherCoachTeams.push({ ownerUid: "mallory", team: team("home", { name: "Mallory's Team" }) });

    expect((await fetchEntrantTeam(copied()))?.name).toBe("Mallory's Team");
    const competition = {
      id: "c1",
      type: "league" as const,
      name: "League",
      organizerUid: "amy",
      participantUids: ["mallory"],
      status: "active" as const,
      entrants: [copied()],
      fixtures: [],
      standings: [],
      points: { win: 3, draw: 1, loss: 0 },
      createdAt: 0,
      updatedAt: 0,
    };
    expect(refreshEntrantDisplays(competition).entrants[0]?.name).toBe("Mallory's entry");
  });
});

describe("fetchEntrantTeam", () => {
  it("resolves an entrant through this coach's own team library", async () => {
    saveTeams([team("home")]);
    const resolved = await fetchEntrantTeam(localEntrant());
    expect(resolved?.id).toBe("home");
  });

  it("resolves another coach's entrant by reading that coach's team", async () => {
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
    const resolved = await fetchEntrantTeam(
      localEntrant({ teamId: "missing" })
    );
    expect(resolved).toBeNull();
  });

  it("a skill gained after round one is present when round two's entrant is resolved", async () => {
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const homeTeam = team("home", { rosterName: RosterName.HUMAN });
    homeTeam.players = [createPlayer(fixtureValue(roster.playerTemplates[0]), "home", 1)];
    saveTeams([homeTeam]);

    const afterRoundOne = fixtureValue(loadTeams().find(
      (candidate) => candidate.id === "home"
    ));
    const player = afterRoundOne.players[0];
    fixtureValue(player).spp = 1000;
    const skill = fixtureValue(eligibleSkills(fixtureValue(player), fixtureValue(player).primary ?? [])[0]);
    applyAdvancement(fixtureValue(player), { kind: "chosen-primary", skill });
    saveTeams([afterRoundOne]);

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
    expect(fixtureValue(refreshed.entrants[0]).name).toBe("New Name");
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
