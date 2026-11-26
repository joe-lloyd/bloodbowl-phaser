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
          opponentAt(ids, index + offset),
          replicate,
          offset,
          index
        )
      )
    )
  );
}

function opponentAt(ids: string[], position: number): string {
  const opponent = ids[position % ids.length];
  if (opponent === undefined) throw new Error("No opponent template");
  return opponent;
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
    const pair = `advanced-${String(replicate)}-${String(offset)}-${String(index)}-${arm}-${other}`;
    const a = `${id}--${arm}-${String(replicate)}`;
    const b = `${opponent}--${other}${other === "base" ? "" : "-" + replicate}`;
    for (const reverse of [false, true])
      jobs.push({
        id: pair + "-" + Number(reverse),
        pair,
        cohort: "advanced",
        comparison: `${arm}-vs-${other}` as AdvancedJob["comparison"],
        seed: 9_000_000 + replicate * 10_000 + offset * 100 + index,
        templates: reverse ? [opponent, id] : [id, opponent],
        variantIds: reverse ? [b, a] : [a, b],
        coaches: ["planner", "planner"],
      });
  }
  return jobs;
}
