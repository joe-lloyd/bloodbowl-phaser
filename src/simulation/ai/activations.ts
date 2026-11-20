import { type FieldPlayer as Player } from "./board";

import { type ActionType } from "../../types/events";
import { type Board, type Square, carrierOf, standing } from "./board";
import { type RollTarget } from "./chance";
import { type Route } from "./routes";
import { type Weights } from "./weights";
import { type Context, context, scoreChanceOf } from "./activationContext";
import {
  carrierActivations,
  deepReceiverActivations,
  handoffActivations,
  passActivations,
} from "./ballActivations";
import {
  assistActivations,
  blitzActivations,
  carrierBlitzActivations,
  blockActivations,
} from "./blockActivations";
import { repositionActivation, roleSquares } from "./repositionActivations";
import { SKILL_PLANS } from "./skillActivations";
import { foulActivations } from "./foulActivations";
import { gatePriced } from "./gateActivations";
import { pickupActivation } from "./pickupActivations";
import {
  feedingSupportActivations,
  holdsFeedingSupport,
} from "./feedingSupport";

const TIERS = [
  "prepare",
  "score",
  "handoff",
  "carrier",
  "sure-block",
  "pickup",
  "assist",
  "blitz",
  "support",
  "risky",
] as const;
export type Tier = (typeof TIERS)[number];

export type Role =
  | "cage"
  | "receiver"
  | "mark"
  | "screen"
  | "chase"
  | "stall"
  | "safety"
  | "feed"
  | "throw"
  | "flank"
  | "deep"
  | "steady";

export type Intent =
  | { kind: "score"; route: Route }
  | { kind: "carrier"; route: Route }
  | { kind: "pickup"; route: Route }
  | { kind: "secure-ball"; route: Route }
  | { kind: "gaze"; target: Player; route: Route | null }
  | { kind: "multiple-block"; targets: [Player, Player] }
  | { kind: "handoff"; to: Player; route: Route | null }
  | { kind: "pass"; to: Player; route: Route | null }
  | { kind: "throw-teammate"; mate: Player; aim: Square; carrying: boolean }
  | { kind: "block"; target: Player }
  | { kind: "foul"; target: Player; route: Route | null }
  | { kind: "blitz"; target: Player; route: Route | null }
  | { kind: "reposition"; role: Role; route: Route }
  | { kind: "stand-up" };

export interface Activation {
  player: Player;

  action: ActionType;
  intent: Intent;
  tier: Tier;
  value: number;

  rolls: RollTarget[];
}

export type Available = ReadonlyMap<string, ReadonlySet<ActionType>>;

export function planIdentity(plan: Activation): string {
  const prefix = `${plan.player.id}/${plan.action}/${plan.intent.kind}`;
  const intent = plan.intent;
  if ("to" in intent) return `${prefix}/${intent.to.id}`;
  if ("target" in intent) return `${prefix}/${intent.target.id}`;
  if ("mate" in intent)
    return `${prefix}/${intent.mate.id}/${String(intent.aim.x)},${String(intent.aim.y)}`;
  if ("targets" in intent)
    return `${prefix}/${intent.targets
      .map((player) => player.id)
      .sort()
      .join(",")}`;
  if ("route" in intent)
    return `${prefix}/${String(intent.route.to.x)},${String(intent.route.to.y)}`;
  return prefix;
}

function sortActivations(list: Activation[]): Activation[] {
  return list.sort(
    (a, b) =>
      b.value - a.value ||
      TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
      a.player.id.localeCompare(b.player.id)
  );
}

function carrierOptions(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const out: Activation[] = [];
  if (actions.has("move")) out.push(...carrierActivations(c, player));
  if (actions.has("handoff")) out.push(...handoffActivations(c, player));
  if (actions.has("pass")) out.push(...passActivations(c, player));
  if (actions.has("blitz")) out.push(...carrierBlitzActivations(c, player));
  return out;
}

function fieldOptions(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const out: Activation[] = [];
  out.push(...pickupOptions(c, player, actions));
  if (actions.has("block")) out.push(...blockActivations(c, player));
  out.push(...skillOptions(c, player, actions));
  if (actions.has("blitz")) out.push(...blitzActivations(c, player));
  if (actions.has("foul")) out.push(...foulActivations(c, player));
  if (actions.has("move") || actions.has("standUp"))
    out.push(...repositionActivation(c, player, roleSquares(c)));
  return out;
}

function forPlayer(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const out =
    carrierOf(c.board)?.id === player.id
      ? carrierOptions(c, player, actions)
      : fieldOptions(c, player, actions);
  return out.filter((a) => actions.has(a.action) && a.value > 0);
}

interface ActivationsArgs {
  board: Board;
  w: Weights;
  available: Available;
  skillPlans?: boolean;
}

