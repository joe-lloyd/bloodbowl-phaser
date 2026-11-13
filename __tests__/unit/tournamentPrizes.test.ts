/**
 * Tournament prizes (openspec/specs/tournament-prizes): the organizer's prize
 * is paid into the champion's Treasury once, when the tournament completes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCompetition } from "../../src/competition/create";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import {
  closeWalkovers,
  keepRecordedResult,
  recordCompetitionFixture,
} from "../../src/competition/resultRecording";
import {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
  LeagueDoc,
  TournamentDoc,
  TournamentFormat,
} from "../../src/competition/types";
import {
  getTeamById,
  saveTeam,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName, Team, TeamAdvancementMode } from "../../src/types/Team";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function libraryTeam(
  id: string,
  treasury: number,
  advancementMode: TeamAdvancementMode = "advanced-league"
): Team {
  const team = new TeamBuilder()
    .withId(id)
    .withName(id.toUpperCase())
    .withPlayers(7)
    .withTreasury(treasury)
    .build();
  team.advancementMode = advancementMode;
  return team;
}

function entrantsFor(teams: Team[]): CompetitionEntrant[] {
  return teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
}

async function tournament(
  id: string,
  format: TournamentFormat,
  teams: Team[],
  prize?: number
): Promise<TournamentDoc> {
  saveTeams(teams);
  const entrants = entrantsFor(teams);
  const fixtures =
    format === "round-robin"
      ? generateRoundRobin(entrants)
      : generateSingleElimination(entrants);
  const doc: TournamentDoc = {
    id,
    type: "tournament",
    name: id,
    organizerUid: null,
    participantUids: [],
    status: "active",
    format,
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    createdAt: 1,
    updatedAt: 1,
    ...(prize !== undefined ? { prize } : {}),
  };
  await saveCompetition(doc);
  return doc;
}

const treasuryOf = (id: string) => getTeamById(id)?.treasury;

/**
 * Record every game still to play, round by round, 1-0 to whichever side
 * ranks first in `order`. Returns the competition as recorded last.
 */
async function playOut(
  competition: CompetitionDoc,
  order: string[]
): Promise<CompetitionDoc> {
  let latest = competition;
  const rank = (entrantId: string | null) =>
    order.indexOf(entrantId!.replace("local:", ""));
  const next = (doc: CompetitionDoc): CompetitionFixture | undefined =>
    doc.fixtures
      .filter(
        (fixture) =>
          fixture.status !== "complete" &&
          fixture.homeEntrantId &&
          fixture.awayEntrantId
      )
      .sort((a, b) => a.round - b.round || a.order - b.order)[0];
  for (let fixture = next(latest); fixture; fixture = next(latest)) {
    const homeWins = rank(fixture.homeEntrantId) < rank(fixture.awayEntrantId);
    latest = await recordCompetitionFixture(
      {
        competitionType: latest.type,
        competitionId: latest.id,
        fixtureId: fixture.id,
      },
      homeWins ? 1 : 0,
      homeWins ? 0 : 1
    );
  }
  return latest;
}

/** The game that completed the tournament, to record again. */
const lastGame = (doc: CompetitionDoc) =>
  [...doc.fixtures]
    .filter((fixture) => fixture.result && !fixture.result.bye)
    .sort((a, b) => b.result!.completedAt - a.result!.completedAt)[0];

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("a tournament prize in the champion's Treasury", () => {
  it("single elimination: the final's winner takes 100,000 gp once", async () => {
    const cup = await tournament(
      "cup",
      "single-elimination",
      [
        libraryTeam("a", 10_000),
        libraryTeam("b", 20_000),
        libraryTeam("c", 30_000),
        libraryTeam("d", 40_000),
      ],
      100_000
    );

    const done = await playOut(cup, ["c", "a", "b", "d"]);

    expect(done.status).toBe("complete");
    expect(done.type === "tournament" && done.championEntrantId).toBe(
      "local:c"
    );
    expect(treasuryOf("a")).toBe(10_000);
    expect(treasuryOf("b")).toBe(20_000);
    expect(treasuryOf("c")).toBe(130_000);
    expect(treasuryOf("d")).toBe(40_000);
    expect(getTeamById("c")?.recordedFixtureIds).toContain("cup:prize");

    // The final recorded again, and the page reloaded
    const final = lastGame(done);
    await recordCompetitionFixture(
      {
        competitionType: "tournament",
        competitionId: "cup",
        fixtureId: final.id,
      },
      1,
      0
    );
    await closeWalkovers((await getCompetition("tournament", "cup"))!);
    expect(treasuryOf("c")).toBe(130_000);
  });

  it("round robin: the top of the table takes 50,000 gp once", async () => {
    const pool = await tournament(
      "pool",
      "round-robin",
      [
        libraryTeam("a", 10_000),
        libraryTeam("b", 20_000),
        libraryTeam("c", 30_000),
      ],
      50_000
    );

    const done = await playOut(pool, ["b", "c", "a"]);

    expect(done.status).toBe("complete");
    expect(done.type === "tournament" && done.championEntrantId).toBe(
      "local:b"
    );
    expect(treasuryOf("a")).toBe(10_000);
    expect(treasuryOf("b")).toBe(70_000);
    expect(treasuryOf("c")).toBe(30_000);

    const last = lastGame(done);
    const homeWon = last.result!.homeScore > last.result!.awayScore;
    await recordCompetitionFixture(
      {
        competitionType: "tournament",
        competitionId: "pool",
        fixtureId: last.id,
      },
      homeWon ? 1 : 0,
      homeWon ? 0 : 1
    );
    await closeWalkovers((await getCompetition("tournament", "pool"))!);
    expect(treasuryOf("b")).toBe(70_000);
  });

  it("pays nothing before the tournament completes", async () => {
    const cup = await tournament(
      "early",
      "single-elimination",
      [
        libraryTeam("a", 10_000),
        libraryTeam("b", 20_000),
        libraryTeam("c", 30_000),
        libraryTeam("d", 40_000),
      ],
      100_000
    );
    const semi = cup.fixtures.find(
      (fixture) => fixture.homeEntrantId && fixture.awayEntrantId
    )!;
    await recordCompetitionFixture(
      {
        competitionType: "tournament",
        competitionId: "early",
        fixtureId: semi.id,
      },
      1,
      0
    );
    expect(["a", "b", "c", "d"].map((id) => treasuryOf(id))).toEqual([
      10_000, 20_000, 30_000, 40_000,
    ]);
  });

  it("keeps the prize when the results screen saves its kick-off copy", async () => {
    const pool = await tournament(
      "kickoff",
      "round-robin",
      [libraryTeam("a", 10_000), libraryTeam("b", 20_000)],
      50_000
    );
    const kickOffCopy = structuredClone(getTeamById("a")!);
    await playOut(pool, ["a", "b"]);
    keepRecordedResult(kickOffCopy);
    saveTeam(kickOffCopy);
    expect(treasuryOf("a")).toBe(60_000);
  });
});

