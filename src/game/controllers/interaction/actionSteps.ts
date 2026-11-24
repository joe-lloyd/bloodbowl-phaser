import type { ActionStep, ActionType } from "@/types/events";
import {
  type BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "@/types/BlockReplacement";

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

const ACTION_STEPS: Partial<Record<ActionType, ActionStep[]>> = {
  stab: [SELECT_TARGET],
  breatheFire: [SELECT_TARGET],
  vomit: [SELECT_TARGET],
  chomp: [SELECT_TARGET],
  chainsaw: [SELECT_TARGET],

  gaze: [MOVE, SELECT_TARGET],
  pass: [MOVE, { id: "pass", label: "Pass" }],
  punt: [MOVE, { id: "punt", label: "Punt (pick direction)" }],

  throwBomb: [{ id: "bomb", label: "Throw Bomb" }],

  ballAndChain: [{ id: "swing", label: "Swing (pick a direction)" }],
  blitz: [MOVE, { id: "block", label: "Block" }],
  handoff: [MOVE, { id: "handoff", label: "Handoff" }],
  foul: [MOVE, { id: "foul", label: "Foul" }],

  block: [{ id: "block", label: "Block" }],
  multipleBlock: [{ id: "multipleBlock", label: "Select Two Targets" }],

  throwTeamMate: [MOVE, { id: "throw", label: "Throw Team-mate" }],

  secureBall: [{ id: "move", label: "Move to secure the ball" }],
};

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
      : (ACTION_STEPS[action] ?? [MOVE]);
  return steps.map((step) => ({ ...step }));
}
