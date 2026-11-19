import {
  readLocalCompetitions,
  removeLocalCompetitions,
  saveCompetition,
} from "../competition/repository";
import {
  assertTeamLibraryLoaded,
  loadTeams,
  saveTeams,
} from "../game/managers/TeamManager";
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

export function seedDevelopmentData(): SeedRunResult {
  assertTeamLibraryLoaded();

  const teams = buildAllSeedTeams();
  decorateSeedTeams(teams);
  const competitions = buildSeedCompetitions(teams);
  assertValidDevelopmentSeedData(teams, competitions);

  const existing = loadTeams();
  const kept = existing.filter((team) => !isSeedCleanupTarget(team));
  const removedTeams = existing.length - kept.length;
  saveTeams([...kept, ...teams]);

  const existingCompetitions = readLocalCompetitions();
  const removedCompetitionIds = existingCompetitions
    .filter((doc) => isSeedCompetitionCleanupTarget(doc))
    .map((doc) => doc.id);
  removeLocalCompetitions(removedCompetitionIds);

  for (const doc of competitions) {
    void saveCompetition(doc);
  }

  return {
    teams: teams.length,
    leagues: competitions.filter((doc) => doc.type === "league").length,
    tournaments: competitions.filter((doc) => doc.type === "tournament").length,
    removedTeams,
    removedCompetitions: removedCompetitionIds.length,
  };
}

export function cleanupDevelopmentSeedData(
  targetVersion?: number
): SeedCleanupResult {
  assertTeamLibraryLoaded();
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
