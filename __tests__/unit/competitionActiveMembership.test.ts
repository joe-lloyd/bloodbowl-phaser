import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import {
  clearActiveCompetition,
  recordCompetitionFixture,
  withdrawFromCompetition,
} from "../../src/competition/resultRecording";
import { CompetitionEntrant, LeagueDoc } from "../../src/competition/types";
import {
  getTeamById,
  loadTeams,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function team(id: string, activeCompetitionId?: string): Team {
  return {
    id,
    name: id.toUpperCase(),
    rosterName: "Human",
    players: [],
    wins: 0,
    draws: 0,
    losses: 0,
    touchdowns: 0,
    ...(activeCompetitionId ? { activeCompetitionId } : {}),
  } as unknown as Team;
}

function buildLeague(id: string, teams: Team[]): LeagueDoc {
  const entrants: CompetitionEntrant[] = teams.map((candidate, index) => ({
    id: `local:${candidate.id}`,
    teamId: candidate.id,
    ownerUid: null,
    name: candidate.name,
    rosterName: candidate.rosterName,
    seed: index + 1,
    source: "local",
  }));
  const fixtures = generateRoundRobin(entrants);
  return {
    id,
    type: "league",
    name: "Season",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("clearActiveCompetition", () => {
  it("clears the field when it points at the given competition", () => {
    saveTeams([team("home", "season")]);
    clearActiveCompetition("home", "season");
    expect(getTeamById("home")?.activeCompetitionId).toBeUndefined();
  });

  it("leaves the field untouched when it points elsewhere", () => {
    saveTeams([team("home", "other-season")]);
    clearActiveCompetition("home", "season");
    expect(getTeamById("home")?.activeCompetitionId).toBe("other-season");
  });

  it("is a no-op when the team cannot be found", () => {
    expect(() => clearActiveCompetition("missing", "season")).not.toThrow();
  });
});

describe("completing a competition frees its entrants", () => {
  it("clears activeCompetitionId once the season finishes", async () => {
    const teams = [team("home", "season"), team("away", "season")];
    saveTeams(teams);
    const league = buildLeague("season", teams);
    await saveCompetition(league);

    // A two-team round robin is exactly one fixture; recording it completes
    // the league (competition/logic.ts: status becomes "complete").
    const context = {
      competitionType: "league" as const,
      competitionId: league.id,
      fixtureId: league.fixtures[0].id,
    };
    const updated = await recordCompetitionFixture(context, 2, 1);

    expect(updated.status).toBe("complete");
    const saved = loadTeams();
    expect(
      saved.find((candidate) => candidate.id === "home")?.activeCompetitionId
    ).toBeUndefined();
    expect(
      saved.find((candidate) => candidate.id === "away")?.activeCompetitionId
    ).toBeUndefined();
  });
});

describe("withdrawing frees the team", () => {
  it("marks the entrant withdrawn and clears the team's association", async () => {
    const teams = [
      team("home", "season"),
      team("away", "season"),
      team("third", "season"),
    ];
    saveTeams(teams);
    const league = buildLeague("season", teams);
    await saveCompetition(league);

    const entrant = league.entrants.find((e) => e.teamId === "home")!;
    const updated = await withdrawFromCompetition(
      { competitionType: "league", competitionId: league.id },
      entrant.id
    );

    expect(
      updated.entrants.find((e) => e.id === entrant.id)?.withdrawn
    ).toBe(true);
    expect(getTeamById("home")?.activeCompetitionId).toBeUndefined();
    // Other entrants are untouched.
    expect(getTeamById("away")?.activeCompetitionId).toBe("season");
  });
});
