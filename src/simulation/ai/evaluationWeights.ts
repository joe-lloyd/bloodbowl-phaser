// Written by scripts/coach/fit-evaluation.ts from 92109 positions of
// planner self-play. Refit rather than edit.

import type { EvaluationWeights } from "./evaluate";

export const EVALUATION_WEIGHTS: EvaluationWeights = {
  bias: 0.145,
  half2: 0.009775,
  turns: 0.0336,
  lead: 0.07996,
  ours: 0.624,
  oursTurns: -0.1497,
  oursToGoal: -0.5639,
  oursMarks: -0.08956,
  oursCorners: -0.02806,
  oursInReach: 0.3605,
  theirs: -0.2769,
  theirsTurns: 0.01611,
  theirsToGoal: 0.3778,
  theirsMarkers: 0.1092,
  theirsInReach: -0.2559,
  loose: 0.04366,
  looseNearer: -0.03336,
  standingOurs: 0.03367,
  standingTheirs: -0.05167,
  outOurs: -0.05433,
  outTheirs: 0.04558,
  rerollsOurs: -7.798e-10,
  rerollsTheirs: -7.798e-10,
};
