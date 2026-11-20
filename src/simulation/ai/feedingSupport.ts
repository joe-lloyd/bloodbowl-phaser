import { type FieldPlayer as Player } from "./board";
import { type Context, gamble } from "./activationContext";

import { SkillType, hasSkill } from "../../types/Skills";
import { type Activation } from "./activations";
import { carrierActivations } from "./ballActivations";
import {
  type Square,
  carrierOf,
  distance,
  key,
  neighbours,
  standing,
} from "./board";
import { hasBiteSupport, isThrall, unfedChance } from "./feeding";
import type { Route } from "./routes";

function supportForRoute(
  c: Context,
  carrier: Player,
  route: Route
): Activation[] {
  const failure = unfedChance({
    c: c,
    player: carrier,
    action: "move",
    at: route.to,
  });
  if (failure === 0) return [];
  const out: Activation[] = [];
  const thralls = c.board.ours.filter(
    (p) =>
      isThrall(p) &&
      standing(p) &&
      p.id !== carrier.id &&
      c.available.get(p.id)?.has("move")
  );
  for (const thrall of thralls)
    for (const at of neighbours(route.to)) {
      if (route.path.some((s) => key(s) === key(at))) continue;
      const support = c.plainRoutes(thrall).get(key(at));
      if (!support || support.chance < c.w.safeMove) continue;
      out.push({
        player: thrall,
        action: "move",
        intent: { kind: "reposition", role: "feed", route: support },
        tier: "prepare",
        value: gamble(c, support.chance, failure * (c.turnover + c.w.ballLoss)),
        rolls: support.rolls,
      });
    }
  return out;
}

export function feedingSupportActivations(c: Context): Activation[] {
  const carrier = carrierOf(c.board);
  if (
    !c.skillPlans ||
    carrier?.teamId !== c.board.us ||
    !hasSkill(carrier.skills, SkillType.BLOODLUST) ||
    !c.available.get(carrier.id)?.has("move")
  )
    return [];
  const plans = carrierActivations({ ...c, skillPlans: false }, carrier);
  const out: Activation[] = [];
  for (const plan of plans.filter((plan) => plan.value > 0)) {
    if (plan.intent.kind === "carrier" || plan.intent.kind === "score")
      out.push(...supportForRoute(c, carrier, plan.intent.route));
  }
  return out;
}

export function holdsFeedingSupport(c: Context, player: Player): boolean {
  const carrier = carrierOf(c.board);
  if (
    !c.skillPlans ||
    !isThrall(player) ||
    carrier?.teamId !== c.board.us ||
    !hasSkill(carrier.skills, SkillType.BLOODLUST) ||
    !c.available.get(carrier.id)?.has("move") ||
    c.board.gs.getMovementUsed(player.id) === 0
  )
    return false;
  return carrierActivations({ ...c, skillPlans: false }, carrier).some(
    (plan) =>
      plan.value > 0 &&
      (plan.intent.kind === "score" || plan.intent.kind === "carrier") &&
      distance(player.gridPosition, plan.intent.route.to) === 1
  );
}

function hungry(c: Context, player: Player): boolean {
  const active = c.board.gs.getState().activePlayer;
  return (
    c.skillPlans &&
    active?.id === player.id &&
    !!active.bloodlustUnsated &&
    carrierOf(c.board)?.id !== player.id &&
    !hasBiteSupport(c.board, player, player.gridPosition)
  );
}

function feedSquares(c: Context): Square[] {
  const carrier = carrierOf(c.board)?.id;
  return c.board.ours
    .filter((p) => isThrall(p) && p.id !== carrier)
    .flatMap((thrall) => neighbours(thrall.gridPosition));
}

export function feedActivations(c: Context, player: Player): Activation[] {
  if (!hungry(c, player)) return [];
  const routes = c.routes(player);
  return feedSquares(c).flatMap((at) => {
    const route = routes.get(key(at));
    return route
      ? [
          {
            player: player,
            action: "move" as const,
            intent: {
              kind: "reposition" as const,
              role: "feed" as const,
              route,
            },
            tier: "support" as const,
            value: gamble(c, route.chance, c.turnover),
            rolls: route.rolls,
          },
        ]
      : [];
  });
}
