/**
 * The money steps after a recorded fixture (openspec/specs/league-treasury):
 * only a league fixture queues Expensive Mistakes, the results screen keeps
 * it, and a computer team resolves its post-game steps itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "../../src/competition/resultRecording";
import { manageComputerTeam } from "../../src/competition/computerTeams";
import {
  CompetitionContext,
  CompetitionEntrant,
  LeagueDoc,
  TournamentDoc,
} from "../../src/competition/types";
import {
  getTeamById,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { RosterName, Team } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function fixedDice(...rolls: number[]) {
  const queue = [...rolls];
  return {
    rollDie: vi.fn((sides: number) => {
      const roll = queue.shift();
      if (roll === undefined) throw new Error("No fixed roll left.");
      if (roll < 1 || roll > sides) throw new Error(`Bad d${sides}: ${roll}`);
      return roll;
    }),
    rollMultipleDice: vi.fn(),
    getSeed: vi.fn(() => 1),
  };
}

function libraryTeam(id: string, treasury: number): Team {
  const team = new TeamBuilder()
    .withId(id)
    .withName(id.toUpperCase())
    .withPlayers(7)
    .withTreasury(treasury)
    .build();
  team.advancementMode = "sevens-skill-selection";
  team.dedicatedFans = 1;
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

async function league(id: string, teams: Team[]): Promise<CompetitionContext> {
  saveTeams(teams);
  const entrants = entrantsFor(teams);
  const fixtures = generateRoundRobin(entrants);
  const doc: LeagueDoc = {
    id,
    type: "league",
    name: id,
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
  await saveCompetition(doc);
  const first = fixtures.find(
    (fixture) => fixture.homeEntrantId === entrants[0].id
  )!;
  return { competitionType: "league", competitionId: id, fixtureId: first.id };
}

async function tournament(
  id: string,
  teams: Team[],
  format: "single-elimination" | "round-robin"
): Promise<CompetitionContext> {
  saveTeams(teams);
  const entrants = entrantsFor(teams);
  const fixtures =
    format === "round-robin"
      ? generateRoundRobin(entrants)
      : generateSingleElimination(entrants);
  const doc: TournamentDoc = {
    id,
    type: "tournament",
    format,
    name: id,
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(doc);
  return {
    competitionType: "tournament",
    competitionId: id,
    fixtureId: fixtures[0].id,
  };
}

const pendingKinds = (id: string) =>
  (getTeamById(id)?.pendingDevelopment ?? []).map((entry) => entry.kind);

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("Expensive Mistakes after a recorded fixture", () => {
  it("is queued once for a league team left with 100,000 or more", async () => {
    const home = libraryTeam("rich", 600_000);
    const away = libraryTeam("poor", 50_000);
    const context = await league("money", [home, away]);
    // The Fans: D3s of 1 and 1 on 1 Dedicated Fan each, Fan Attendance 4
    await recordCompetitionFixture(context, 1, 0, undefined, undefined, {
      rng: fixedDice(2, 2),
    });
    await recordCompetitionFixture(context, 1, 0, undefined, undefined, {
      rng: fixedDice(2, 2),
    });

    expect(getTeamById("rich")?.treasury).toBe(630_000);
    expect(pendingKinds("rich")).toEqual(["expensive-mistakes"]);
    // 50,000 plus 20,000 winnings stays under the threshold
    expect(getTeamById("poor")?.treasury).toBe(70_000);
    expect(pendingKinds("poor")).toEqual([]);
  });

  it("survives the results screen saving its kick-off copy", async () => {
    const home = libraryTeam("keep-a", 600_000);
    const away = libraryTeam("keep-b", 50_000);
    const context = await league("keep", [home, away]);
    const matchCopy = structuredClone(home);
    await recordCompetitionFixture(context, 1, 0, undefined, undefined, {
      rng: fixedDice(2, 2),
    });
    keepRecordedResult(matchCopy);
    expect(matchCopy.treasury).toBe(630_000);
    expect(matchCopy.pendingDevelopment?.map((entry) => entry.kind)).toEqual([
      "expensive-mistakes",
    ]);
  });

  it.each(["single-elimination", "round-robin"] as const)(
    "a %s tournament fixture never queues it",
    async (format) => {
      const home = libraryTeam(`cup-${format}-a`, 600_000);
      const away = libraryTeam(`cup-${format}-b`, 600_000);
      const context = await tournament(`cup-${format}`, [home, away], format);
      const dice = fixedDice();
      await recordCompetitionFixture(context, 1, 0, undefined, undefined, {
        rng: dice,
      });
      expect(dice.rollDie).not.toHaveBeenCalled();
      expect(pendingKinds(home.id)).toEqual([]);
      expect(pendingKinds(away.id)).toEqual([]);
      expect(getTeamById(home.id)?.treasury).toBe(600_000);
    }
  );
});

describe("a computer team's post-game steps", () => {
  it("hires a Journeyman who played, then rolls Expensive Mistakes last", () => {
    const team = libraryTeam("cpu", 400_000);
    team.computerCoached = true;
    team.firstMatchPlayedAt = 1;
    const lineman = getRosterByRosterName(RosterName.HUMAN).playerTemplates[0];
    // 10 players and every re-roll and member of staff it may have, so the
    // Journeyman is the only thing left to buy (purchasePlanner.ts)
    for (let number = 8; number <= 10; number++)
      team.players.push(createPlayer(lineman, team.id, number));
    team.rerolls = 6;
    team.apothecary = true;
    team.coaches = 3;
    team.cheerleaders = 3;
    const journeyman = createPlayer(lineman, team.id, 11, "Journeyman #11");
    journeyman.id = "cpu-journeyman-11";
    journeyman.playerKind = "journeyman";
    team.players.push(journeyman);
    team.pendingDevelopment = [
      {
        id: "expensive-mistakes-l:f",
        kind: "expensive-mistakes",
        fixtureKey: "l:f",
        createdAt: 1,
      },
      {
        id: "journeyman-m-11",
        kind: "journeyman-offer",
        playerId: journeyman.id,
        matchId: "m",
        createdAt: 2,
      },
    ];
    // Hiring the Human Lineman Journeyman costs 50,000, leaving 350,000.
    // Then Expensive Mistakes: a 3 in the 300,000 column is a Minor
    // Incident, and a D3 of 2 (a 4) loses 20,000
    const report = manageComputerTeam(team, fixedDice(3, 4));
    expect(team.pendingDevelopment).toEqual([]);
    expect(team.players.find((p) => p.id === journeyman.id)?.playerKind).toBe(
      "roster"
    );
    expect(team.treasury).toBe(330_000);
    expect(report.done.at(-1)).toMatch(/Expensive Mistakes/);
  });
});
