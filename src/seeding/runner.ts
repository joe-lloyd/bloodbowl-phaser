/**
 * Development seed runner: build, validate, persist — idempotently.
 *
 * Refresh removes every record owned by the seed namespace (any version,
 * including exact-name legacy v1 " Sample" teams) and rebuilds from the
 * current fixture catalog. Ids are stable, so re-running converges on the
 * same records instead of duplicating them. Cleanup selects records by
 * seed ownership metadata only, so coach-created records are never
 * targeted.
 */

import {
  readLocalCompetitions,
  removeLocalCompetitions,
  saveCompetition,
} from "../competition/repository";
import { loadTeams, saveTeams } from "../game/managers/TeamManager";
import { buildAllSeedTeams } from "./teamFixtures";
import { decorateSeedTeams } from "./playerLifecycle";
import { buildSeedCompetitions } from "./competitionFixtures";
import { assertValidDevelopmentSeedData } from "./validateSeeds";
import {
  isSeedCleanupTarget,
  isSeedCompetitionCleanupTarget,
} from "./seedMeta";

export interface SeedRunResult {
  teams: number;
  leagues: number;
  tournaments: number;
  removedTeams: number;
  removedCompetitions: number;
}

export interface SeedCleanupResult {
  removedTeams: number;
  removedCompetitions: number;
}

/**
 * Build the full catalog, validate every invariant, then persist.
 * Throws SeedFixtureError / SeedValidationError before anything is written
 * when a fixture is illegal — the previous seed state is left untouched.
 */
export function seedDevelopmentData(): SeedRunResult {
  // 1. Build + decorate + validate (no writes yet).
  const teams = buildAllSeedTeams();
  decorateSeedTeams(teams);
  const competitions = buildSeedCompetitions(teams);
  assertValidDevelopmentSeedData(teams, competitions);

  // 2. Replace every seed-owned record (any version) with the new catalog.
  const existing = loadTeams();
  const kept = existing.filter((team) => !isSeedCleanupTarget(team));
  const removedTeams = existing.length - kept.length;
  saveTeams([...kept, ...teams]);

  const existingCompetitions = readLocalCompetitions();
  const removedCompetitionIds = existingCompetitions
    .filter((doc) => isSeedCompetitionCleanupTarget(doc))
    .map((doc) => doc.id);
  removeLocalCompetitions(removedCompetitionIds);
  // Local documents (organizerUid null): saveCompetition persists them
  // synchronously on the local path.
  for (const doc of competitions) {
    void saveCompetition(doc);
  }

  return {
    teams: teams.length,
    leagues: competitions.filter((doc) => doc.type === "league").length,
    tournaments: competitions.filter((doc) => doc.type === "tournament")
      .length,
    removedTeams,
    removedCompetitions: removedCompetitionIds.length,
  };
}

/**
 * Remove seed-owned records. With `targetVersion`, only that seed version
 * is removed; without it, every version of the namespace goes (including
 * legacy v1 " Sample" teams). Coach-created records are never selected.
 */
export function cleanupDevelopmentSeedData(
  targetVersion?: number
): SeedCleanupResult {
  const existing = loadTeams();
  const kept = existing.filter(
    (team) => !isSeedCleanupTarget(team, targetVersion)
  );
  saveTeams(kept);

  const removedCompetitionIds = readLocalCompetitions()
    .filter((doc) => isSeedCompetitionCleanupTarget(doc, targetVersion))
    .map((doc) => doc.id);
  removeLocalCompetitions(removedCompetitionIds);

  return {
    removedTeams: existing.length - kept.length,
    removedCompetitions: removedCompetitionIds.length,
  };
}
