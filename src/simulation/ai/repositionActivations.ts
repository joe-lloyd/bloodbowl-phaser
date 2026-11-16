/**
 * Activations for players away from the ball: take up a role around it,
 * step towards the action, or stand up.
 */

import { Player, PlayerStatus } from "../../types/Player";
import {
  Board,
  Square,
  carrierOf,
  distance,
  key,
  neighbours,
  onPitch,
  standing,
} from "./board";
import { Route } from "./routes";
import { Context, gamble, tierFor } from "./activationContext";
import { CORNERS } from "./ballActivations";
import type { Activation, Role } from "./activations";
import { moveFeedingCost } from "./feeding";

export interface RoleSquare {
  role: Role;
  at: Square;
  value: number;
}

type AddSquare = (role: Role, at: Square, value: number) => void;

/** Our carrier: a cage around it and receivers ahead of it. */
function ownCarrierSquares(c: Context, at: Square, add: AddSquare): void {
  const { board, w } = c;
  for (const [dx, dy] of CORNERS)
    add("cage", { x: at.x + dx, y: at.y + dy }, w.cageCorner);
  for (const ahead of [2, 3, 4])
    for (const dy of [-2, 0, 2])
      add(
        "receiver",
        { x: at.x + board.dir * ahead, y: at.y + dy },
        w.receiver
      );
}

/** Beside the walls of their carrier's cage: assists for the hits that break it. */
function cageWallSquares(
  board: Board,
  at: Square,
  press: number,
  add: AddSquare
): void {
  for (const wall of board.theirs) {
    if (!standing(wall) || distance(wall.gridPosition!, at) !== 1) continue;
    for (const s of neighbours(wall.gridPosition!))
      if (distance(s, at) > 1) add("mark", s, press / 2);
  }
}

/** Their carrier: marks on it and its cage, and a screen in front of our end zone. */
function theirCarrierSquares(c: Context, at: Square, add: AddSquare): void {
  const { board, w } = c;
  // A marker or two presses the carrier; a crowd only hands out free hits.
  const markers = board.ours.filter(
    (p) => standing(p) && distance(p.gridPosition!, at) === 1
  ).length;
  const press = w.markCarrier / (1 + markers);
  // A square nobody else marks assists a hit; re-planning each step must
  // keep a helper heading there.
  for (const s of neighbours(at))
    add("mark", s, press + (board.marks[key(s)] === 1 ? w.assist : 0));
  cageWallSquares(board, at, press, add);
  // A screen between the carrier and our end zone, two squares apart.
  for (const depth of [2, 4])
    for (const dy of [-4, -2, 0, 2, 4])
      add(
        "screen",
        { x: at.x - board.dir * depth, y: at.y + dy },
        w.screen - depth * 0.5
      );
}

/** Squares worth standing on for a player without the ball, by role. */
export function roleSquares(c: Context): RoleSquare[] {
  const { board, w } = c;
  const out: RoleSquare[] = [];
  const add: AddSquare = (role, at, value) => {
    if (onPitch(at)) out.push({ role, at, value });
  };
  const ball = board.ball;
  if (ball.kind === "carried" && ball.carrier.teamId === board.us) {
    ownCarrierSquares(c, ball.at, add);
  } else if (ball.kind === "carried") {
    theirCarrierSquares(c, ball.at, add);
  } else if (ball.kind === "loose") {
    for (const s of neighbours(ball.at)) add("chase", s, w.chase);
  }
  return out;
}

type Reposition = { route: Route; gain: number; role: Role };

/** The role square the player gains most by reaching safely. */
function roleRoute(
  c: Context,
  player: Player,
  squares: RoleSquare[],
  routes: Map<number, Route>
): Reposition | null {
  const { board, w } = c;
  const worth = (at: Square) => {
    const base = Math.max(
      0,
      ...squares
        .filter((s) => s.at.x === at.x && s.at.y === at.y)
        .map((s) => s.value)
    );
    const marked = board.marks[key(at)];
    const role = squares.find((s) => s.at.x === at.x && s.at.y === at.y)?.role;
    return base - (role === "mark" ? 0 : marked * w.endInContact);
  };
  const here =
    player.status === PlayerStatus.PRONE
      ? -w.standUp
      : worth(player.gridPosition!);
  let best: Reposition | null = null;
  for (const s of squares) {
    const route = routes.get(key(s.at));
    if (!route || route.chance < w.safeMove) continue;
    const gain =
      gamble(c, route.chance, worth(s.at) - here) -
      moveFeedingCost(c, player, s.at);
    if (gain > (best?.gain ?? 0.5)) best = { route, gain, role: s.role };
  }
  return best;
}

/** Nothing useful to reach: step towards the action. */
function chaseRoute(
  c: Context,
  player: Player,
  routes: Map<number, Route>
): Reposition | null {
  const { board, w } = c;
  if (board.ball.kind === "none" || !standing(player)) return null;
  const target = board.ball.at;
  const now = distance(player.gridPosition!, target);
  let best: Reposition | null = null;
  for (const route of routes.values()) {
    if (route.chance < w.safeMove || board.marks[key(route.to)] > 0) continue;
    const gain =
      (now - distance(route.to, target)) * 0.5 -
      moveFeedingCost(c, player, route.to);
    if (now > 3 && gain > (best?.gain ?? 0.5))
      best = { route, gain, role: "chase" };
  }
  return best;
}

function standUpActivation(c: Context, player: Player): Activation[] {
  return player.status === PlayerStatus.PRONE &&
    c.available.get(player.id)?.has("standUp")
    ? [
        {
          player,
          action: "standUp",
          intent: { kind: "stand-up" },
          tier: "support",
          value: c.w.standUp,
          rolls: [],
        },
      ]
    : [];
}

export function repositionActivation(
  c: Context,
  player: Player,
  squares: RoleSquare[]
): Activation[] {
  const { board, w } = c;
  const routes = c.plainRoutes(player);
  const isCarrier = carrierOf(board)?.id === player.id;
  if (isCarrier) return [];
  const best =
    roleRoute(c, player, squares, routes) ?? chaseRoute(c, player, routes);
  if (!best) return standUpActivation(c, player);
  return [
    {
      player,
      action: "move",
      intent: { kind: "reposition", role: best.role, route: best.route },
      tier: tierFor(best.route.chance, w.safeMove, "support"),
      value: best.gain,
      rolls: best.route.rolls,
    },
  ];
}
