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
  for (let i = 0; i < remaining; i++) {
    const pick = pairs[Math.floor((i * pairs.length) / remaining)];
    if (pick !== undefined) chosen.add(pick);
  }
  for (const pair of pairs) {
    if (chosen.size >= Math.min(count, pairs.length)) break;
    chosen.add(pair);
  }
  return jobs.filter((j) => chosen.has(j.pair));
}

function opponentIn(group: Variant[], position: number): Variant {
  const opponent = group[position % group.length];
  if (!opponent) throw new Error("No opponent variant");
  return opponent;
}

interface ScheduleOptions {
  smoke: boolean;
  seedBase: number;
  receivingBalance: boolean;
}

interface PairSlot {
  a: Variant;
  b: Variant;
  pair: string;
  seed: number;
}

function pairLegs(
  { a, b, pair, seed }: PairSlot,
  options: ScheduleOptions
): PolicyJob[] {
  const jobs: PolicyJob[] = [];
  for (let leg = 0; leg < (options.receivingBalance ? 8 : 4); leg++) {
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
      ...(options.receivingBalance && { receivingSide: leg < 4 ? (0 as const) : (1 as const) }),
    });
  }
  return jobs;
}

function groupJobs(
  group: Variant[],
  groupIndex: number,
  options: ScheduleOptions
): PolicyJob[] {
  const jobs: PolicyJob[] = [];
  for (const offset of [11, 37]) {
    for (const [index, a] of group.entries()) {
      const b = opponentIn(group, index + offset);
      const pair = `${options.smoke ? "smoke" : "confirm"}-${String(groupIndex)}-${String(offset)}-${String(index)}`;
      const seed =
        (options.smoke ? 12_000_000 : options.seedBase) +
        groupIndex * 10_000 +
        offset * 100 +
        index;
      jobs.push(...pairLegs({ a, b, pair, seed }, options));
    }
  }
  return jobs;
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
  const options = { smoke, seedBase, receivingBalance };
  const jobs: PolicyJob[] = [];
  let groupIndex = 0;
  for (const group of groups.values()) {
    jobs.push(...groupJobs(group, groupIndex, options));
    groupIndex++;
  }
  return jobs;
}
