import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateRoundRobin,
  computeStandings,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import { recordCompetitionFixture } from "../../src/competition/resultRecording";
import { CompetitionEntrant, LeagueDoc } from "../../src/competition/types";
import {
  loadTeams,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function team(id: string): Team {
  return {
    id,
    name: id.toUpperCase(),
    rosterName: "Human",
    players: [],
    wins: 0,
    draws: 0,
    losses: 0,
    touchdowns: 0,
  } as unknown as Team;
}

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("competition result orchestration", () => {
  it("updates standings and owned team records exactly once", async () => {
    const teams = [team("home"), team("away")];
    saveTeams(teams);
    const entrants: CompetitionEntrant[] = teams.map((snapshot, index) => ({
      id: `local:${snapshot.id}`,
      teamId: snapshot.id,
      ownerUid: null,
      name: snapshot.name,
      rosterName: snapshot.rosterName,
      seed: index + 1,
      source: "local",
    }));
    const fixtures = generateRoundRobin(entrants);
    const league: LeagueDoc = {
      id: "season",
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
    await saveCompetition(league);
    const context = {
      competitionType: "league" as const,
      competitionId: league.id,
      fixtureId: fixtures[0].id,
    };

    const updated = await recordCompetitionFixture(context, 2, 1);
    await recordCompetitionFixture(context, 2, 1);

    expect(updated.standings[0]).toMatchObject({ wins: 1, points: 3 });
    const saved = loadTeams();
    expect(saved.find((candidate) => candidate.id === "home")).toMatchObject({
      wins: 1,
      touchdowns: 2,
    });
    expect(saved.find((candidate) => candidate.id === "away")).toMatchObject({
      losses: 1,
      touchdowns: 1,
    });
  });
});
