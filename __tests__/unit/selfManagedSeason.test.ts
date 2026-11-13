/**
 * A whole league season with every result reported by score only. The
 * computer spends its own teams' Treasuries after each fixture
 * (purchasePlanner.ts); a team a person coaches is left to them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createComputerTeam } from "../../src/competition/computerTeams";
import {
  computeStandings,
  generateRoundRobin,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import { recordCompetitionFixture } from "../../src/competition/resultRecording";
import { CompetitionEntrant, LeagueDoc } from "../../src/competition/types";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  getTeamById,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { fitPlayers } from "../../src/game/rules/purchasePlanner";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { draftListPlayers } from "../../src/game/rules/teamPricing";
import { RNGService } from "../../src/services/rng/RNGService";
import { InjuryType } from "../../src/types/Player";
import { RosterName, Team } from "../../src/types/Team";

function team(
  roster: RosterName,
  name: string,
  players: number,
  treasury: number,
  computer = true
): Team {
  const built = createComputerTeam(roster, name, 0x335577, "advanced-league");
  // Already playing: a league team below 7 got there through casualties
  built.firstMatchPlayedAt = 1;
  built.players = built.players.slice(0, players);
  built.treasury = treasury;
  if (!computer) {
    delete built.computerCoached;
    built.coachName = "Pat";
  }
  return built;
}

function entrant(built: Team, seed: number): CompetitionEntrant {
  return {
    id: `local:${built.id}`,
    teamId: built.id,
    ownerUid: null,
    name: built.name,
    rosterName: built.rosterName,
    seed,
    ...(built.computerCoached ? { computerCoached: true as const } : {}),
  };
}

async function league(teams: Team[]): Promise<LeagueDoc> {
  saveTeams(teams);
  const entrants = teams.map((built, index) => entrant(built, index + 1));
  const fixtures = generateRoundRobin(entrants);
  const doc: LeagueDoc = {
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
  await saveCompetition(doc);
  return doc;
}

/** Everything that makes a stored team illegal, or an empty list. */
function illegal(stored: Team): string[] {
  const problems = validateRosterLegality(
    stored,
    getRosterByRosterName(stored.rosterName)
  ).map((violation) => violation.detail);
  const insignificant = validateInsignificant(draftListPlayers(stored));
  if (insignificant) problems.push(insignificant);
  if (stored.treasury < 0) problems.push(`Treasury ${stored.treasury}`);
  if (draftListPlayers(stored).length > 11) problems.push("over 11 players");
  const numbers = stored.players.map((player) => player.number);
  if (new Set(numbers).size !== numbers.length) problems.push("shared numbers");
  if (numbers.some((number) => number < 1 || number > 11))
    problems.push(`numbers ${numbers.join(",")}`);
  if (new Set(stored.players.map((p) => p.id)).size !== stored.players.length)
    problems.push("shared ids");
  return problems;
}

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("a league season reported by score only", () => {
  it("leaves every computer team legal, solvent and able to field 7", async () => {
    const injured = team(RosterName.DWARF, "Karak Varn Hammers", 7, 100_000);
    injured.players[0].injuries = [InjuryType.MISS_NEXT_GAME];
    injured.players[1].injuries = [InjuryType.MISS_NEXT_GAME];
    const computerTeams = [
      team(RosterName.HUMAN, "Altdorf Avengers", 5, 150_000),
      team(RosterName.ORC, "Nuln Butchers", 4, 0),
      team(RosterName.SKAVEN, "Praag Screamers", 7, 600_000),
      injured,
      team(RosterName.WOOD_ELF, "Lustria Warhawks", 7, 0),
    ];
    const person = team(RosterName.HUMAN, "Pat's Team", 5, 300_000, false);
    const personBefore = structuredClone(person);
    const doc = await league([...computerTeams, person]);
    const rng = new RNGService(20261113);

    const rounds = Math.max(...doc.fixtures.map((fixture) => fixture.round));
    for (let round = 1; round <= rounds; round++) {
      for (const fixture of doc.fixtures.filter((f) => f.round === round)) {
        if (!fixture.homeEntrantId || !fixture.awayEntrantId) continue;
        await recordCompetitionFixture(
          {
            competitionType: "league",
            competitionId: doc.id,
            fixtureId: fixture.id,
          },
          rng.rollDie(4) - 1,
          rng.rollDie(4) - 1,
          undefined,
          undefined,
          { rng }
        );
        for (const built of computerTeams) {
          const stored = getTeamById(built.id)!;
          expect(illegal(stored), `${stored.name} after ${fixture.id}`).toEqual(
            []
          );
        }
      }
    }

    const finished = await getCompetition("league", doc.id);
    expect(finished?.status).toBe("complete");
    for (const built of computerTeams) {
      const stored = getTeamById(built.id)!;
      expect(illegal(stored), stored.name).toEqual([]);
      // Every computer team earned winnings, so none is left short
      expect(fitPlayers(stored).length, stored.name).toBeGreaterThanOrEqual(7);
      // Its Expensive Mistakes were rolled after its own hiring
      expect(
        (stored.pendingDevelopment ?? []).map((entry) => entry.kind),
        stored.name
      ).not.toContain("expensive-mistakes");
    }
    // The broke Orcs bought players with their winnings
    expect(getTeamById(computerTeams[1].id)!.players.length).toBeGreaterThan(4);

    // The team a person coaches: paid, but nothing bought or rolled for it
    const stored = getTeamById(person.id)!;
    expect(stored.players).toEqual(personBefore.players);
    expect(stored.rerolls).toBe(personBefore.rerolls);
    expect(stored.apothecary).toBe(personBefore.apothecary);
    expect(stored.treasury).toBeGreaterThan(300_000);
    expect(
      (stored.pendingDevelopment ?? []).map((entry) => entry.kind)
    ).toContain("expensive-mistakes");
  });
});
