/**
 * Whole activations: which player does what, where to, and how much it is
 * worth, in the risk order Bot Bowl's scripted winners play a turn in.
 *
 * Nothing persists between decisions. Each decision reads the board again
 * and re-derives the list; a player already acting continues with the best
 * activation its declared action still allows. A path is re-planned from
 * the square the player now stands on, so a step that went to plan keeps
 * the same target and a surprise (a push, a bounce) picks a new one.
 */

import { Player } from "../../types/Player";
import { ActionType } from "../../types/events";
import { Board, carrierOf } from "./board";
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

/** Botbowl's turn order: the earlier a tier, the safer its actions. */
export const TIERS = [
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

export type Role = "cage" | "receiver" | "mark" | "screen" | "chase" | "stall";

export type Intent =
  | { kind: "score"; route: Route }
  | { kind: "carrier"; route: Route }
  | { kind: "pickup"; route: Route }
  | { kind: "handoff"; to: Player; route: Route | null }
  | { kind: "pass"; to: Player; route: Route | null }
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

function sortActivations(list: Activation[]): Activation[] {
  return list.sort(
    (a, b) =>
      TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
      b.value - a.value ||
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
  available: Available
): Activation[] {
  const c = context(board, w, available);
  const out: Activation[] = [];
  for (const player of board.ours) {
    const actions = available.get(player.id);
    if (actions) out.push(...forPlayer(c, player, actions));
  }
  const carrier = carrierOf(board);
  if (carrier?.teamId === board.us && scoreChanceOf(c, carrier) < w.safeScore)
    out.push(...deepReceiverActivations(c, carrier));
  out.push(...assistActivations(c, out));
  return sortActivations(out);
}

/**
 * What the active player should keep doing under the action it declared,
 * or null to end its activation.
 */
export function continuation(
  board: Board,
  w: Weights,
  player: Player,
  action: ActionType,
  blitzBlockUsed: boolean,
  available: Available
): Activation | null {
  const c = context(
    board,
    w,
    new Map([...available, [player.id, new Set<ActionType>([action])]])
  );
  const carrying = carrierOf(board)?.id === player.id;
  let options: Activation[] = [];
  switch (action) {
    case "move":
    case "standUp":
      options = carrying
        ? carrierActivations(c, player)
        : [
            ...pickupActivation(c, player),
            ...repositionActivation(c, player, roleSquares(c)),
          ];
      break;
    case "block":
      options = blockActivations(c, player);
      break;
    case "blitz":
      options = blitzBlockUsed
        ? carrying
          ? carrierActivations(c, player)
          : [
              ...pickupActivation(c, player),
              ...repositionActivation(c, player, roleSquares(c)),
            ].filter((a) => a.tier !== "risky")
        : [...blitzActivations(c, player), ...pickupActivation(c, player)];
      break;
    case "handoff":
      options = carrying
        ? handoffActivations(c, player)
        : pickupActivation(c, player);
      break;
    case "pass":
      options = carrying
        ? passActivations(c, player)
        : pickupActivation(c, player);
      break;
    default:
      return null;
  }
  return sortActivations(options.filter((a) => a.value > 0))[0] ?? null;
}
