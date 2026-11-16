import type { ActionType } from "@/types/events";
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "@/types/BlockReplacement";

export type ActionStep = { id: string; label: string };

/**
 * Special activation actions that target a single adjacent Standing
 * opponent. Declaring one enters a "target" step; clicking a valid target
 * runs it through the matching IGameService call.
 */
export const SPECIAL_ACTION_MODES = new Set<string>([
  "stab",
  "breatheFire",
  "vomit",
  "gaze",
  "chomp",
  "chainsaw",
]);

const MOVE: ActionStep = { id: "move", label: "Move" };
const SELECT_TARGET: ActionStep = { id: "target", label: "Select Target" };

/** Each declared action's steps; an action not listed moves and Jumps. */
const ACTION_STEPS: Partial<Record<ActionType, ActionStep[]>> = {
  // Single-target special action: pick an adjacent Standing opponent
  stab: [SELECT_TARGET],
  breatheFire: [SELECT_TARGET],
  vomit: [SELECT_TARGET],
  chomp: [SELECT_TARGET],
  chainsaw: [SELECT_TARGET],
  // Hypnotic Gaze may Move first, then picks an adjacent target
  gaze: [MOVE, SELECT_TARGET],
  pass: [MOVE, { id: "pass", label: "Pass" }],
  punt: [MOVE, { id: "punt", label: "Punt (pick direction)" }],
  // A Bomber may not Move before throwing: one step, aim at any square.
  throwBomb: [{ id: "bomb", label: "Throw Bomb" }],
  // The Fanatic's only action: pick a facing (a click direction).
  ballAndChain: [{ id: "swing", label: "Swing (pick a direction)" }],
  blitz: [MOVE, { id: "block", label: "Block" }],
  handoff: [MOVE, { id: "handoff", label: "Handoff" }],
  foul: [MOVE, { id: "foul", label: "Foul" }],
  // A standalone Block: pick an adjacent Standing opponent to block.
  block: [{ id: "block", label: "Block" }],
  multipleBlock: [{ id: "multipleBlock", label: "Select Two Targets" }],
  // Move first (optional), then throw: in the throw step the first click
  // picks the adjacent Right-Stuff team-mate, the second aims.
  throwTeamMate: [MOVE, { id: "throw", label: "Throw Team-mate" }],
  // Moving onto the ball performs the Secure the Ball roll automatically.
  secureBall: [{ id: "move", label: "Move to secure the ball" }],
};

/**
 * Move: walk by clicking squares, or Jump over an adjacent downed player
 * via the Jump step (you can jump at any point in the move).
 */
const MOVE_STEPS: ActionStep[] = [MOVE, { id: "jump", label: "Jump" }];

/**
 * The stepper for a declared action, as fresh objects the board may change.
 * A Blitz that replaces its Block with an attack names that attack.
 */
export function actionStepsFor(
  action: ActionType,
  blockReplacement: BlockReplacement | null
): ActionStep[] {
  const steps =
    action === "blitz" && blockReplacement
      ? [
          MOVE,
          {
            id: "target",
            label: BLOCK_REPLACEMENT_DEFINITIONS[blockReplacement].label,
          },
        ]
      : (ACTION_STEPS[action] ?? MOVE_STEPS);
  return steps.map((step) => ({ ...step }));
}
