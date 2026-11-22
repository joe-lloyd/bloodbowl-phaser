import { useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import type { ActionPlanSummary, PlanStage } from "../../../game/rules/actionPlan";
import { HudButton } from "../componentWarehouse/HudKit";
import { planRollList, rollText, useActionPlan } from "./useActionPlan";

export function PlanButtons({
  eventBus,
  plan,
  size,
}: {
  eventBus: IEventBus;
  plan: ActionPlanSummary;
  size: "sm" | "md";
}) {
  return (
    <>
      <HudButton
        data-testid="action-plan-clear"
        aria-label="Clear the plan"
        variant="ghost"
        size={size}
        onClick={(event) => {
          event.stopPropagation();
          eventBus.emit(GameEventNames.UI_ClearMovePlan, undefined);
        }}
      >
        ✕
      </HudButton>
      <HudButton
        data-testid="action-plan-go"
        variant="gold"
        size={size}
        {...(size === "sm" ? { hotkey: "Enter" } : {})}
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

function StageRow({ stage }: { stage: PlanStage }) {
  const rolls = rollText(stage);
  return (
    <li className="border-t border-white/10 pt-1.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-hud-label text-hud-sm font-bold uppercase tracking-[0.05em] text-hud-bone">
          {stage.label}
        </span>
        {rolls.length === 0 && (
          <span className="text-hud-xs text-hud-dim">no roll</span>
        )}
      </div>
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
    </li>
  );
}

function PlanDetails({ plan }: { plan: ActionPlanSummary }) {
  return (
    <>
      <ol className="flex flex-col gap-1.5">
        {plan.stages.map((stage, i) => (
          <StageRow key={i} stage={stage} />
        ))}
      </ol>
      <div className="text-hud-xs text-hud-dim">
        {plan.rerolls.length
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
    <div
      data-testid="action-plan"
      className="hud-slab pointer-events-auto flex w-full flex-col gap-2 p-2.5 font-hud-body text-hud-bone animate-hud-in"
    >
      <span className="hud-label text-hud-gold">Plan · {plan.title}</span>
      <PlanDetails plan={plan} />
      <div className="flex items-center gap-2">
        <PlanButtons eventBus={eventBus} plan={plan} size="sm" />
      </div>
    </div>
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
        <div data-testid="action-plan-details" className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1.5 font-hud-body text-hud-bone">
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
            {plan.title} {open ? "▾" : "▴ details"}
          </span>
          <span className="block truncate font-hud-label text-hud-sm font-bold leading-tight text-hud-bone">
            {plan.blocked ?? planRollList(plan)}
          </span>
        </button>
        <PlanButtons eventBus={eventBus} plan={plan} size="md" />
      </div>
    </div>
  );
}