describe("tournaments that pay no prize", () => {
  it("a tournament with no prize leaves every Treasury unchanged", async () => {
    const cup = await tournament("plain", "single-elimination", [
      libraryTeam("a", 10_000),
      libraryTeam("b", 20_000),
      libraryTeam("c", 30_000),
      libraryTeam("d", 40_000),
    ]);
    await playOut(cup, ["c", "a", "b", "d"]);
    expect(["a", "b", "c", "d"].map((id) => treasuryOf(id))).toEqual([
      10_000, 20_000, 30_000, 40_000,
    ]);
    expect(getTeamById("c")?.recordedFixtureIds).not.toContain("plain:prize");
  });

  it("a Matched Play champion keeps no Treasury and is paid nothing", async () => {
    const pool = await tournament(
      "matched",
      "round-robin",
      [
        libraryTeam("a", 10_000, "matched-play"),
        libraryTeam("b", 20_000, "matched-play"),
      ],
      50_000
    );
    await playOut(pool, ["a", "b"]);
    expect(treasuryOf("a")).toBe(10_000);
    expect(treasuryOf("b")).toBe(20_000);
  });

  it("a champion outside this coach's library is not written", async () => {
    const pool = await tournament(
      "away",
      "round-robin",
      [libraryTeam("a", 10_000), libraryTeam("b", 20_000)],
      50_000
    );
    // A's team is another coach's: it is not in this session's library
    saveTeams([libraryTeam("b", 20_000)]);
    await playOut(pool, ["a", "b"]);
    expect(getTeamById("a")).toBeUndefined();
    expect(treasuryOf("b")).toBe(20_000);
  });

  it("a league never pays a prize, whatever its document holds", async () => {
    const teams = [libraryTeam("a", 10_000), libraryTeam("b", 20_000)];
    saveTeams(teams);
    const entrants = entrantsFor(teams);
    const fixtures = generateRoundRobin(entrants);
    const league = {
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
      prize: 50_000,
    } as LeagueDoc;
    await saveCompetition(league);
    const done = await playOut(league, ["a", "b"]);
    const winnings = done.fixtures[0].result!.winnings!;
    expect(done.status).toBe("complete");
    // League winnings only (league-winnings spec), no prize on top
    expect(treasuryOf("a")).toBe(10_000 + winnings.home);
    expect(getTeamById("a")?.recordedFixtureIds).not.toContain("season:prize");
  });
});

describe("setting the prize", () => {
  const coachTeam = (name: string) => {
    const team = createReadyMadeTeam(RosterName.HUMAN, name, 0xaa2222);
    team.advancementMode = "advanced-league";
    saveTeam(team);
    return team;
  };

  it("stores the organizer's prize on the tournament, none by default", async () => {
    const entrants = () =>
      [coachTeam("One"), coachTeam("Two")].map((team) => ({
        team,
        ownerUid: null,
      }));
    const withPrize = await createCompetition({
      type: "tournament",
      name: "Prize Cup",
      format: "round-robin",
      organizerUid: null,
      entrants: entrants(),
      prize: 75_000,
    });
    const without = await createCompetition({
      type: "tournament",
      name: "Plain Cup",
      format: "round-robin",
      organizerUid: null,
      entrants: entrants(),
    });
    expect(withPrize.type === "tournament" && withPrize.prize).toBe(75_000);
    expect(without).not.toHaveProperty("prize");
  });

  it.each([-10_000, 1.5, Number.NaN])(
    "refuses a prize of %s",
    async (prize) => {
      await expect(
        createCompetition({
          type: "tournament",
          name: "Bad Cup",
          format: "round-robin",
          organizerUid: null,
          entrants: [coachTeam("One"), coachTeam("Two")].map((team) => ({
            team,
            ownerUid: null,
          })),
          prize,
        })
      ).rejects.toThrow("whole number of gold pieces");
    }
  );
});
