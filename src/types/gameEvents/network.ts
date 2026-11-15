/**
 * Event payloads for online play: what the other coach is doing, and the
 * board syncing to the host.
 */

import { GameEventNames } from "./names";

export interface NetworkGameEvents {
  [GameEventNames.RemoteSelectionChanged]: { playerId: string | null };
  [GameEventNames.RemotePromptChanged]: StepPrompt | null;
}

export interface NetworkUIEvents {
  /** `positions`: redraw where everyone stands too, not only statuses —
   *  after a resync, which may have rewound the match. */
  [GameEventNames.UI_ShowOtherCoachMove]: {
    from: { x: number; y: number };
    path: { x: number; y: number }[];
    ma: number;
  };
  [GameEventNames.UI_OtherCoachMoveResolved]: { playerId: string };
  [GameEventNames.UI_SyncBoard]: { positions: true } | void;
  [GameEventNames.NetworkCommandRejected]: {
    /** The rejected command's `type`, e.g. "declare-action" */
    commandType: string;
    /** The player the command was declaring/cancelling/acting for, when the
     *  command shape carries one (declare-action, cancel-action, block, …). */
    playerId?: string;
    /** The action the command tried to declare (declare-action only). */
    action?: string;
    reason: string;
  };
  /** The pass or hand-off this coach is aiming, for the other coach. */
  [GameEventNames.UI_PassAimed]: StepPrompt | null;
}

/** A roll a read-only prompt can name. "armour" is a foul's 2D6. */
export type PromptRollType =
  | "dodge"
  | "rush"
  | "pickup"
  | "pass"
  | "catch"
  | "armour";

/** What a coach is asked before a risky step: the rolls and their targets. */
export interface StepPrompt {
  playerId: string;
  rolls: { type: PromptRollType; target: number }[];
}
