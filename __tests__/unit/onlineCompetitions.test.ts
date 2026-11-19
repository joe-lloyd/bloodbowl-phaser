import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { generateRoundRobin, seedEntrants } from "../../src/competition/logic";
import {
  startedFrom,
  withoutEntrants,
  withSignup,
} from "../../src/competition/online";
import { orientToFixture } from "../../src/competition/resultRecording";
import {
  assertFixtureInOpenRound,
  openRound,
  overdueEntrantIds,
} from "../../src/competition/schedule";
import { pickComputerTemplates } from "../../src/competition/computerFill";
import { getComputerTeamTemplates } from "../../src/competition/computerTeamTemplates";
import { lockIsStale } from "../../src/competition/teamLocks";
import type {
  CompetitionEntrant,
  CompetitionFixture,
  LeagueDoc,
} from "../../src/competition/types";
import { createHumanTeam, createOrcTeam } from "../fixtures/teams";
import { hostedFixture } from "../../src/ui/components/competition/useFixtureLaunch";

const DAY = 24 * 60 * 60 * 1000;
const START = 1_000 * DAY;

function entrant(id: string, change: Partial<CompetitionEntrant> = {}): CompetitionEntrant {
  return { id, teamId: `team-${id}`, ownerUid: id, name: id, rosterName: "Orc", seed: 1, ...change };
}

function league(change: Partial<LeagueDoc> = {}): LeagueDoc {
  return {
    id: "league-1",
    type: "league",
    name: "Spike Cup",
    organizerUid: "boss",
    participantUids: [],
    status: "draft",
    entrants: [],
    fixtures: [],
    standings: [],
    createdAt: 0,
    updatedAt: 0,
    points: { win: 3, draw: 1, loss: 0 },
    online: { places: 4, listed: true, roundDays: 7, computerGames: "simulate" },
    ...change,
  };
}

function played(fixture: CompetitionFixture, completedAt: number): CompetitionFixture {
  return { ...fixture, status: "complete", result: { homeScore: 1, awayScore: 0, completedAt } };
}

function season(): LeagueDoc {
  const entrants = seedEntrants([entrant("amy"), entrant("bob"), entrant("cpu", { computerCoached: true, ownerUid: "boss" }), entrant("dee")]);
  return league({
    status: "active",
    entrants,
    fixtures: generateRoundRobin(entrants),
    online: { places: 4, listed: true, roundDays: 7, computerGames: "simulate", startedAt: START },
  });
}

describe("sign-ups", () => {
  it("add one team per coach until the places run out", () => {
    const one = withSignup(league(), { team: createOrcTeam(), uid: "amy", coachName: "Amy" });

    expect(one.participantUids).toEqual(["amy"]);
    expect(one.entrants).toEqual([
      expect.objectContaining({ ownerUid: "amy", coachName: "Amy", name: "Da Boyz", seed: 1 }),
    ]);
    expect(() => withSignup(one, { team: createHumanTeam(), uid: "amy", coachName: "Amy" })).toThrow(
      "You already have a team in this competition."
    );
    const full = withSignup(league({ online: { places: 1, listed: true, roundDays: 7, computerGames: "simulate" } }), {
      team: createOrcTeam(),
      uid: "amy",
      coachName: "Amy",
    });
    expect(() => withSignup(full, { team: createHumanTeam(), uid: "bob", coachName: "Bob" })).toThrow(
      "Every place in this competition is taken."
    );
  });

  it("let a coach leave, keeping everyone else exactly as they were", () => {
    const two = withSignup(withSignup(league(), { team: createOrcTeam(), uid: "amy", coachName: "Amy" }), {
      team: createHumanTeam(),
      uid: "bob",
      coachName: "Bob",
    });
    const left = withoutEntrants(two, (candidate) => candidate.ownerUid === "amy");

    expect(left.participantUids).toEqual(["bob"]);
    expect(left.entrants).toEqual([two.entrants[1]]);
  });

  it("close once the competition starts", () => {
    expect(() => withSignup(season(), { team: createOrcTeam(), uid: "eve", coachName: "Eve" })).toThrow(
      "Sign-ups for this competition are closed."
    );
  });
});

describe("starting an online league", () => {
  it("fills the empty places with computer teams and draws the fixtures", () => {
    const signedUp = withSignup(league(), { team: createOrcTeam(), uid: "amy", coachName: "Amy" });
    const pool = [createHumanTeam(), createHumanTeam(), createHumanTeam(), createHumanTeam()];
    const { competition, computerTeams } = startedFrom(signedUp, { pool, random: () => 0.5, now: START });

    expect(computerTeams.map((team) => team.name)).toEqual(["Reikland Reavers", "Reikland Reavers 2", "Reikland Reavers 3"]);
    expect(competition.status).toBe("active");
    expect(competition.online?.startedAt).toBe(START);
    expect(competition.entrants).toHaveLength(4);
    expect(competition.entrants.filter((candidate) => candidate.ownerUid === "boss")).toHaveLength(3);
    expect(competition.fixtures).toHaveLength(6);
  });
});

