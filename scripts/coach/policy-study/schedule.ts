import type { Variant } from "../advanced-study/teams";
import type { StudyJob } from "../catalogue-study/model";

export interface PolicyJob extends StudyJob {
  cohort: "advanced";
  variantIds: [string, string];
  candidateSide: 0 | 1;
  development: Variant["arm"];
  leg: number;
}

export function limitPolicyBlocks(
  jobs: PolicyJob[],
  count: number,
  requiredVariants: string[] = []
): PolicyJob[] {
  const pairs = [...new Set(jobs.map((j) => j.pair))];
  const chosen = new Set<string>();
  for (const id of requiredVariants) {
    const pair = jobs.find((j) => j.variantIds.includes(id))?.pair;
    if (pair && chosen.size < count) chosen.add(pair);
  }
  const remaining = Math.min(count, pairs.length) - chosen.size;
  for (let i = 0; i < remaining; i++)
    chosen.add(pairs[Math.floor((i * pairs.length) / remaining)]);
  for (const pair of pairs) {
    if (chosen.size >= Math.min(count, pairs.length)) break;
    chosen.add(pair);
  }
  return jobs.filter((j) => chosen.has(j.pair));
}

export function policySchedule(
  variants: Variant[],
  smoke = false,
  seedBase = 13_000_000,
  receivingBalance = false
): PolicyJob[] {
  const groups = new Map<string, Variant[]>();
  for (const v of variants) {
    const group = `${v.arm}:${String(v.replicate)}`;
    groups.set(group, [...(groups.get(group) ?? []), v]);
  }
  const jobs: PolicyJob[] = [];
  let groupIndex = 0;
  for (const group of groups.values()) {
    for (const offset of [11, 37])
      group.forEach((a, index) => {
        const b = group[(index + offset) % group.length];
        const pair = `${smoke ? "smoke" : "confirm"}-${String(groupIndex)}-${String(offset)}-${String(index)}`;
        const seed =
          (smoke ? 12_000_000 : seedBase) +
          groupIndex * 10000 +
          offset * 100 +
          index;
        for (let leg = 0; leg < (receivingBalance ? 8 : 4); leg++) {
          const sides: [Variant, Variant] = leg % 2 ? [b, a] : [a, b];
          jobs.push({
            id: `${pair}-${String(leg)}`,
            pair,
            seed,
            leg,
            cohort: "advanced",
            coaches: ["planner", "planner"],
            templates: [sides[0].template, sides[1].template],
            variantIds: [sides[0].id, sides[1].id],
            candidateSide: leg % 4 === 0 || leg % 4 === 3 ? 0 : 1,
            development: a.arm,
            ...(receivingBalance
              ? { receivingSide: leg < 4 ? (0 as const) : (1 as const) }
              : {}),
          });
        }
      });
    groupIndex++;
  }
  return jobs;
}
