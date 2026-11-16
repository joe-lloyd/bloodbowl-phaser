/**
 * What every kind of activation reads while it is judged: the board, the
 * weights, the routes each player has, and the price of a turnover.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { Board, Square, distance, toGoal } from "./board";
import { Chance } from "./chance";
import { SPP_VALUES, sppValuesFor } from "../../game/progression/MatchStats";
import { Route, routesFor, withTeamReroll } from "./routes";
import { Weights } from "./weights";
import type { Available, Tier } from "./activations";
import { canStillScore } from "./latePlans";

export interface Context {
  goal: "attack" | "finish" | "protect";
  skillPlans: boolean;
  board: Board;
  w: Weights;
  available: Available;
  teamReroll: boolean;
  /** Cost of a turnover now: the activations it would throw away. */
  turnover: number;
  /**
   * How much each square of progress counts: 1 for a team of MA 6, rising
   * to 3 times that when the ball must move faster than four squares a turn
   * to score this half.
   */
  urgency: number;
  /** Points for a casualty we cause, weighed by what our SPP pays for one. */
  casualty: number;
  /** Paths for a play worth a team re-roll: scoring, the ball, a blitz. */
  routes: (p: Player) => Map<number, Route>;
  /**
   * Paths for positioning, judged without the team re-roll: a re-roll spent
   * on a cage corner is not there for the pick-up.
   */
  plainRoutes: (p: Player) => Map<number, Route>;
}

export function context(
  board: Board,
  w: Weights,
  available: Available,
  skillPlans = true
): Context {
  const teamReroll = board.gs.getRerollArbiter().teamRerollAvailable(board.us);
  // A player's paths do not depend on the re-roll, only their chances do.
  const plainCache = new Map<string, Map<number, Route>>();
  const rerollCache = new Map<string, Map<number, Route>>();
  const plainRoutes = (p: Player) => {
    let routes = plainCache.get(p.id);
    if (!routes) plainCache.set(p.id, (routes = routesFor(board, p)));
    return routes;
  };
  const rerollRoutes = (p: Player) => {
    let routes = rerollCache.get(p.id);
    if (!routes)
      rerollCache.set(
        p.id,
        (routes = withTeamReroll(plainRoutes(p), p, (skill) =>
          board.gs.getRerollArbiter().skillRerollAvailable(p, skill)
        ))
      );
    return routes;
  };
  const ballAt = board.ball.kind === "none" ? null : board.ball.at;
  const pace = ballAt ? toGoal(board, ballAt) / (board.turnsLeft + 1) : 0;
  // A square is a share of a turn's move, so a slow team prizes each one
  // more than a fast team does.
  const speed =
    board.ours.reduce((sum, p) => sum + p.stats.MA, 0) /
    Math.max(1, board.ours.length);
  return {
    goal:
      board.turnsLeft > 1
        ? "attack"
        : canStillScore(board, available)
          ? "finish"
          : "protect",
    skillPlans,
    board,
    w,
    available,
    teamReroll,
    urgency: (Math.min(3, Math.max(1, pace / 4)) * 6) / Math.max(3, speed),
    casualty: w.casualtyHit * casualtyWorth(board),
    turnover:
      w.turnoverBase + w.turnoverPerPlayer * Math.max(0, available.size - 1),
    routes: teamReroll ? rerollRoutes : plainRoutes,
    plainRoutes,
  };
}

/**
 * A casualty against a touchdown, in SPP, next to the usual 2 against 3: a
 * Brawlin' Brutes team, paid 3 against 2, prizes casualties 2.25 times as
 * much.
 */
function casualtyWorth(board: Board): number {
  const team = board.gs.getTeam(board.us);
  const values = team ? sppValuesFor(team.rosterName) : SPP_VALUES;
  return (
    (values.casualty / values.touchdown) *
    (SPP_VALUES.touchdown / SPP_VALUES.casualty)
  );
}

/**
 * Value of a gamble: win `gain` with chance `p`; else the turn is over and
 * our player is on the ground.
 */
export const gamble = (c: Context, p: number, gain: number) =>
  p * gain - (1 - p) * (c.turnover + c.w.ownDown);

export const tierFor = (p: Chance, threshold: number, safe: Tier): Tier =>
  p >= threshold ? safe : "risky";

/** Opponents who could reach a square next turn and hit whoever is there. */
export function threats(board: Board, at: Square): number {
  return board.theirs.filter(
    (o) =>
      o.status !== PlayerStatus.STUNNED &&
      distance(o.gridPosition!, at) <= o.stats.MA + 3
  ).length;
}

/** The best chance a player has of running in a touchdown from here. */
export function scoreChanceOf(c: Context, player: Player): number {
  let best = 0;
  for (const r of c.routes(player).values())
    if (toGoal(c.board, r.to) === 0) best = Math.max(best, r.chance);
  return best;
}

/** The furthest forward a player can safely get from where it stands. */
export function bestReach(c: Context, player: Player): number {
  let best = toGoal(c.board, player.gridPosition!);
  for (const route of c.plainRoutes(player).values())
    if (route.chance >= c.w.safeMove)
      best = Math.min(best, toGoal(c.board, route.to));
  return best;
}
