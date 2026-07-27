/**
 * Competition lifecycle fixtures: one league and one tournament in each of
 * draft, active, and completed states, built through the normal competition
 * services (generateRoundRobin / generateSingleElimination /
 * recordLeagueResult / recordTournamentResult / computeStandings) with
 * deterministic, named-RNG results.
 *
 * Membership index: a team appears in at most one ACTIVE competition.
 * Draft and completed memberships may overlap freely — draft is not yet
 * participation and completed memberships are history.
 *
 *   league-draft      Human, Orc, Dwarf, Skaven        (round-robin, unplayed)
 *   league-active     Dark Elf, Wood Elf, Necro, Goblin (round-robin, mid-way)
 *   league-complete   Human, Orc, Dwarf, Skaven        (round-robin, final)
 *   tournament-draft  Amazon, Khorne, Nurgle, Vampire  (single-elim, unplayed)
 *   tournament-active High Elf, Chaos Chosen, Norse, Lizardmen (semis done)
 *   tournament-complete Human, Orc, Dwarf, Skaven      (champion recorded)
 *
 * Team records (wins/draws/losses) fold the results of the completed
 * competitions back onto the library teams, mirroring updateTeamRecord.
 * All timestamps are normalized to SEED_EPOCH offsets so runs converge.
 */

import { RosterName, Team } from "../types/Team";
import {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
  DEFAULT_LEAGUE_POINTS,
  LeagueDoc,
  TournamentDoc,
} from "../competition/types";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  recordLeagueResult,
  recordTournamentResult,
  seedEntrants,
} from "../competition/logic";
import {
  SEED_EPOCH,
  rngFor,
  rosterSlug,
  seedCompetitionId,
  seedEntrantId,
  seedMetadata,
} from "./seedMeta";

interface CompetitionPlan {
  fixtureKey: string;
  name: string;
  type: "league" | "tournament";
  state: "draft" | "active" | "complete";
  rosters: RosterName[];
  /** For active competitions: how many fixtures (in id order) to complete. */
  completeFixtures?: number;
}

export const COMPETITION_PLANS: CompetitionPlan[] = [
  {
    fixtureKey: "founders-league",
    name: "Founders League",
    type: "league",
    state: "draft",
    rosters: [
      RosterName.HUMAN,
      RosterName.ORC,
      RosterName.DWARF,
      RosterName.SKAVEN,
    ],
  },
  {
    fixtureKey: "autumn-league",
    name: "Autumn Sevens League",
    type: "league",
    state: "active",
    completeFixtures: 3,
    rosters: [
      RosterName.DARK_ELF,
      RosterName.WOOD_ELF,
      RosterName.NECROMANTIC_HORROR,
      RosterName.GOBLIN,
    ],
  },
  {
    fixtureKey: "legends-league",
    name: "Legends League",
    type: "league",
    state: "complete",
    rosters: [
      RosterName.HUMAN,
      RosterName.ORC,
      RosterName.DWARF,
      RosterName.SKAVEN,
    ],
  },
  {
    fixtureKey: "rookie-rumble",
    name: "Rookie Rumble",
    type: "tournament",
    state: "draft",
    rosters: [
      RosterName.AMAZON,
      RosterName.KHORNE,
      RosterName.NURGLE,
      RosterName.VAMPIRE,
    ],
  },
  {
    fixtureKey: "winter-gauntlet",
    name: "Winter Gauntlet",
    type: "tournament",
    state: "active",
    completeFixtures: 2, // both semi-finals; the final stays playable
    rosters: [
      RosterName.HIGH_ELF,
      RosterName.CHAOS_CHOSEN,
      RosterName.NORSE,
      RosterName.LIZARDMEN,
    ],
  },
  {
    fixtureKey: "founders-cup",
    name: "Founders Cup",
    type: "tournament",
    state: "complete",
    rosters: [
      RosterName.HUMAN,
      RosterName.ORC,
      RosterName.DWARF,
      RosterName.SKAVEN,
    ],
  },
];

function toEntrant(
  team: Team,
  competitionId: string,
  fixtureKey: string
): CompetitionEntrant {
  return {
    id: seedEntrantId(competitionId, fixtureKey),
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    coachName: "Seed Coach",
    coachUid: null,
    rosterName: team.rosterName,
    seed: 0, // reassigned by seedEntrants in plan order
    source: "local",
  };
}

/** Deterministic scoreline; elimination fixtures never draw. */
function scoreFor(
  plan: CompetitionPlan,
  fixture: CompetitionFixture
): { homeScore: number; awayScore: number } {
  const rng = rngFor(`match:${plan.fixtureKey}:${fixture.id}`);
  let homeScore = rng.nextInt(0, 3);
  let awayScore = rng.nextInt(0, 3);
  // Every seeded tournament is single-elimination: no draws allowed.
  if (plan.type === "tournament" && homeScore === awayScore) {
    if (rng.nextInt(0, 1) === 0) homeScore += 1;
    else awayScore += 1;
  }
  return { homeScore, awayScore };
}

