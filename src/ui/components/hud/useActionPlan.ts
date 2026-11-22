import { useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import type { ActionPlanSummary, PlanStage } from "../../../game/rules/actionPlan";
import { useEventBus } from "../../hooks/useEventBus";

export function useActionPlan(eventBus: IEventBus): ActionPlanSummary | null {
  const [plan, setPlan] = useState<ActionPlanSummary | null>(null);
  useEventBus(eventBus, GameEventNames.UI_ActionPlan, setPlan);
  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    setPlan(null);
  });
  return plan;
}

export const rollText = (stage: PlanStage) =>
  stage.rolls.map((roll) => `${roll.name} ${String(roll.target)}+`);

export function planRollList(plan: ActionPlanSummary): string {
  const parts = plan.stages.flatMap((stage) =>
    stage.rolls.length > 0 ? rollText(stage) : stage.notes.slice(0, 1)
  );
  return parts.length > 0 ? parts.join(" · ") : "No rolls";
}

