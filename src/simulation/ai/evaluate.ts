import { GameConfig } from "../../config/GameConfig";
import { teamRerollsLeft } from "../../game/teamRerolls";
import { PlayerStatus } from "../../types/Player";
import type { Team } from "../../types/Team";
import {
  DEFAULT_GAME_TYPE,
  type MatchType,
} from "../../game/variants/gameTypes";
import {
  type BallView,
  type Board,
  type FieldPlayer,
  type Square,
  distance,
  key,
  standing,
  toGoal,
} from "./board";
import { EVALUATION_WEIGHTS } from "./evaluationWeights";

export const FEATURES = [
  "half2",
  "turns",
  "lead",
  "ours",
  "oursTurns",
  "oursToGoal",
  "oursMarks",
  "oursCorners",
  "oursInReach",
  "theirs",
  "theirsTurns",
  "theirsToGoal",
  "theirsMarkers",
  "theirsInReach",
  "loose",
  "looseNearer",
  "standingOurs",
  "standingTheirs",
  "outOurs",
  "outTheirs",
  "rerollsOurs",
  "rerollsTheirs",
] as const;

export type Feature = (typeof FEATURES)[number];
export type EvaluationWeights = Record<"bias" | Feature, number>;

const ZERO_FEATURES: Record<Feature, number> = {
  half2: 0,
  turns: 0,
  lead: 0,
  ours: 0,
  oursTurns: 0,
  oursToGoal: 0,
  oursMarks: 0,
  oursCorners: 0,
  oursInReach: 0,
  theirs: 0,
  theirsTurns: 0,
  theirsToGoal: 0,
  theirsMarkers: 0,
  theirsInReach: 0,
  loose: 0,
  looseNearer: 0,
  standingOurs: 0,
  standingTheirs: 0,
  outOurs: 0,
  outTheirs: 0,
  rerollsOurs: 0,
  rerollsTheirs: 0,
};

function outCount(board: Board, team: string): number {
  return (board.gs.getTeam(team)?.players ?? []).filter(
    (player) =>
      player.status === PlayerStatus.KO ||
      player.status === PlayerStatus.INJURED ||
      player.status === PlayerStatus.DEAD
  ).length;
}

const meanOverRivals = (board: Board, count: (team: Team) => number) =>
  board.rivals.reduce((sum, { team }) => sum + count(team), 0) /
  board.rivals.length;

function ourCarrierFeatures(
  board: Board,
  carrier: FieldPlayer,
  f: Record<Feature, number>
): void {
  const at = carrier.gridPosition;
  const dist = toGoal(board, at);
  f.ours += 1;
  f.oursTurns += f.turns;
  f.oursToGoal += dist / board.goalScale;
  f.oursMarks += board.marks.getUint8(key(at));
  f.oursCorners += board.ours.filter(
    (p) =>
      standing(p) &&
      Math.abs(p.gridPosition.x - at.x) === 1 &&
      Math.abs(p.gridPosition.y - at.y) === 1
  ).length;
  f.oursInReach += dist <= carrier.stats.MA + 2 ? 1 : 0;
}

function theirCarrierFeatures(
  board: Board,
  carrier: FieldPlayer,
  f: Record<Feature, number>
): void {
  const at = carrier.gridPosition;
  const dist = toGoal(board, at, carrier.teamId);
  f.theirs += 1;
  f.theirsTurns += f.turns;
  f.theirsToGoal += dist / board.goalScale;
  f.theirsMarkers += board.ours.filter(
    (p) => standing(p) && distance(p.gridPosition, at) === 1
  ).length;
  f.theirsInReach += dist <= carrier.stats.MA + 2 ? 1 : 0;
}

function looseFeatures(
  board: Board,
  at: Square,
  f: Record<Feature, number>
): void {
  const nearest = (players: Board["ours"]) =>
    Math.min(
      10,
      ...players.filter(standing).map((p) => distance(p.gridPosition, at))
    );
  f.loose += 1;
  f.looseNearer += (nearest(board.theirs) - nearest(board.ours)) / 10;
}

function ballFeatures(
  board: Board,
  ball: BallView,
  f: Record<Feature, number>
): void {
  if (ball.kind === "loose") {
    looseFeatures(board, ball.at, f);
    return;
  }
  if (ball.kind === "none") return;
  const { carrier } = ball;
  if (toGoal(board, carrier.gridPosition, carrier.teamId) === 0) return;
  if (carrier.teamId === board.us) ourCarrierFeatures(board, carrier, f);
  else theirCarrierFeatures(board, carrier, f);
}

export function features(board: Board): Record<Feature, number> {
  const state = board.gs.getState();
  const f = {
    ...ZERO_FEATURES,
    half2: board.half2 ? 1 : 0,
    turns: board.turnsLeft / GameConfig.TURNS_PER_HALF,
    lead: board.lead,
    standingOurs: board.ours.filter(standing).length,
    standingTheirs: board.theirs.filter(standing).length / board.rivals.length,
    outOurs: outCount(board, board.us),
    outTheirs: meanOverRivals(board, (team) => outCount(board, team.id)),
    rerollsOurs: board.rerolls,
    rerollsTheirs: meanOverRivals(board, (team) =>
      teamRerollsLeft(state, team)
    ),
  };
  for (const ball of board.balls) ballFeatures(board, ball, f);
  return f;
}

const WEIGHTS_BY_TYPE: Record<MatchType, EvaluationWeights> = {
  sevens: EVALUATION_WEIGHTS,
  "gutter-bowl": EVALUATION_WEIGHTS,
  "street-bowl": EVALUATION_WEIGHTS,
  "beach-bowl": EVALUATION_WEIGHTS,
  deathbowl: EVALUATION_WEIGHTS,
};

export const evaluationWeightsFor = (type: MatchType): EvaluationWeights =>
  WEIGHTS_BY_TYPE[type];

export function evaluate(
  board: Board,
  w: EvaluationWeights = evaluationWeightsFor(
    board.gs.getState().gameType ?? DEFAULT_GAME_TYPE
  )
): number {
  const f = features(board);
  return FEATURES.reduce(
    (value, n) => value + w[n] * f[n],
    board.lead + w.bias
  );
}
