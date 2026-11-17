/**
 * Whole activations: which player does what, where to, and how much it is
 * worth, in the risk order Bot Bowl's scripted winners play a turn in.
 *
 * Proposals are rebuilt from the current board. The coach retains the chosen
 * target through declaration and movement while this module values alternatives.
 */

import { Player } from "../../types/Player";
import { ActionType } from "../../types/events";
import { Board, Square, carrierOf } from "./board";
import { RollTarget } from "./chance";
import { Route } from "./routes";
import { Weights } from "./weights";
import { Context, context, scoreChanceOf } from "./activationContext";
import {
  carrierActivations,
  deepReceiverActivations,
  handoffActivations,
  passActivations,
  pickupActivation,
} from "./ballActivations";
import {
  assistActivations,
  blitzActivations,
  blockActivations,
} from "./blockActivations";
import { repositionActivation, roleSquares } from "./repositionActivations";
import { SKILL_PLANS } from "./skillActivations";
import {
  feedingSupportActivations,
  holdsFeedingSupport,
} from "./feedingSupport";

/** Botbowl's turn order: the earlier a tier, the safer its actions. */
export const TIERS = [
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
  | "feed";

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
  | { kind: "blitz"; target: Player; route: Route | null }
  | { kind: "reposition"; role: Role; route: Route }
  | { kind: "stand-up" };

export interface Activation {
  player: Player;
  /** The action to declare for it. */
  action: ActionType;
  intent: Intent;
  tier: Tier;
  value: number;
  /** The rolls it needs, for the recording's note. */
  rolls: RollTarget[];
}

/** What the engine lets each of our players declare right now. */
export type Available = ReadonlyMap<string, ReadonlySet<ActionType>>;

/** Distinguish targets that begin with the same player and declaration. */
export function planIdentity(plan: Activation): string {
  const prefix = `${plan.player.id}/${plan.action}/${plan.intent.kind}`;
  const intent = plan.intent;
  switch (intent.kind) {
    case "score":
    case "carrier":
    case "pickup":
    case "secure-ball":
    case "reposition":
      return `${prefix}/${intent.route.to.x},${intent.route.to.y}`;
    case "pass":
    case "handoff":
      return `${prefix}/${intent.to.id}`;
    case "throw-teammate":
      return `${prefix}/${intent.mate.id}/${intent.aim.x},${intent.aim.y}`;
    case "block":
    case "blitz":
    case "gaze":
      return `${prefix}/${intent.target.id}`;
    case "multiple-block":
      return `${prefix}/${intent.targets
        .map((player) => player.id)
        .sort()
        .join(",")}`;
    case "stand-up":
      return prefix;
  }
}

function sortActivations(list: Activation[]): Activation[] {
  return list.sort(
    (a, b) =>
      b.value - a.value ||
      TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
      a.player.id.localeCompare(b.player.id)
  );
}

/** What the ball carrier could do: run, hand off or pass. */
function carrierOptions(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const out: Activation[] = [];
  if (actions.has("move")) out.push(...carrierActivations(c, player));
  if (actions.has("handoff")) out.push(...handoffActivations(c, player));
  if (actions.has("pass")) out.push(...passActivations(c, player));
  return out;
}

/** What a player without the ball could do: pick it up, hit, or move. */
function fieldOptions(
  c: Context,
  player: Player,
  actions: ReadonlySet<ActionType>
): Activation[] {
  const out: Activation[] = [];
  if (actions.has("move") || actions.has("blitz") || actions.has("handoff"))
    out.push(
      ...pickupActivation(c, player).map((a) => ({
        ...a,
        action: actions.has("move")
          ? a.action
          : actions.has("blitz")
            ? "blitz"
            : "handoff",
      }))
    );
  if (actions.has("block")) out.push(...blockActivations(c, player));
  if (c.skillPlans) {
    for (const action of actions) {
      const propose = SKILL_PLANS[action];
      if (propose) out.push(...propose(c, player));
    }
  }
  if (actions.has("blitz")) out.push(...blitzActivations(c, player));
  if (actions.has("move") || actions.has("standUp"))
    out.push(...repositionActivation(c, player, roleSquares(c)));
  return out;
}

/** Everything one player could usefully do, given what it may declare. */
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

/** Every useful activation for players who have not acted, best first. */
export function activations(
  board: Board,
  w: Weights,
  available: Available,
  skillPlans = true
): Activation[] {
  const c = context(board, w, available, skillPlans);
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
  return sortActivations(out);
}

/**
 * What the active player should keep doing under the action it declared,
 * or null to end its activation.
 */
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
  if (!used)
    return [...blitzActivations(c, player), ...pickupActivation(c, player)];
  if (carrierOf(c.board)?.id === player.id)
    return carrierActivations(c, player);
  return [
    ...pickupActivation(c, player),
    ...repositionActivation(c, player, roleSquares(c)),
  ].filter((a) => a.tier !== "risky");
}

function continuationOptions(
  c: Context,
  player: Player,
  action: ActionType,
  blitzBlockUsed: boolean
): Activation[] {
  const capability = c.skillPlans ? SKILL_PLANS[action] : undefined;
  if (capability) return capability(c, player);
  const carrying = carrierOf(c.board)?.id === player.id;
  switch (action) {
    case "move":
    case "standUp":
      return movementContinuation(c, player);
    case "block":
      return blockActivations(c, player);
    case "blitz":
      return blitzContinuation(c, player, blitzBlockUsed);
    case "handoff":
      return carrying
        ? handoffActivations(c, player)
        : pickupActivation(c, player);
    case "pass":
      return carrying
        ? passActivations(c, player)
        : pickupActivation(c, player);
    default:
      return [];
  }
}

export function continuationPlans(
  board: Board,
  w: Weights,
  player: Player,
  action: ActionType,
  blitzBlockUsed: boolean,
  available: Available,
  skillPlans = true
): Activation[] {
  const c = context(
    board,
    w,
    new Map([...available, [player.id, new Set<ActionType>([action])]]),
    skillPlans
  );
  const options = continuationOptions(c, player, action, blitzBlockUsed);
  return sortActivations(options.filter((a) => a.value > 0));
}

export function continuation(
  ...args: Parameters<typeof continuationPlans>
): Activation | null {
  return continuationPlans(...args)[0] ?? null;
}