describe("the round schedule", () => {
  it("opens round one at the start with a deadline a pace away", () => {
    expect(openRound(season())).toEqual({ round: 1, opensAt: START, deadline: START + 7 * DAY });
  });

  it("opens the next round as soon as every game in the last one is played", () => {
    const current = season();
    current.fixtures = current.fixtures.map((fixture) => (fixture.round === 1 ? played(fixture, START + 2 * DAY) : fixture));

    expect(openRound(current)).toEqual({ round: 2, opensAt: START + 2 * DAY, deadline: START + 9 * DAY });
    const later = current.fixtures.find((fixture) => fixture.round === 3);
    if (!later) throw new Error("no round three");
    expect(() => { assertFixtureInOpenRound(current, later); }).toThrow(
      "Round 3 has not opened yet. Every game in the round before it has to finish first."
    );
  });

  it("names the coaches behind unplayed games once the deadline passes", () => {
    const current = season();
    const open = current.fixtures.filter((fixture) => fixture.round === 1);
    const human = open.find((fixture) => ![fixture.homeEntrantId, fixture.awayEntrantId].includes("cpu"));
    if (!human) throw new Error("no human game");
    current.fixtures = current.fixtures.map((fixture) => (fixture.round === 1 && fixture !== human ? played(fixture, START) : fixture));

    expect(overdueEntrantIds(current, START + 7 * DAY)).toEqual([]);
    expect(overdueEntrantIds(current, START + 7 * DAY + 1).sort()).toEqual([human.homeEntrantId, human.awayEntrantId].sort());
  });

  it("leaves a competition without a schedule open in every round", () => {
    const local = season();
    delete local.online;
    expect(openRound(local)).toBeNull();
    const later = local.fixtures.at(-1);
    if (!later) throw new Error("no fixtures");
    expect(() => { assertFixtureInOpenRound(local, later); }).not.toThrow();
  });
});

describe("a result reported from the away coach's browser", () => {
  it("is turned round to match the fixture's home team", () => {
    const home = createOrcTeam();
    const away = createHumanTeam();
    const context = { competitionType: "league" as const, competitionId: "l", fixtureId: "f" };
    const reported = orientToFixture(
      {
        context,
        homeScore: 2,
        awayScore: 1,
        progressedTeams: { home: away, away: home },
        penalties: { home: 3, away: 2 },
        options: { fanFactors: { home: 4, away: 5 }, stalled: { home: true, away: false } },
      },
      home.id
    );

    expect(reported).toEqual({
      context,
      homeScore: 1,
      awayScore: 2,
      progressedTeams: { home, away },
      penalties: { home: 2, away: 3 },
      options: { fanFactors: { home: 5, away: 4 }, stalled: { home: false, away: true } },
    });
  });
});

describe("choosing computer teams", () => {
  it("spreads them across the rosters with the fewest teams", () => {
    const templates = getComputerTeamTemplates();
    const picks = pickComputerTemplates({ templates, count: 3, rosters: [], picked: [], random: () => 0 });

    expect(new Set(picks.map((template) => template.rosterName)).size).toBe(3);
  });
});

describe("a team's competition lock", () => {
  it("is stale once its entry is gone, withdrawn or the competition is over", () => {
    const current = season();
    expect(lockIsStale({ id: "team-amy" }, current)).toBe(false);
    expect(lockIsStale({ id: "team-eve" }, current)).toBe(true);
    expect(lockIsStale({ id: "team-amy" }, { ...current, status: "complete" })).toBe(true);
    expect(lockIsStale({ id: "team-amy" }, null)).toBe(false);
  });
});

describe("hosting a fixture online", () => {
  it("seats the host with the team they own and holds the lobby for the other coach", () => {
    const current = season();
    const fixture = current.fixtures.find((candidate) =>
      [candidate.homeEntrantId, candidate.awayEntrantId].every((id) => id === "dee" || id === "amy")
    );
    const home = current.entrants.find((candidate) => candidate.id === fixture?.homeEntrantId);
    const away = current.entrants.find((candidate) => candidate.id === fixture?.awayEntrantId);
    if (!fixture || !home || !away) throw new Error("no fixture between dee and amy");
    const teams = { home, away, homeTeam: createOrcTeam(), awayTeam: createHumanTeam() };

    const byAway = hostedFixture({ competition: current, fixture, teams, uid: away.id });
    const byHome = hostedFixture({ competition: current, fixture, teams, uid: home.id });

    expect([byAway.hostSide, byAway.reservedFor]).toEqual(["away", home.id]);
    expect([byHome.hostSide, byHome.reservedFor]).toEqual(["home", away.id]);
    expect(byHome.context.playedVia).toBe("online");
  });
});
