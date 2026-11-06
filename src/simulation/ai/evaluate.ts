/**
 * How good a position is for one team: the touchdowns it is likely to finish
 * ahead by. The lookahead scores its playouts with this. The weights are
 * fitted to planner self-play by `scripts/coach/fit-evaluation.ts`, which
 * also writes evaluationWeights.ts; edit the features here, then refit.
 */

import { teamRerollsLeft } from "../../game/teamRerolls";
import { PlayerStatus } from "../../types/Player";
import { Board, carrierOf, distance, key, standing, toGoal } from "./board";
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
  "oursInTime",
  "theirs",
  "theirsTurns",
  "theirsToGoal",
  "theirsMarkers",
  "theirsInReach",
  "theirsInTime",
  "loose",
  "looseNearer",
  "looseOursBeside",
  "looseTheirsBeside",
  "standingOurs",
  "standingTheirs",
  "outOurs",
  "outTheirs",
  "rerollsOurs",
  "rerollsTheirs",
] as const;

export type Feature = (typeof FEATURES)[number];
export type EvaluationWeights = Record<"bias" | Feature, number>;

/** What the evaluation reads off a board, 0 where a feature does not apply. */
export function features(board: Board): Record<Feature, number> {
  const f = Object.fromEntries(FEATURES.map((n) => [n, 0])) as Record<
    Feature,
    number
  >;
  const state = board.gs.getState();
  const out = (team: string) =>
    (board.gs.getTeam(team)?.players ?? []).filter(
      (p) =>
        p.status === PlayerStatus.KO ||
        p.status === PlayerStatus.INJURED ||
        p.status === PlayerStatus.DEAD
    ).length;
  const theirTeam = board.gs.getTeam(board.them);
  const turns = board.turnsLeft / 6;
  f.half2 = board.half2 ? 1 : 0;
  f.turns = turns;
  f.lead = board.lead;
  f.standingOurs = board.ours.filter(standing).length;
  f.standingTheirs = board.theirs.filter(standing).length;
  f.outOurs = out(board.us);
  f.outTheirs = out(board.them);
  f.rerollsOurs = board.rerolls;
  f.rerollsTheirs = theirTeam ? teamRerollsLeft(state, theirTeam) : 0;

  const carrier = carrierOf(board);
  // A carrier in the end zone it attacks has scored. A decision such as a
  // Bribe can pause the drive's end there, but the ball is out of play, as
  // it is once the next drive is set up.
  const scored =
    !!carrier && toGoal(board, carrier.gridPosition!, carrier.teamId) === 0;
  if (carrier && !scored) {
    const at = carrier.gridPosition!;
    const inReach = (dist: number) => (dist <= carrier.stats.MA + 2 ? 1 : 0);
    // Whether the carrier can walk it in before the half ends: a far carrier
    // with time is worth more than one the clock will stop.
    const inTime = (dist: number) =>
      Math.ceil(dist / (carrier.stats.MA + 2)) <= board.turnsLeft + 1 ? 1 : 0;
    if (carrier.teamId === board.us) {
      const dist = toGoal(board, at);
      f.ours = 1;
      f.oursTurns = turns;
      f.oursToGoal = dist / 19;
      f.oursMarks = board.marks[key(at)];
      f.oursCorners = board.ours.filter(
        (p) =>
          standing(p) &&
          Math.abs(p.gridPosition!.x - at.x) === 1 &&
          Math.abs(p.gridPosition!.y - at.y) === 1
      ).length;
      f.oursInReach = inReach(dist);
      f.oursInTime = inTime(dist);
    } else {
      const dist = toGoal(board, at, board.them);
      f.theirs = 1;
      f.theirsTurns = turns;
      f.theirsToGoal = dist / 19;
      f.theirsMarkers = board.ours.filter(
        (p) => standing(p) && distance(p.gridPosition!, at) === 1
      ).length;
      f.theirsInReach = inReach(dist);
      f.theirsInTime = inTime(dist);
    }
  } else if (board.ball.kind === "loose") {
    const at = board.ball.at;
    const nearest = (players: Board["ours"]) =>
      Math.min(
        10,
        ...players.filter(standing).map((p) => distance(p.gridPosition!, at))
      );
    f.loose = 1;
    f.looseNearer = (nearest(board.theirs) - nearest(board.ours)) / 10;
    // A player beside the ball can pick it up without a long run
    f.looseOursBeside = nearest(board.ours) <= 1 ? 1 : 0;
    f.looseTheirsBeside = nearest(board.theirs) <= 1 ? 1 : 0;
  }
  return f;
}

/** The score so far plus the touchdowns this side is expected to add. */
export function evaluate(
  board: Board,
  w: EvaluationWeights = EVALUATION_WEIGHTS
): number {
  const f = features(board);
  return FEATURES.reduce(
    (value, n) => value + w[n] * f[n],
    board.lead + w.bias
  );
}
