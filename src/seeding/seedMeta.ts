/**
 * Development seed ownership: namespace, catalog version, stable ids, and
 * the deterministic RNG used by every fixture builder.
 *
 * Every generated record (team, competition doc) carries `seedMetadata`
 * (src/types/seedMetadata.ts). Cleanup selects records exclusively by that
 * marker — coach-created records have no marker and are never matched.
 *
 * Legacy recognition: the pre-metadata seeder (v1) created teams named
 * exactly `${rosterName} Sample` with random ids. Those exact names are
 * treated as version-1 records of this namespace so a refresh replaces
 * them; any other coach-chosen name is left alone.
 */

import { Team } from "../types/Team";
import { CompetitionDoc } from "../competition/types";
import { SeedMetadata } from "../types/seedMetadata";
import { DeterministicRNG } from "../services/rng/DeterministicRNG";
import { getAvailableRosterNames } from "../data/RosterTemplates";

export const SEED_NAMESPACE = "dev-seed";

/**
 * Bump when the fixture catalog changes shape; existing seeded records of
 * older versions are removed on the next refresh (see runner).
 */
export const SEED_VERSION = 2;

const LEGACY_VERSION = 1;

/** Fixed clock for createdAt/updatedAt/completedAt so runs converge. */
export const SEED_EPOCH = 1_700_000_000_000; // 2023-11-14T22:13:20Z

export function seedMetadata(fixtureKey: string): SeedMetadata {
  return { namespace: SEED_NAMESPACE, version: SEED_VERSION, fixtureKey };
}

/** slug used in stable ids: RosterName.HUMAN -> "human". */
export function rosterSlug(rosterName: string): string {
  return rosterName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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

/** Records owned by this seed namespace (any version). */
export function isSeedOwned(
  record: { seedMetadata?: SeedMetadata } | null | undefined
): boolean {
  return record?.seedMetadata?.namespace === SEED_NAMESPACE;
}

export function seedVersionOf(record: {
  seedMetadata?: SeedMetadata;
}): number | null {
  return isSeedOwned(record) ? (record?.seedMetadata?.version ?? null) : null;
}

/** Exact names produced by the pre-metadata (v1) seeder. */
const LEGACY_SAMPLE_NAMES = new Set(
  getAvailableRosterNames().map((rosterName) => `${rosterName} Sample`)
);

/**
 * Is this team a legacy (version-1, metadata-less) seed record? Exact-match
 * only, so a coach team that merely ends with "Sample" is not selected.
 */
export function isLegacySeedTeam(team: Team): boolean {
  return !isSeedOwned(team) && LEGACY_SAMPLE_NAMES.has(team.name);
}

/**
 * Selects seed-owned records for cleanup. With `targetVersion`, only that
 * version is removed; without it, every version of the namespace (including
 * legacy v1 teams) is removed. Coach-created records never match.
 */
export function isSeedCleanupTarget(
  team: Team,
  targetVersion?: number
): boolean {
  if (isSeedOwned(team)) {
    return targetVersion === undefined || team.seedMetadata!.version === targetVersion;
  }
  if (isLegacySeedTeam(team)) {
    return targetVersion === undefined || targetVersion === LEGACY_VERSION;
  }
  return false;
}

/** Competitions carry metadata from v2 onwards — no legacy recognition. */
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

/** FNV-1a string hash -> uint32, for named RNG seeds. */
function hashSeedName(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A deterministic RNG for one named fixture aspect (e.g.
 * `match:autumn-cup:round-1-match-1`). Same namespace + version + name
 * always yields the same stream.
 */
export function rngFor(name: string): DeterministicRNG {
  return new DeterministicRNG(
    hashSeedName(`${SEED_NAMESPACE}:v${SEED_VERSION}:${name}`)
  );
}
