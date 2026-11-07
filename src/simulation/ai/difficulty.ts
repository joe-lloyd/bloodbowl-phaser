/**
 * How hard the computer plays. The levels differ by how far it looks ahead
 * and how long it may take; the plan underneath is the same.
 */

import { Coach } from "../coach";
import { plannerCoach } from "./planner";
import { BUDGETS } from "./search";
import { createWorkerSearchCoach } from "./workerSearchCoach";

export const DIFFICULTIES = [
  {
    id: "standard",
    label: "Standard",
    detail: "Plans each turn and takes the safest actions first.",
  },
  {
    id: "hard",
    label: "Hard",
    detail:
      "Also plays out its options before each action, and at each choice along the way.",
  },
  {
    id: "legend",
    label: "Legend",
    detail: "Plays out more of its options and takes longer over each action.",
  },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]["id"];

/** Most workers to share a search over; one core stays with the page. */
const MAX_WORKERS = 8;

export function coachFor(difficulty: Difficulty): Coach & { close?(): void } {
  if (difficulty === "standard") return plannerCoach;
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2;
  return createWorkerSearchCoach({
    budget: BUDGETS[difficulty],
    workers: Math.max(1, Math.min(MAX_WORKERS, cores - 1)),
    createWorker: () =>
      new Worker(new URL("./searchWorker.ts", import.meta.url), {
        type: "module",
      }),
  });
}
