import { describe, expect, it } from "vitest";
import { advancedInventory } from "../../scripts/coach/advanced-study/teams";
import { policySchedule } from "../../scripts/coach/policy-study/schedule";

describe("policy comparison balance", () => {
  it("gives each variant both policies on both physical sides with disjoint smoke seeds", () => {
    const variants = advancedInventory();
    const jobs = policySchedule(variants);
    expect(jobs).toHaveLength(3280);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
    const exposures = new Map<string, number>();
    for (let i = 0; i < jobs.length; i += 4) {
      const block = jobs.slice(i, i + 4);
      expect(new Set(block.map((j) => j.seed)).size).toBe(1);
      expect(new Set(block.map((j) => j.pair)).size).toBe(1);
      const assignments = block.map(
        (j) => `${j.variantIds[j.candidateSide]}:${String(j.candidateSide)}`
      );
      expect(new Set(assignments).size).toBe(4);
      for (const job of block) {
        for (const side of [0, 1]) {
          const key = `${String(job.variantIds[side])}:${String(side)}:${String(job.candidateSide === side)}`;
          exposures.set(key, (exposures.get(key) ?? 0) + 1);
        }
      }
    }
    expect(exposures.size).toBe(variants.length * 4);
    expect(new Set(exposures.values())).toEqual(new Set([4]));
    const smokeSeeds = new Set(
      policySchedule(variants, true).map((j) => j.seed)
    );
    expect(jobs.every((j) => !smokeSeeds.has(j.seed))).toBe(true);
  });
});
