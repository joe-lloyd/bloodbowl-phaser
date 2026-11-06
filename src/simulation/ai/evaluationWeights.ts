// Written by scripts/coach/fit-evaluation.ts from 99271 positions of
// planner self-play. Refit rather than edit.

import type { EvaluationWeights } from "./evaluate";

export const EVALUATION_WEIGHTS: EvaluationWeights = {
  bias: 0.1554,
  half2: 0.003402,
  turns: 0.06986,
  lead: 0.06292,
  ours: 0.6395,
  oursTurns: -0.1724,
  oursToGoal: -0.6238,
  oursMarks: -0.07169,
  oursCorners: -0.02106,
  oursInReach: 0.3461,
  oursInTime: 0,
  theirs: -0.292,
  theirsTurns: -0.01488,
  theirsToGoal: 0.3846,
  theirsMarkers: 0.07929,
  theirsInReach: -0.247,
  theirsInTime: 0,
  loose: 0.04239,
  looseNearer: -0.06342,
  looseOursBeside: 0,
  looseTheirsBeside: 0,
  standingOurs: 0.03358,
  standingTheirs: -0.05246,
  outOurs: -0.05786,
  outTheirs: 0.05041,
  rerollsOurs: 0.02915,
  rerollsTheirs: -0.03483,
};
