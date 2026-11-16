import type { StudyJob } from "../catalogue-study/model";
import type { Variant } from "./teams";

export interface AdvancedJob extends StudyJob {
  cohort: "advanced";
  comparison: "focused-vs-base" | "random-vs-base" | "focused-vs-random";
  variantIds: [string, string];
}

export function advancedSchedule(variants: Variant[]): AdvancedJob[] {
  const ids = variants.filter((v) => v.arm === "base").map((v) => v.template);
  return [0, 1].flatMap((replicate) =>
    [7, 29].flatMap((offset) =>
      ids.flatMap((id, index) =>
        comparisonJobs(
          id,
          ids[(index + offset) % ids.length],
          replicate,
          offset,
          index
        )
      )
    )
  );
}

function comparisonJobs(
  id: string,
  opponent: string,
  replicate: number,
  offset: number,
  index: number
): AdvancedJob[] {
  const jobs: AdvancedJob[] = [];
  for (const [arm, other] of [
    ["focused", "base"],
    ["random", "base"],
    ["focused", "random"],
  ] as const) {
    const pair = `advanced-${replicate}-${offset}-${index}-${arm}-${other}`;
    const a = `${id}--${arm}-${replicate}`;
    const b = `${opponent}--${other}${other === "base" ? "" : "-" + replicate}`;
    for (const reverse of [false, true])
      jobs.push({
        id: pair + "-" + Number(reverse),
        pair,
        cohort: "advanced",
        comparison: `${arm}-vs-${other}` as AdvancedJob["comparison"],
        seed: 9_000_000 + replicate * 10000 + offset * 100 + index,
        templates: reverse ? [opponent, id] : [id, opponent],
        variantIds: reverse ? [b, a] : [a, b],
        coaches: ["planner", "planner"],
      });
  }
  return jobs;
}