/** Record results for the first `count` fixtures (id order), deterministically. */
function playFixtures(
  plan: CompetitionPlan,
  doc: LeagueDoc | TournamentDoc,
  count: number
): LeagueDoc | TournamentDoc {
  let current = doc;
  const fixtures = [...doc.fixtures].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  for (const fixture of fixtures.slice(0, count)) {
    if (fixture.status === "complete") continue;
    const { homeScore, awayScore } = scoreFor(plan, fixture);
    current =
      current.type === "league"
        ? recordLeagueResult(current as LeagueDoc, fixture.id, homeScore, awayScore)
        : recordTournamentResult(
            current as TournamentDoc,
            fixture.id,
            homeScore,
            awayScore
          );
  }
  return current;
}

/** Fix every timestamp to SEED_EPOCH offsets so repeated runs converge. */
function normalizeTimestamps(doc: CompetitionDoc): void {
  doc.createdAt = SEED_EPOCH;
  const sorted = [...doc.fixtures].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((fixture, index) => {
    if (fixture.result) {
      fixture.result.completedAt = SEED_EPOCH + (index + 1) * 60_000;
    }
  });
  doc.updatedAt = SEED_EPOCH + sorted.length * 60_000;
}

function buildCompetition(
  plan: CompetitionPlan,
  teamsByRoster: Map<RosterName, Team>
): CompetitionDoc {
  const id = seedCompetitionId(plan.type, plan.fixtureKey);
  const entrants = seedEntrants(
    plan.rosters.map((rosterName) => {
      const team = teamsByRoster.get(rosterName);
      if (!team) {
        throw new Error(
          `competition fixture ${plan.fixtureKey}: no seed team for ${rosterName}`
        );
      }
      return toEntrant(team, id, rosterSlug(rosterName));
    })
  );

  const base = {
    id,
    name: plan.name,
    organizerUid: null,
    participantUids: [] as string[],
    entrants,
    seedMetadata: seedMetadata(plan.fixtureKey),
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  };

  let doc: LeagueDoc | TournamentDoc =
    plan.type === "league"
      ? {
          ...base,
          type: "league",
          status: "draft",
          fixtures: generateRoundRobin(entrants),
          standings: computeStandings(entrants, [], DEFAULT_LEAGUE_POINTS),
          points: DEFAULT_LEAGUE_POINTS,
        }
      : {
          ...base,
          type: "tournament",
          status: "draft",
          format: "single-elimination",
          fixtures: generateSingleElimination(entrants),
          standings: computeStandings(entrants, [], DEFAULT_LEAGUE_POINTS),
        };

  const toPlay =
    plan.state === "complete"
      ? doc.fixtures.length
      : (plan.completeFixtures ?? 0);
  if (toPlay > 0) {
    doc = playFixtures(plan, doc, toPlay);
  }
  if (plan.state === "draft") {
    doc.status = "draft"; // playFixtures never ran; keep the lifecycle state
  }
  normalizeTimestamps(doc);
  return doc;
}

/**
 * A team belongs to at most one ACTIVE competition (design.md decision 4).
 * Draft and completed memberships may freely overlap the same team across
 * plans (see the module docstring), so only "active" plans set the field.
 */
function markActiveMembership(
  docs: CompetitionDoc[],
  teamsByRoster: Map<RosterName, Team>
): void {
  for (const doc of docs) {
    if (doc.status !== "active") continue;
    for (const entrant of doc.entrants) {
      const team = [...teamsByRoster.values()].find(
        (candidate) => candidate.id === entrant.teamId
      );
      if (team) team.activeCompetitionId = doc.id;
    }
  }
}

/** All six lifecycle competitions, plus folded team records for history. */
export function buildSeedCompetitions(teams: Team[]): CompetitionDoc[] {
  const teamsByRoster = new Map(teams.map((team) => [team.rosterName, team]));
  const docs = COMPETITION_PLANS.map((plan) =>
    buildCompetition(plan, teamsByRoster)
  );
  foldCompletedRecords(docs, teamsByRoster);
  markActiveMembership(docs, teamsByRoster);
  return docs;
}

/**
 * Mirror updateTeamRecord: completed fixtures fold W/D/L onto the library
 * teams, so a team's history links agree with its completed memberships.
 */
function foldCompletedRecords(
  docs: CompetitionDoc[],
  teamsByRoster: Map<RosterName, Team>
): void {
  const teamById = new Map(
    [...teamsByRoster.values()].map((team) => [team.id, team])
  );
  const teamByEntrant = new Map<string, Team>();
  for (const doc of docs) {
    if (doc.status !== "complete") continue;
    for (const entrant of doc.entrants) {
      const team = teamById.get(entrant.teamId);
      if (team) teamByEntrant.set(entrant.id, team);
    }
  }
  for (const doc of docs) {
    if (doc.status !== "complete") continue;
    for (const fixture of doc.fixtures) {
      const result = fixture.result;
      if (
        fixture.status !== "complete" ||
        !result ||
        result.bye ||
        !fixture.homeEntrantId ||
        !fixture.awayEntrantId
      ) {
        continue;
      }
      const home = teamByEntrant.get(fixture.homeEntrantId);
      const away = teamByEntrant.get(fixture.awayEntrantId);
      if (!home || !away) continue;
      if (result.homeScore > result.awayScore) {
        home.wins++;
        away.losses++;
      } else if (result.awayScore > result.homeScore) {
        away.wins++;
        home.losses++;
      } else {
        home.draws++;
        away.draws++;
      }
    }
  }
}
