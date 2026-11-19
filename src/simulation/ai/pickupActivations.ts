import { type FieldPlayer as Player, canCarry, key, standing } from "./board";
import { type Context, gamble, tierFor } from "./activationContext";
import { nextTurnReach } from "./latePlans";
import type { Activation } from "./activations";
import { paceWorth } from "./ballActivations";

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
  return paceWorth(c, nextTurnReach(player) - quickest);
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
