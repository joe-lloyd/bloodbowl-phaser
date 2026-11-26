import { type Team } from "../types/Team";
import { type CompetitionDoc } from "../competition/types";
import { type SeedMetadata } from "../types/seedMetadata";
import { DeterministicRNG } from "../services/rng/DeterministicRNG";
import { getAvailableRosterNames } from "../data/RosterTemplates";

export const SEED_NAMESPACE = "dev-seed";

export const SEED_VERSION = 2;

const LEGACY_VERSION = 1;

export const SEED_EPOCH = 1_700_000_000_000;

export function seedMetadata(fixtureKey: string): SeedMetadata {
  return { namespace: SEED_NAMESPACE, version: SEED_VERSION, fixtureKey };
}

export function rosterSlug(rosterName: string): string {
  return rosterName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}

export function seedTeamId(fixtureKey: string): string {
  return `${SEED_NAMESPACE}-team-${fixtureKey}`;
}

export function seedCompetitionId(
  type: "league" | "tournament",
  fixtureKey: string
): string {
  return `${SEED_NAMESPACE}-${type}-${fixtureKey}`;
}

export function seedEntrantId(
  competitionId: string,
  teamFixtureKey: string
): string {
  return `${competitionId}-entrant-${teamFixtureKey}`;
}

export function isSeedOwned(
  record: { seedMetadata?: SeedMetadata } | null | undefined
): boolean {
  return record?.seedMetadata?.namespace === SEED_NAMESPACE;
}

const LEGACY_SAMPLE_NAMES = new Set(
  getAvailableRosterNames().map((rosterName) => `${rosterName} Sample`)
);

function isLegacySeedTeam(team: Team): boolean {
  return !isSeedOwned(team) && LEGACY_SAMPLE_NAMES.has(team.name);
}

export function isSeedCleanupTarget(
  team: Team,
  targetVersion?: number
): boolean {
  if (isSeedOwned(team)) {
    return (
      targetVersion === undefined ||
      team.seedMetadata!.version === targetVersion
    );
  }
  if (isLegacySeedTeam(team)) {
    return targetVersion === undefined || targetVersion === LEGACY_VERSION;
  }
  return false;
}

export function isSeedCompetitionCleanupTarget(
  competition: CompetitionDoc,
  targetVersion?: number
): boolean {
  if (!isSeedOwned(competition)) return false;
  return (
    targetVersion === undefined ||
    competition.seedMetadata!.version === targetVersion
  );
}

function hashSeedName(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function rngFor(name: string): DeterministicRNG {
  return new DeterministicRNG(
    hashSeedName(`${SEED_NAMESPACE}:v${String(SEED_VERSION)}:${name}`)
  );
}
