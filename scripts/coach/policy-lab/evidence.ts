/** Diagnostic proposals are observations, never an independent opportunity oracle. */
import type { CoachContext, CoachChoice } from "../../../src/simulation/coach";
import { availableActions } from "../../../src/simulation/ai/planner";
import { readBoard } from "../../../src/simulation/ai/board";
import { activations } from "../../../src/simulation/ai/activations";
import { DEFAULT_WEIGHTS } from "../../../src/simulation/ai/weights";

export function createOpportunityLog() {
  const proposed: Record<string, number> = {};
  const legal: Record<string, number> = {};
  const receipts: unknown[] = [];
  function observe(
    context: CoachContext,
    choice: CoachChoice,
    decisions: number
  ) {
    const command = context.point.candidates[choice.index]?.commands[0];
    const available = availableActions(context.point.candidates);
    if (available.size) {
      const board = readBoard(context.game, context.point.teamId);
      const plans = activations(board, DEFAULT_WEIGHTS, available);
      for (const actions of available.values())
        for (const action of actions) legal[action] = (legal[action] ?? 0) + 1;
      for (const plan of plans)
        proposed[plan.intent.kind] = (proposed[plan.intent.kind] ?? 0) + 1;
      if (
        receipts.length < 12 &&
        board.turnsLeft <= 1 &&
        (plans.some((p) => p.intent.kind === "pass") ||
          choice.note?.includes("safety"))
      )
        receipts.push({
          decision: decisions,
          turn: 6 - board.turnsLeft,
          half: board.half2 ? 2 : 1,
          lead: board.lead,
          fielded: [board.ours.length, board.theirs.length],
          note: choice.note,
          command,
          alternatives: plans.slice(0, 5).map((p) => ({
            player: p.player.id,
            action: p.action,
            intent: p.intent.kind,
            value: p.value,
            rolls: p.rolls,
          })),
        });
    }
  }
  return { proposed, legal, receipts, observe };
}
