/**
 * Ownership metadata stamped on development seed records (teams, competition
 * documents). Seed cleanup selects records exclusively by this marker, so
 * coach-created records can never be targeted.
 */
export interface SeedMetadata {
  /** Seed family, e.g. "dev-seed". */
  namespace: string;
  /** Seed catalog version; bumped when the fixture schema changes. */
  version: number;
  /** Stable key of the fixture definition that produced the record. */
  fixtureKey: string;
}
