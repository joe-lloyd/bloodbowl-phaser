import React from "react";
import { RouteSummary } from "./RollPreviews";
import { GameEventNames } from "../../../types/events";
import { EventBus } from "../../../services/EventBus";
import { HudButton } from "../componentWarehouse/HudKit";

// Icons (simple SVGs for now, or just text)
const CheckIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

interface ActionStepperProps {
  steps: { id: string; label: string }[];
  currentStepId: string;
  eventBus: EventBus;
  hasMovedInAction: boolean;
  /** A narrow thumb rail, as on a phone: the plan bar sums up the route. */
  compact?: boolean;
}

export const ActionStepper: React.FC<ActionStepperProps> = ({
  steps,
  currentStepId,
  eventBus,
  hasMovedInAction,
  compact = false,
}) => {
  const handleStepClick = (stepId: string) => {
    eventBus.emit(GameEventNames.UI_StepSelected, { stepId });
  };

  return (
    <div
      className={
        compact
          ? "flex flex-col rounded-hud border border-white/10 bg-hud-ink/90 p-1.5 shadow-hud"
          : "flex min-w-[220px] flex-col p-2"
      }
    >
      {/* Header */}
      {!compact && <div className="hud-label mb-2 px-1">Action Sequence</div>}

      <div className="flex flex-col gap-1.5">
        {steps.map((step, index) => {
          const isActive = step.id === currentStepId;
          const isPast = steps.findIndex((s) => s.id === currentStepId) > index;

          return (
            <button
              key={step.id}
              data-testid={`action-step-${step.id}`}
              data-active={isActive ? "true" : "false"}
              onClick={(e) => {
                e.stopPropagation();
                // Only allow navigating to past steps or current (future steps might need logic to unlock)
                // For now, allow free navigation as per original logic, but usually games restrict going forward without completing action
                handleStepClick(step.id);
              }}
              className={`relative flex min-h-[44px] w-full items-center ${compact ? "gap-1.5" : "gap-3"} rounded-hud border px-2 text-left transition-[background-color,border-color] duration-150 ease-bb ${
                isActive
                  ? "border-hud-gold bg-hud-gold/15 text-hud-bone shadow-hud-glow"
                  : isPast
                    ? "border-hud-good/40 bg-hud-good/10 text-hud-bone/85 hover:border-hud-good"
                    : "border-white/10 bg-hud-raise/70 text-hud-dim hover:border-hud-gold/50 hover:text-hud-bone"
              }`}
            >
              {/* Step Number / Icon */}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-hud font-hud-display text-hud-base leading-none ${
                  isActive
                    ? "bg-hud-gold text-hud-ink"
                    : isPast
                      ? "bg-hud-good text-hud-ink"
                      : "border border-white/15 text-hud-dim"
                }`}
              >
                {isPast ? <CheckIcon /> : index + 1}
              </span>

              {/* Label */}
              <span
                className={`flex-grow font-hud-label font-bold uppercase tracking-[0.05em] ${compact ? "text-hud-sm leading-tight" : "text-hud-base"}`}
              >
                {step.label}
              </span>

              {/* Active Indicator (Chevron) */}
              {isActive && !compact && (
                <span className="text-hud-gold animate-pulse">◄</span>
              )}
            </button>
          );
        })}
      </div>

      {!compact && <RouteSummary eventBus={eventBus} />}

      {/* Control Buttons */}
      <div className="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2">
        {/* Back / Cancel - Only if NOT MOVED */}
        {!hasMovedInAction && (
          <HudButton
            variant="ghost"
            size="sm"
            block
            onClick={(e) => {
              e.stopPropagation();
              eventBus.emit(GameEventNames.UI_CancelAction);
            }}
          >
            ← Back
          </HudButton>
        )}

        {/* End Activation - Always available */}
        <HudButton
          data-testid="action-end-activation"
          variant="danger"
          size="sm"
          block
          onClick={(e) => {
            e.stopPropagation();
            eventBus.emit(GameEventNames.UI_EndActivation);
          }}
        >
          End Activation
        </HudButton>
      </div>
    </div>
  );
};
