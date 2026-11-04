/**
 * How hard the computer plays. The levels differ by how far it looks ahead
 * and how long it may take; the plan underneath is the same.
 */

import { Coach } from "../coach";
import { plannerCoach } from "./planner";
import { SearchBudget } from "./search";
import { createWorkerSearchCoach } from "./workerSearchCoach";

export const DIFFICULTIES = [
  {
    id: "standard",
    label: "Standard",
    detail: "Plays each turn safest action first.",
  },
  {
    id: "hard",
    label: "Hard",
    detail: "Also tries out its best options before each activation.",
  },
  {
    id: "legend",
    label: "Legend",
    detail: "Looks harder and takes longer over each activation.",
  },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]["id"];

const BUDGETS: Record<Exclude<Difficulty, "standard">, SearchBudget> = {
  hard: { samples: 2, options: 4, deadlineMs: 1500 },
  legend: { samples: 4, options: 6, deadlineMs: 4000 },
};

export function coachFor(difficulty: Difficulty): Coach & { close?(): void } {
  if (difficulty === "standard") return plannerCoach;
  return createWorkerSearchCoach({
    budget: BUDGETS[difficulty],
    createWorker: () =>
      new Worker(new URL("./searchWorker.ts", import.meta.url), {
        type: "module",
      }),
  });
}
