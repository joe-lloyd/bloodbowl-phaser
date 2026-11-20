import {
  type Board,
  type FieldPlayer as Player,
  canCarry,
  key,
  standing,
} from "./board";
import { type Context, context, gamble, tierFor } from "./activationContext";
import { nextTurnReach } from "./latePlans";
import type { Activation } from "./activations";
import type { Route } from "./routes";
import { CARRY_TURNS, handoffActivations, paceWorth } from "./ballActivations";
import { SkillType, hasSkill } from "../../types/Skills";

function couldPickUp(c: Context, player: Player): boolean {
  const ball = c.board.ball;
  return (
    ball.kind === "loose" &&
    standing(player) &&
    canCarry(player) &&
    c.available.has(player.id) &&
    c.routes(player).has(key(ball.at))
  );
}

export function pickupPace(c: Context, player: Player): number {
  const quickest = Math.max(
    nextTurnReach(player),
    ...c.board.ours.filter((p) => couldPickUp(c, p)).map(nextTurnReach)
  );
  return paceWorth(
    c,
    nextTurnReach(player) - quickest,
    hasSkill(player.skills, SkillType.MY_BALL) ? CARRY_TURNS : 1
  );
}

export function pickupActivation(c: Context, player: Player): Activation[] {
  const { board, w } = c;
  if (board.ball.kind !== "loose" || !canCarry(player)) return [];
  const route = c.routes(player).get(key(board.ball.at));
  if (!route) return [];
  return [
    {
      player,
      action: "move",
      intent: { kind: "pickup", route },
      tier: tierFor(route.chance, w.pickupMin, "pickup"),
      value: gamble(c, route.chance, w.pickup + pickupPace(c, player)),
      rolls: route.rolls,
    },
  ];
}

function holdingAt(board: Board, player: Player, route: Route) {
  const at = route.to;
  const carrier: Player = {
    ...player,
    gridPosition: at,
    stats: { ...player.stats, MA: player.stats.MA - route.path.length },
  };
  const replace = (p: Player) => (p.id === player.id ? carrier : p);
  const occupant = [...board.occupant];
  occupant[key(player.gridPosition)] = undefined;
  occupant[key(at)] = carrier;
  const held: Board = {
    ...board,
    ours: board.ours.map(replace),
    everyone: board.everyone.map(replace),
    occupant,
    ball: { kind: "carried", at, carrier },
  };
  return { board: held, carrier };
}

export function fetchActivations(c: Context, player: Player): Activation[] {
  if (!c.available.get(player.id)?.has("handoff")) return [];
  const [pickup] = pickupActivation(c, player);
  if (pickup?.intent.kind !== "pickup") return [];
  const route = pickup.intent.route;
  if (route.path.length > player.stats.MA) return [];
  const held = holdingAt(c.board, player, route);
  const after = context({
    board: held.board,
    w: c.w,
    available: c.available,
    skillPlans: c.skillPlans,
  });
  const handoff = Math.max(
    0,
    ...handoffActivations(after, held.carrier).map((plan) => plan.value)
  );
  if (handoff <= 0) return [];
  return [
    {
      ...pickup,
      action: "handoff",
      value: gamble(c, route.chance, c.w.pickup + handoff),
    },
  ];
}
