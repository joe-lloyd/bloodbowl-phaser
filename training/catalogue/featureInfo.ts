import type { EvaluationWeights } from "../../src/simulation/ai/evaluate";

interface FeatureInfo {
  label: string;
  description: string;
}

export const FEATURE_INFO: Record<keyof EvaluationWeights, FeatureInfo> = {
  bias: {
    label: "Starting score",
    description: "Added to every position before anything is counted.",
  },
  half2: {
    label: "Second half",
    description: "Counts 1 in the second half.",
  },
  turns: {
    label: "Turns left",
    description: "The share of the half's turns still to play.",
  },
  lead: {
    label: "Lead",
    description:
      "Our touchdown lead. It is also added once on its own, so a touchdown always counts.",
  },
  ours: {
    label: "We hold the ball",
    description: "Counts 1 when one of our players carries the ball.",
  },
  oursTurns: {
    label: "Our ball, turns left",
    description: "The turns left in the half while we carry the ball.",
  },
  oursToGoal: {
    label: "Our carrier's distance",
    description: "How far our carrier is from scoring.",
  },
  oursMarks: {
    label: "Our carrier marked",
    description: "Opposing tackle zones on our carrier.",
  },
  oursCorners: {
    label: "Our cage corners",
    description: "Standing team-mates on our carrier's corners.",
  },
  oursInReach: {
    label: "Our carrier in reach",
    description:
      "Counts 1 when our carrier is within Movement plus two rushes of the end zone.",
  },
  theirs: {
    label: "They hold the ball",
    description: "Counts 1 when an opponent carries the ball.",
  },
  theirsTurns: {
    label: "Their ball, turns left",
    description: "The turns left in the half while they carry the ball.",
  },
  theirsToGoal: {
    label: "Their carrier's distance",
    description: "How far their carrier is from scoring.",
  },
  theirsMarkers: {
    label: "Their carrier marked",
    description: "Our standing players next to their carrier.",
  },
  theirsInReach: {
    label: "Their carrier in reach",
    description:
      "Counts 1 when their carrier is within Movement plus two rushes of our end zone.",
  },
  loose: {
    label: "Loose ball",
    description: "Counts 1 for each ball on the ground.",
  },
  looseNearer: {
    label: "Nearer the loose ball",
    description:
      "How much nearer our closest standing player is to a loose ball than theirs.",
  },
  standingOurs: {
    label: "Our players standing",
    description: "Our players on their feet.",
  },
  standingTheirs: {
    label: "Their players standing",
    description: "Their players on their feet, averaged over the rivals.",
  },
  outOurs: {
    label: "Our players out",
    description: "Our players knocked out, injured or dead.",
  },
  outTheirs: {
    label: "Their players out",
    description: "Their players knocked out, injured or dead.",
  },
  rerollsOurs: {
    label: "Our re-rolls",
    description: "Team re-rolls we have left.",
  },
  rerollsTheirs: {
    label: "Their re-rolls",
    description: "Team re-rolls they have left.",
  },
  leaderGap: {
    label: "Behind the leader",
    description:
      "In matches of more than two teams, our touchdowns behind the leading team.",
  },
  centre: {
    label: "Hold the centre",
    description:
      "In matches of more than two teams, our players near the centre against the rivals' average.",
  },
};
