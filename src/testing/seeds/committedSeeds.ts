import committed from "./committedSeeds.json" with { type: "json" };

export type CommittedSeedMap = Record<string, number>;

export const COMMITTED_SEEDS: CommittedSeedMap = committed;

export function seedKey(configId: string, outcomeId: string): string {
  return `${configId}/${outcomeId}`;
}

export function committedSeedFor(
  configId: string,
  outcomeId: string
): number | undefined {
  return COMMITTED_SEEDS[seedKey(configId, outcomeId)];
}
