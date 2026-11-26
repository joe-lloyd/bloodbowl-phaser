import { useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import type { ActionPlanSummary, PlanStage } from "../../../game/rules/actionPlan";
import { HudButton, Panel, PanelHeader } from "../componentWarehouse/HudKit";
import { StepRow } from "../componentWarehouse/HudSteps";
import { planRollList, rollText, useActionPlan } from "./useActionPlan";

function PlanButtons({
  eventBus,
  plan,
  hotkey = false,
}: {
  eventBus: IEventBus;
  plan: ActionPlanSummary;
  hotkey?: boolean;
}) {
  return (
    <>
      <HudButton
        data-testid="action-plan-clear"
        aria-label="Clear the plan"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          eventBus.emit(GameEventNames.UI_ClearMovePlan, undefined);
        }}
      >
        ✕
      </HudButton>
      <HudButton
        data-testid="action-plan-go"
        variant="primary"
        {...(hotkey ? { hotkey: "Enter" } : {})}
        disabled={plan.blocked !== null}
        className="flex-1"
        onClick={(event) => {
          event.stopPropagation();
          eventBus.emit(GameEventNames.UI_GoMovePlan, undefined);
        }}
      >
        Go
      </HudButton>
    </>
  );
}

function StageRow({ stage, number }: { stage: PlanStage; number: number }) {
  const rolls = rollText(stage);
  return (
    <StepRow state="todo" number={number}>
      <span className="block font-hud-label text-hud-sm font-bold uppercase tracking-[0.05em] text-hud-bone">
        {stage.label}
      </span>
      {rolls.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-hud-label text-hud-sm font-bold text-hud-gold">
          {rolls.map((roll, i) => (
            <span key={i}>{roll}</span>
          ))}
        </div>
      )}
      {stage.notes.map((note, i) => (
        <div key={i} className="text-hud-xs leading-snug text-hud-dim">
          {note}
        </div>
      ))}
    </StepRow>
  );
}

function PlanDetails({ plan }: { plan: ActionPlanSummary }) {
  return (
    <>
      <ol className="flex flex-col gap-1">
        {plan.stages.map((stage, i) => (
          <StageRow key={i} stage={stage} number={i + 1} />
        ))}
      </ol>
      <div className="text-hud-xs text-hud-dim">
        {plan.rerolls.length > 0
          ? `Re-rolls: ${plan.rerolls.join(", ")}`
          : "No re-roll available"}
      </div>
      {plan.blocked && (
        <div data-testid="action-plan-blocked" className="text-hud-xs font-bold text-hud-bad-soft">
          {plan.blocked}
        </div>
      )}
    </>
  );
}

export function ActionPlanCard({ eventBus }: { eventBus: IEventBus }) {
  const plan = useActionPlan(eventBus);
  if (!plan) return null;
  return (
    <Panel
      data-testid="action-plan"
      accent="gold"
      className="pointer-events-auto w-full font-hud-body text-hud-bone animate-hud-in"
    >
      <PanelHeader title={plan.title} />
      <div className="flex flex-col gap-2 p-3">
        <PlanDetails plan={plan} />
        <div className="flex items-center gap-2">
          <PlanButtons eventBus={eventBus} plan={plan} hotkey />
        </div>
      </div>
    </Panel>
  );
}

export function PhonePlanBar({ eventBus, plan }: { eventBus: IEventBus; plan: ActionPlanSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid="action-plan"
      className="hud-slab flex max-w-[92vw] flex-col gap-2 py-1.5 pl-3 pr-1.5 pointer-events-auto animate-hud-in"
    >
      {open && (
        <div data-testid="action-plan-details" className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto pr-1.5 font-hud-body text-hud-bone">
          <PlanDetails plan={plan} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="action-plan-toggle"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
          className="min-w-0 max-w-[44vw] text-left"
        >
          <span className="hud-label block text-hud-2xs text-hud-gold">
            {plan.title} {open ? "▾" : "▴"}
          </span>
          <span className="block truncate font-hud-label text-hud-sm font-bold leading-tight text-hud-bone">
            {plan.blocked ?? planRollList(plan)}
          </span>
        </button>
        <PlanButtons eventBus={eventBus} plan={plan} />
      </div>
    </div>
  );
}
