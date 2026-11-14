/**
 * What every `pnpm sim` subcommand shares: failing on bad input, and the
 * coaches a command line can name.
 */

import * as fs from "node:fs";
import { Coach } from "../coach";
import { randomCoach } from "../coaches/random";
import { heuristicCoach } from "../coaches/heuristic";
import { createPlannerCoach, plannerCoach } from "../ai/planner";
import { BUDGETS, createSearchCoach } from "../ai/search";
import { parseWeights } from "../ai/weights";
import { createJevCoach, JevStats } from "../coaches/jev";

export type CoachName =
  | "random"
  | "heuristic"
  | "jev"
  | "planner"
  | "hard"
  | "legend";

export function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

export function makeCoach(
  name: CoachName,
  jevStats: JevStats[],
  weightsFile?: string
): Coach {
  if (name === "random") return randomCoach;
  if (name === "heuristic") return heuristicCoach;
  if (name === "hard" || name === "legend")
    return createSearchCoach({
      // The bench has no clock: a deadline would make its games unrepeatable.
      budget: {
        samples: BUDGETS[name].samples,
        options: BUDGETS[name].options,
      },
      ...(weightsFile
        ? {
            weights: parseWeights(
              JSON.parse(fs.readFileSync(weightsFile, "utf8"))
            ),
          }
        : {}),
    });
  if (name === "planner")
    return weightsFile
      ? createPlannerCoach({
          weights: parseWeights(
            JSON.parse(fs.readFileSync(weightsFile, "utf8"))
          ),
        })
      : plannerCoach;
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) fail("the jev coach needs TYPESAFE_API_KEY in the environment");
  const coach = createJevCoach({ apiKey, model: process.env.TYPESAFE_MODEL });
  jevStats.push(coach.stats);
  return coach;
}