export function activations({
  board,
  w,
  available,
  skillPlans = true,
}: ActivationsArgs): Activation[] {
  const c = context({
    board: board,
    w: w,
    available: available,
    skillPlans: skillPlans,
  });
  const out: Activation[] = [];
  for (const player of board.ours) {
    const actions = available.get(player.id);
    if (actions) out.push(...forPlayer(c, player, actions));
  }
  const carrier = carrierOf(board);
  if (carrier?.teamId === board.us && scoreChanceOf(c, carrier) < w.safeScore)
    out.push(...deepReceiverActivations(c, carrier));
  out.push(...assistActivations(c, out));
  out.push(...feedingSupportActivations(c));
  return standUpFirst(sortActivations(gatePriced(c, out)));
}

const SAFE_ACTIONS = new Set<ActionType>(["move", "standUp"]);

function riskFree(plan: Activation): boolean {
  return SAFE_ACTIONS.has(plan.action) && plan.rolls.length === 0;
}

function standUpFirst(plans: Activation[]): Activation[] {
  const top = plans[0];
  if (!top || riskFree(top)) return plans;
  const best = new Map<string, Activation>();
  for (const plan of plans)
    if (!best.has(plan.player.id)) best.set(plan.player.id, plan);
  const rising = [...best.values()].filter(
    (plan) => !standing(plan.player) && riskFree(plan)
  );
  return rising.length
    ? [...rising, ...plans.filter((p) => !rising.includes(p))]
    : plans;
}

function movementContinuation(c: Context, player: Player): Activation[] {
  if (holdsFeedingSupport(c, player)) return [];
  if (carrierOf(c.board)?.id === player.id)
    return carrierActivations(c, player);
  return [
    ...pickupActivation(c, player),
    ...repositionActivation(c, player, roleSquares(c)),
    ...feedingSupportActivations(c).filter((a) => a.player.id === player.id),
  ];
}

function blitzContinuation(
  c: Context,
  player: Player,
  used: boolean
): Activation[] {
  const carrying = carrierOf(c.board)?.id === player.id;
  if (!used && carrying) return carrierBlitzActivations(c, player);
  if (!used)
    return [...blitzActivations(c, player), ...pickupActivation(c, player)];
  if (carrying) return carrierActivations(c, player);
  return [
    ...pickupActivation(c, player),
    ...repositionActivation(c, player, roleSquares(c)),
  ].filter((a) => a.tier !== "risky");
}

interface ContinuationOptionsArgs {
  c: Context;
  player: Player;
  action: ActionType;
  blitzBlockUsed: boolean;
}

function continuationOptions({
  c,
  player,
  action,
  blitzBlockUsed,
}: ContinuationOptionsArgs): Activation[] {
  const capability = c.skillPlans ? SKILL_PLANS[action] : undefined;
  if (capability) return capability(c, player);
  if (action === "blitz") return blitzContinuation(c, player, blitzBlockUsed);
  return CONTINUATIONS[action]?.(c, player) ?? [];
}

interface ContinuationPlansArgs {
  board: Board;
  w: Weights;
  player: Player;
  action: ActionType;
  blitzBlockUsed: boolean;
  available: Available;
  skillPlans?: boolean;
}

export function continuationPlans({
  board,
  w,
  player,
  action,
  blitzBlockUsed,
  available,
  skillPlans = true,
}: ContinuationPlansArgs): Activation[] {
  const c = context({
    board: board,
    w: w,
    available: new Map([
      ...available,
      [player.id, new Set<ActionType>([action])],
    ]),
    skillPlans: skillPlans,
  });
  const options = continuationOptions({
    c: c,
    player: player,
    action: action,
    blitzBlockUsed: blitzBlockUsed,
  });
  return sortActivations(options.filter((a) => a.value > 0));
}

export function continuation(
  ...args: Parameters<typeof continuationPlans>
): Activation | null {
  return continuationPlans(...args)[0] ?? null;
}

function pickupOptions(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const action = (["move", "blitz", "handoff"] as const).find((candidate) =>
    actions.has(candidate)
  );
  if (!action) return [];
  return pickupActivation(c, player).map((activation) => ({
    ...activation,
    action: action === "move" ? activation.action : action,
  }));
}

function skillOptions(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  if (!c.skillPlans) return [];
  return [...actions].flatMap(
    (action) => SKILL_PLANS[action]?.(c, player) ?? []
  );
}

function transferContinuation(
  c: Context,
  player: Player,
  action: "handoff" | "pass"
): Activation[] {
  if (carrierOf(c.board)?.id !== player.id) return pickupActivation(c, player);
  return action === "handoff"
    ? handoffActivations(c, player)
    : passActivations(c, player);
}

const CONTINUATIONS: Partial<
  Record<ActionType, (c: Context, player: Player) => Activation[]>
> = {
  move: movementContinuation,
  standUp: movementContinuation,
  block: blockActivations,
  handoff: (c, player) => transferContinuation(c, player, "handoff"),
  pass: (c, player) => transferContinuation(c, player, "pass"),
  foul: foulActivations,
};
