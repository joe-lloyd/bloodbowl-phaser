import { describe, it, expect } from "vitest";
import { RosterName } from "../../../src/types/Team";
import { computeStandings } from "../../../src/competition/logic";
import { buildAllSeedTeams } from "../../../src/seeding/teamFixtures";
import { decorateSeedTeams } from "../../../src/seeding/playerLifecycle";
import { buildSeedCompetitions } from "../../../src/seeding/competitionFixtures";

function build() {
  const teams = buildAllSeedTeams();
  decorateSeedTeams(teams);
  const competitions = buildSeedCompetitions(teams);
  return { teams, competitions };
}

describe("competitionFixtures", () => {
  it("seeds a league and a tournament in each lifecycle state", () => {
    const { competitions } = build();
    expect(competitions).toHaveLength(6);
    for (const type of ["league", "tournament"] as const) {
      const states = competitions
        .filter((d) => d.type === type)
        .map((d) => d.status)
        .sort();
      expect(states).toEqual(["active", "complete", "draft"]);
    }
  });

  it("draft competitions have no results and zeroed standings", () => {
    const { competitions } = build();
    for (const doc of competitions.filter((d) => d.status === "draft")) {
      expect(doc.fixtures.every((f) => f.status !== "complete")).toBe(true);
      expect(doc.fixtures.every((f) => !f.result)).toBe(true);
      expect(doc.standings.every((s) => s.played === 0)).toBe(true);
    }
  });

  it("the active tournament has completed semis and an open final", () => {
    const { competitions } = build();
    const active = competitions.find(
      (d) => d.type === "tournament" && d.status === "active"
    )!;
    const final = active.fixtures.find((f) => !f.nextFixtureId)!;
    const semis = active.fixtures.filter((f) => f.nextFixtureId === final.id);
    expect(semis.every((f) => f.status === "complete")).toBe(true);
    expect(final.status).not.toBe("complete");
    expect(final.result).toBeUndefined();
    // Winners advanced into the final
    const winners = semis.map((f) => f.result!.winnerEntrantId);
    expect([final.homeEntrantId, final.awayEntrantId].sort()).toEqual(
      winners.sort()
    );
    expect(active.championEntrantId).toBeUndefined();
  });

  it("the completed league is fully played with a table leader", () => {
    const { competitions } = build();
    const league = competitions.find(
      (d) => d.type === "league" && d.status === "complete"
    )!;
    expect(league.fixtures.every((f) => f.status === "complete")).toBe(true);
    expect(league.standings).toEqual(
      computeStandings(league.entrants, league.fixtures, league.points)
    );
    expect(league.standings[0].played).toBeGreaterThan(0);
    expect(league.standings[0].points).toBeGreaterThanOrEqual(
      league.standings[1].points
    );
  });

  it("the completed tournament records its champion", () => {
    const { competitions } = build();
    const cup = competitions.find(
      (d) => d.type === "tournament" && d.status === "complete"
    )!;
    const final = cup.fixtures.find((f) => !f.nextFixtureId)!;
    expect(cup.championEntrantId).toBe(final.result!.winnerEntrantId);
    expect(cup.fixtures.every((f) => f.status === "complete")).toBe(true);
  });

  it("assigns each team to at most one active competition", () => {
    const { teams, competitions } = build();
    const activeByTeam = new Map<string, string>();
    for (const doc of competitions.filter((d) => d.status === "active")) {
      for (const entrant of doc.entrants) {
        activeByTeam.set(entrant.teamId, doc.id);
      }
    }
    expect(activeByTeam.size).toBeGreaterThan(0);
    // Team.activeCompetitionId records the same competition every active
    // entrant's team is found in — the enforceable single-membership field.
    for (const [teamId, competitionId] of activeByTeam) {
      const team = teams.find((candidate) => candidate.id === teamId)!;
      expect(team.activeCompetitionId).toBe(competitionId);
    }
    // Draft/complete competitions never set it — only "active" does.
    const activeTeamIds = new Set(activeByTeam.keys());
    for (const team of teams) {
      if (!activeTeamIds.has(team.id)) {
        expect(team.activeCompetitionId).toBeUndefined();
      }
    }
  });

  it("folds completed results into team records", () => {
    const { teams, competitions } = build();
    const completed = competitions.filter((d) => d.status === "complete");
    const records = new Map<string, { w: number; d: number; l: number }>();
    for (const doc of completed) {
      for (const fixture of doc.fixtures) {
        if (!fixture.result || fixture.result.bye) continue;
        const home = doc.entrants.find(
          (e) => e.id === fixture.homeEntrantId
        )!;
        const away = doc.entrants.find(
          (e) => e.id === fixture.awayEntrantId
        )!;
        const homeRec = records.get(home.teamId) ?? { w: 0, d: 0, l: 0 };
        const awayRec = records.get(away.teamId) ?? { w: 0, d: 0, l: 0 };
        if (fixture.result.homeScore > fixture.result.awayScore) {
          homeRec.w++;
          awayRec.l++;
        } else if (fixture.result.awayScore > fixture.result.homeScore) {
          awayRec.w++;
          homeRec.l++;
        } else {
          homeRec.d++;
          awayRec.d++;
        }
        records.set(home.teamId, homeRec);
        records.set(away.teamId, awayRec);
      }
    }
    for (const [teamId, rec] of records) {
      const team = teams.find((t) => t.id === teamId)!;
      expect(team.wins).toBe(rec.w);
      expect(team.draws).toBe(rec.d);
      expect(team.losses).toBe(rec.l);
    }
    // At least one team actually has history
    expect(records.size).toBeGreaterThan(0);
  });

  it("is deterministic across runs", () => {
    const first = build();
    const second = build();
    expect(JSON.stringify(second.competitions)).toBe(
      JSON.stringify(first.competitions)
    );
    expect(second.teams.map((t) => t.id)).toEqual(first.teams.map((t) => t.id));
  });

  it("references the entrant team by id rather than embedding it", () => {
    const { teams, competitions } = build();
    const human = teams.find((t) => t.rosterName === RosterName.HUMAN)!;
    const entrant = competitions[0].entrants.find(
      (e) => e.teamId === human.id
    )!;
    expect(entrant.teamId).toBe(human.id);
    expect(entrant).not.toHaveProperty("team");
    expect(entrant.ownerUid).toBeNull();
  });
});
