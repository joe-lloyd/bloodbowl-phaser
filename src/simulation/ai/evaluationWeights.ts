// Written by scripts/coach/fit-evaluation.ts from 153731 positions of
// planner self-play. Refit rather than edit.

import type { EvaluationWeights } from "./evaluate";

export const EVALUATION_WEIGHTS: EvaluationWeights = {
  bias: 0.1259,
  half2: 0.001012,
  turns: 0.02661,
  lead: 0.07891,
  ours: 0.4847,
  oursTurns: -0.2778,
  oursToGoal: -0.612,
  oursMarks: -0.08532,
  oursCorners: -0.02028,
  oursInReach: 0.3047,
  oursInTime: 0.2434,
  theirs: -0.2902,
  theirsTurns: 0.06581,
  theirsToGoal: 0.3917,
  theirsMarkers: 0.09961,
  theirsInReach: -0.2262,
  theirsInTime: -0.07291,
  loose: 0.04753,
  looseNearer: -0.1175,
  looseOursBeside: 0.04061,
  looseTheirsBeside: -0.06544,
  standingOurs: 0.02991,
  standingTheirs: -0.03964,
  outOurs: -0.06295,
  outTheirs: 0.05983,
  rerollsOurs: 0.03264,
  rerollsTheirs: -0.03825,
};
