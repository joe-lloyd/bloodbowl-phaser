import * as fs from "node:fs";
import { type Coach } from "../coach";
import { randomCoach } from "../coaches/random";
import { heuristicCoach } from "../coaches/heuristic";
import { createPlannerCoach, plannerCoach } from "../ai/planner";
import { BUDGETS, createSearchCoach } from "../ai/search";
import { parseWeights, type Weights } from "../ai/weights";
import { createJevCoach, type JevStats } from "../coaches/jev";

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

export function readWeights(file: string): Weights {
  return parseWeights(JSON.parse(fs.readFileSync(file, "utf8")));
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
      budget: {
        samples: BUDGETS[name].samples,
        options: BUDGETS[name].options,
      },
      ...(weightsFile && { weights: readWeights(weightsFile) }),
    });
  if (name === "planner")
    return weightsFile
      ? createPlannerCoach({ weights: readWeights(weightsFile) })
      : plannerCoach;
  const apiKey = process.env["TYPESAFE_API_KEY"];
  if (!apiKey) fail("the jev coach needs TYPESAFE_API_KEY in the environment");
  const model = process.env["TYPESAFE_MODEL"];
  const coach = createJevCoach({
    apiKey,
    ...(model !== undefined && { model }),
  });
  jevStats.push(coach.stats);
  return coach;
}
