import { type FieldPlayer as Player } from "./board";
import { PlayerStatus } from "../../types/Player";
import { type Board, type Square, distance, firstBall, toGoal } from "./board";
import { type Chance } from "./chance";
import { SPP_VALUES, sppValuesFor } from "../../game/progression/MatchStats";
import { type Route, routesFor, withTeamReroll } from "./routes";
import { type Weights } from "./weights";
import type { Available, Tier } from "./activations";
import { canStillScore } from "./latePlans";

export interface Context {
  goal: "attack" | "finish" | "protect";
  skillPlans: boolean;
  board: Board;
  w: Weights;
  available: Available;
  teamReroll: boolean;

  turnover: number;

  urgency: number;

  casualty: number;

  routes: (p: Player) => Map<number, Route>;

  plainRoutes: (p: Player) => Map<number, Route>;
}

interface ContextArgs {
  board: Board;
  w: Weights;
  available: Available;
  skillPlans?: boolean;
}

export function context({
  board,
  w,
  available,
  skillPlans = true,
}: ContextArgs): Context {
  const teamReroll = board.gs.getRerollArbiter().teamRerollAvailable(board.us);

  const plainCache = new Map<string, Map<number, Route>>();
  const rerollCache = new Map<string, Map<number, Route>>();
  const plainRoutes = (p: Player) => {
    let routes = plainCache.get(p.id);
    if (!routes)
      plainCache.set(p.id, (routes = routesFor({ board: board, player: p })));
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
  const ball = firstBall(board);
  const ballAt = ball.kind === "none" ? null : ball.at;
  const pace = ballAt ? toGoal(board, ballAt) / (board.turnsLeft + 1) : 0;

  const speed =
    board.ours.reduce((sum, p) => sum + p.stats.MA, 0) /
    Math.max(1, board.ours.length);
  return {
    goal: phaseGoal(board, available),
    skillPlans,
    board,
    w,
    available,
    teamReroll,
    urgency: (Math.min(3, Math.max(1, pace / 4)) * 6) / Math.max(3, speed),
    casualty:
      w.casualtyHit *
      casualtyWorth(board) *
      (1 + w.attrition * gameLeft(board)),
    turnover:
      w.turnoverBase + w.turnoverPerPlayer * Math.max(0, available.size - 1),
    routes: teamReroll ? rerollRoutes : plainRoutes,
    plainRoutes,
  };
}

function gameLeft(board: Board): number {
  return (board.turnsLeft + (board.half2 ? 0 : 6)) / 11;
}

function casualtyWorth(board: Board): number {
  const team = board.gs.getTeam(board.us);
  const values = team ? sppValuesFor(team.rosterName) : SPP_VALUES;
  return (
    (values.casualty / values.touchdown) *
    (SPP_VALUES.touchdown / SPP_VALUES.casualty)
  );
}

export const gamble = (c: Context, p: number, gain: number) =>
  p * gain - (1 - p) * (c.turnover + c.w.ownDown);

export const tierFor = (p: Chance, threshold: number, safe: Tier): Tier =>
  p >= threshold ? safe : "risky";

export function threats(board: Board, at: Square): number {
  return board.theirs.filter(
    (o) =>
      o.status !== PlayerStatus.STUNNED &&
      distance(o.gridPosition, at) <= o.stats.MA + 3
  ).length;
}

export function crowd(board: Board, at: Square): number {
  return board.theirs.filter(
    (o) => o.status === PlayerStatus.ACTIVE && distance(o.gridPosition, at) <= 3
  ).length;
}

export function scoreChanceOf(c: Context, player: Player): number {
  let best = 0;
  for (const r of c.routes(player).values())
    if (toGoal(c.board, r.to) === 0) best = Math.max(best, r.chance);
  return best;
}

export function bestReach(c: Context, player: Player): number {
  let best = toGoal(c.board, player.gridPosition);
  for (const route of c.plainRoutes(player).values())
    if (route.chance >= c.w.safeMove)
      best = Math.min(best, toGoal(c.board, route.to));
  return best;
}

function phaseGoal(board: Board, available: Available): Context["goal"] {
  if (board.turnsLeft > 1) return "attack";
  return canStillScore(board, available) ? "finish" : "protect";
}
