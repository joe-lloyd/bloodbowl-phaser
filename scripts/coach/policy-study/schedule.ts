/** Four-game blocks balance physical side and which roster each policy uses. */
import type { Variant } from "../advanced-study/teams";
import type { StudyJob } from "../catalogue-study/model";

export interface PolicyJob extends StudyJob {
  cohort: "advanced";
  variantIds: [string, string];
  candidateSide: 0 | 1;
  development: Variant["arm"];
  leg: number;
}

export function policySchedule(
  variants: Variant[],
  smoke = false,
  seedBase = 13_000_000,
  receivingBalance = false
): PolicyJob[] {
  const groups = new Map<string, Variant[]>();
  for (const v of variants) {
    const group = `${v.arm}:${v.replicate}`;
    groups.set(group, [...(groups.get(group) ?? []), v]);
  }
  const jobs: PolicyJob[] = [];
  let groupIndex = 0;
  for (const group of groups.values()) {
    for (const offset of [11, 37])
      group.forEach((a, index) => {
        const b = group[(index + offset) % group.length];
        const pair = `${smoke ? "smoke" : "confirm"}-${groupIndex}-${offset}-${index}`;
        const seed =
          (smoke ? 12_000_000 : seedBase) +
          groupIndex * 10000 +
          offset * 100 +
          index;
        for (let leg = 0; leg < (receivingBalance ? 8 : 4); leg++) {
          const sides: [Variant, Variant] = leg % 2 ? [b, a] : [a, b];
          jobs.push({
            id: `${pair}-${leg}`,
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
