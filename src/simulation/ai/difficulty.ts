import { type Coach } from "../coach";
import { createPlannerCoach } from "./planner";
import { STANDARD_VARIETY } from "./gamePlans";
import { BUDGETS } from "./search";
import { createWorkerSearchCoach } from "./workerSearchCoach";

export const DIFFICULTIES = [
  {
    id: "standard",
    label: "Standard",
    detail:
      "Plans each turn with a game plan of its own, and sometimes takes a close second-best play.",
  },
  {
    id: "hard",
    label: "Hard",
    detail:
      "Also plays out its options before each action, and at each dice, push or follow-up choice.",
  },
  {
    id: "legend",
    label: "Legend",
    detail:
      "Plays out each option more times and takes longer over each action.",
  },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]["id"];

const MAX_WORKERS = 8;

export function coachFor(difficulty: Difficulty): Coach & { close?(): void } {
  if (difficulty === "standard")
    return createPlannerCoach({
      name: "standard",
      variety: STANDARD_VARIETY,
    });
  const cores = globalThis.navigator.hardwareConcurrency;
  return createWorkerSearchCoach({
    budget: BUDGETS[difficulty],
    workers: Math.max(1, Math.min(MAX_WORKERS, cores - 1)),
    createWorker: () =>
      new Worker(new URL("searchWorker.ts", import.meta.url), {
        type: "module",
      }),
  });
}
