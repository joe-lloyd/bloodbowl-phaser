import {
  type Board,
  type FieldPlayer as Player,
  carrierOf,
  distance,
  key,
  neighbours,
  standing,
} from "./board";
import {
  BLOCK_REPLACEMENTS,
  BLOCK_REPLACEMENT_DEFINITIONS,
  type BlockReplacement,
} from "../../types/BlockReplacement";
import { hasSkill } from "../../types/Skills";
import type { ActionType } from "../../types/events";
import type { HeadlessCommand } from "../../headless/protocol";
import type { Context } from "./activationContext";
import type { Activation, Intent } from "./activations";
import { blitzReach, targetValue } from "./blockActivations";
import { type Chance, armourHit, d6 } from "./chance";
import type { Route } from "./routes";

interface Odds {
  down: Chance;
  casualty: Chance;
  selfDown: Chance;
}

interface Worth {
  gain: number;
  selfDown: Chance;
}

type Pricing = (c: Context, attacker: Player, target: Player) => Worth;

function hit(c: Context, pair: [Player, Player], odds: Odds): Worth {
  const [attacker, target] = pair;
  const down = targetValue({ ...c, casualty: 0 }, attacker, target);
  return {
    gain: odds.down * down + odds.casualty * c.casualty,
    selfDown: odds.selfDown,
  };
}

const ROLLS_ONE = 1 - d6(2);
const AIMED = 1 - ROLLS_ONE;

const PRICES: Record<BlockReplacement, Pricing> = {
  vomit: (c, attacker, target) => {
    const struck = armourHit(target, 0);
    return hit(c, [attacker, target], {
      down: AIMED * struck.breaks,
      casualty: AIMED * struck.casualty,
      selfDown: ROLLS_ONE * armourHit(attacker, 0).breaks,
    });
  },
  stab: (c, attacker, target) => {
    const struck = armourHit(target, 0);
    return hit(c, [attacker, target], {
      down: struck.breaks,
      casualty: struck.casualty,
      selfDown: 0,
    });
  },
  chainsaw: (c, attacker, target) => {
    const struck = armourHit(target, 3);
    return hit(c, [attacker, target], {
      down: AIMED * struck.breaks,
      casualty: AIMED * struck.casualty,
      selfDown: ROLLS_ONE,
    });
  },
  breatheFire: (c, attacker, target) => {
    const engulfed = d6(6);
    const prone = d6(target.stats.ST >= 5 ? 5 : 4) - engulfed;
    return hit(c, [attacker, target], {
      down: prone + engulfed,
      casualty: engulfed * armourHit(target, 0).casualty,
      selfDown: ROLLS_ONE,
    });
  },
  chomp: (c, _attacker, target) => ({
    gain: carrierOf(c.board)?.id === target.id ? d6(3) * c.w.carrierMarked : 0,
    selfDown: 0,
  }),
};

const holds = (player: Player, replacement: BlockReplacement) =>
  hasSkill(player.skills, BLOCK_REPLACEMENT_DEFINITIONS[replacement].skill);

const adjacentTargets = (c: Context, player: Player) =>
  c.board.theirs.filter(
    (target) =>
      standing(target) &&
      distance(target.gridPosition, player.gridPosition) === 1
  );

function directActivations(
  c: Context,
  player: Player,
  replacement: BlockReplacement
): Activation[] {
  if (!standing(player) || !holds(player, replacement)) return [];
  const cost = c.turnover + c.w.ownDown;
  return adjacentTargets(c, player).flatMap((target): Activation[] => {
    const worth = PRICES[replacement](c, player, target);
    const value = worth.gain - worth.selfDown * cost;
    if (value <= 0) return [];
    return [
      {
        player,
        action: replacement,
        intent: { kind: "replacement", replacement, target, route: null },
        tier: 1 - worth.selfDown >= c.w.sureBlock ? "sure-block" : "risky",
        value,
        rolls: [],
      },
    ];
  });
}

interface BlitzArgs {
  c: Context;
  player: Player;
  target: Player;
  replacement: BlockReplacement;
}

function blitzFrom(
  { c, player, target, replacement }: BlitzArgs,
  route: Route | null
): Activation {
  const from = route?.to ?? player.gridPosition;
  const worth = PRICES[replacement](
    c,
    { ...player, gridPosition: from },
    target
  );
  const reach = blitzReach({ board: c.board, player, route });
  const keeps = reach * (1 - worth.selfDown);
  return {
    player,
    action: "blitz",
    intent: { kind: "replacement", replacement, target, route },
    tier: keeps >= c.w.sureBlock ? "blitz" : "risky",
    value: reach * worth.gain - (1 - keeps) * (c.turnover + c.w.ownDown),
    rolls: route?.rolls ?? [],
  };
}

function blitzSquares(args: BlitzArgs, declared: boolean): (Route | null)[] {
  const { c, player, target } = args;
  const routes = c.routes(player);
  const here =
    declared && distance(player.gridPosition, target.gridPosition) === 1;
  const moved = neighbours(target.gridPosition).flatMap((at) => {
    const route = routes.get(key(at));
    return route && route.path.length > 0 ? [route] : [];
  });
  return here ? [null, ...moved] : moved;
}

function bestBlitzOn(args: BlitzArgs, declared: boolean): Activation[] {
  let best: Activation | null = null;
  for (const route of blitzSquares(args, declared)) {
    const plan = blitzFrom(args, route);
    if (!best || plan.value > best.value) best = plan;
  }
  return best && best.value > 0 ? [best] : [];
}

export function replacementBlitzes(
  c: Context,
  player: Player,
  only?: BlockReplacement
): Activation[] {
  if (!c.skillPlans) return [];
  const held = BLOCK_REPLACEMENTS.filter(
    (replacement) =>
      (only === undefined || only === replacement) && holds(player, replacement)
  );
  if (held.length === 0) return [];
  return c.board.theirs
    .filter((target) => standing(target))
    .flatMap((target) =>
      held.flatMap((replacement) =>
        bestBlitzOn({ c, player, target, replacement }, only !== undefined)
      )
    );
}

export function pendingReplacement(
  board: Board,
  player: Player
): BlockReplacement | undefined {
  const active = board.gs.getState().activePlayer;
  if (active?.id !== player.id || active.blockReplacementUsed) return undefined;
  return active.blockReplacement;
}

export const REPLACEMENT_PLANS: Partial<
  Record<ActionType, (c: Context, player: Player) => Activation[]>
> = Object.fromEntries(
  BLOCK_REPLACEMENTS.map((replacement) => [
    replacement,
    (c: Context, player: Player) => directActivations(c, player, replacement),
  ])
);

type ReplacementIntent = Extract<Intent, { kind: "replacement" }>;

export function declaredReplacement(
  plan: Pick<Activation, "action" | "intent">
): BlockReplacement | undefined {
  return plan.action === "blitz" && plan.intent.kind === "replacement"
    ? plan.intent.replacement
    : undefined;
}

export function replacementNote(plan: Activation): string {
  if (plan.intent.kind !== "replacement") return "";
  const label = BLOCK_REPLACEMENT_DEFINITIONS[plan.intent.replacement].label;
  return plan.action === "blitz" ? `blitzes with ${label}` : `uses ${label}`;
}

export function isReplacementStep(
  command: HeadlessCommand,
  id: string,
  intent: ReplacementIntent
): boolean {
  if (command.type !== "stab" && command.type !== "special-action")
    return false;
  const kind = command.type === "stab" ? "stab" : command.action;
  return (
    kind === intent.replacement &&
    command.attackerId === id &&
    command.defenderId === intent.target.id
  );
}
