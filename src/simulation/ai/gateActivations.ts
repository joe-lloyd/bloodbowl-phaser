import {
  type FieldPlayer as Player,
  carrierOf,
  key,
  neighbours,
  standing,
} from "./board";
import { type Context, gamble } from "./activationContext";
import type { Activation } from "./activations";
import { activationGates } from "../../game/skills";
import { SkillType, hasSkill } from "../../types/Skills";
import type { Player as RosterPlayer } from "../../types/Player";
import { d6 } from "./chance";

function leavesSquare(a: Pick<Activation, "intent">): boolean {
  return "route" in a.intent && (a.intent.route?.path.length ?? 0) > 0;
}

function gateChance(
  a: Pick<Activation, "player" | "action" | "intent">,
  teammates: RosterPlayer[]
): number {
  const moves = leavesSquare(a);
  return activationGates(a.player, a.action, teammates)
    .filter(
      (g) =>
        g.onFail.kind !== "bloodlust" && (g.onFail.kind !== "rooted" || moves)
    )
    .reduce((p, g) => p * d6(g.target - g.modifier), 1);
}

const steadied = (p: Player) => hasSkill(p.skills, SkillType.REALLY_STUPID);

interface Steady {
  helper: Player;
  at: Player["gridPosition"];
}

function canSteady(c: Context, helper: Player, big: Player): boolean {
  return (
    helper.id !== big.id &&
    helper.id !== carrierOf(c.board)?.id &&
    !steadied(helper) &&
    standing(helper) &&
    !!c.available.get(helper.id)?.has("move")
  );
}

function steadyMoves(c: Context, big: Player): Steady[] {
  const out: Steady[] = [];
  for (const helper of c.board.ours.filter((h) => canSteady(c, h, big)))
    for (const at of neighbours(big.gridPosition)) {
      const route = c.plainRoutes(helper).get(key(at));
      if (route && route.chance >= c.w.safeMove) out.push({ helper, at });
    }
  return out;
}

interface SteadyPlan {
  c: Context;
  big: Player;
  best: Activation;
  teammates: RosterPlayer[];
}

function steadyPlans({ c, big, best, teammates }: SteadyPlan): Activation[] {
  const alone = gateChance(best, teammates);
  const out: Activation[] = [];
  for (const move of steadyMoves(c, big)) {
    const helped = gateChance(best, [
      ...teammates.filter((t) => t.id !== move.helper.id),
      { ...move.helper, gridPosition: move.at },
    ]);
    const route = c.plainRoutes(move.helper).get(key(move.at));
    if (!route || helped <= alone) continue;
    const step: Activation = {
      player: move.helper,
      action: "move",
      intent: { kind: "reposition", role: "steady", route },
      tier: "prepare",
      value: gamble(c, route.chance, (helped - alone) * best.value),
      rolls: route.rolls,
    };
    const own = gateChance(step, c.board.gs.getTeammates(move.helper.id));
    out.push({ ...step, value: step.value * own });
  }
  return out;
}

function bestPlan(plans: Activation[], player: Player): Activation | null {
  return plans
    .filter((a) => a.player.id === player.id && a.value > 0)
    .reduce<Activation | null>(
      (top, a) => (!top || a.value > top.value ? a : top),
      null
    );
}

function steadySupport(c: Context, plans: Activation[]) {
  const gs = c.board.gs;
  const support: Activation[] = [];
  const wait = new Map<string, number>();
  for (const big of c.board.ours.filter(steadied)) {
    const best = bestPlan(plans, big);
    if (!best) continue;
    const teammates = gs.getTeammates(big.id);
    const moves = steadyPlans({ c, big, best, teammates }).filter(
      (m) => m.value > 0
    );
    if (moves.length === 0) continue;
    const alone = gateChance(best, teammates);
    const gain = Math.max(...moves.map((m) => m.value)) / best.value;
    wait.set(big.id, Math.max(0, alone - gain) / alone);
    support.push(...moves);
  }
  return { support, wait };
}

export function gatePriced(c: Context, plans: Activation[]): Activation[] {
  const gs = c.board.gs;
  const { support, wait } = steadySupport(c, plans);
  const price = (a: Activation): Activation => {
    const p = gateChance(a, gs.getTeammates(a.player.id));
    if (p >= 1 || a.value <= 0) return a;
    return { ...a, value: a.value * p * (wait.get(a.player.id) ?? 1) };
  };
  return [...plans.map(price), ...support];
}
