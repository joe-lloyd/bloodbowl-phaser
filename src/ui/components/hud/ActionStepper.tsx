import React from "react";
import { GameEventNames } from "../../../types/events";
import { EventBus } from "../../../services/EventBus";

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
}

export const ActionStepper: React.FC<ActionStepperProps> = ({
  steps,
  currentStepId,
  eventBus,
}) => {
  const handleStepClick = (stepId: string) => {
    eventBus.emit(GameEventNames.UI_StepSelected, { stepId });
  };

  return (
    <div className="flex flex-col space-y-2 bg-bb-warm-paper border-2 border-bb-divider p-3 rounded-sm shadow-parchment min-w-[220px]">
      {/* Header */}
      <div className="text-center font-heading text-sm tracking-wider text-bb-blood-red mb-3 border-b-2 border-bb-divider pb-1 uppercase">
        Action Sequence
      </div>

      <div className="flex flex-col space-y-2">
        {steps.map((step, index) => {
          const isActive = step.id === currentStepId;
          const isPast = steps.findIndex((s) => s.id === currentStepId) > index;

          return (
            <button
              key={step.id}
              onClick={(e) => {
                e.stopPropagation();
                // Only allow navigating to past steps or current (future steps might need logic to unlock)
                // For now, allow free navigation as per original logic, but usually games restrict going forward without completing action
                handleStepClick(step.id);
              }}
              className={`
                relative w-full flex items-center p-2 rounded-sm transition-all duration-200 group border-2 text-left
                ${
                  isActive
                    ? "bg-bb-ink-blue border-bb-gold text-bb-parchment shadow-chunky transform -translate-y-[1px]"
                    : isPast
                      ? "bg-bb-pitch-green border-bb-pitch-green text-bb-parchment opacity-90 hover:opacity-100"
                      : "bg-bb-parchment border-bb-divider text-bb-muted-text hover:border-bb-dark-gold hover:text-bb-text-dark"
                }
              `}
            >
              {/* Step Number / Icon */}
              <div
                className={`
                flex items-center justify-center w-6 h-6 rounded-sm text-xs font-bold mr-3 border-2 font-heading
                ${
                  isActive
                    ? "bg-bb-parchment text-bb-ink-blue border-bb-gold"
                    : isPast
                      ? "bg-bb-parchment text-bb-pitch-green border-transparent"
                      : "bg-bb-warm-paper text-bb-muted-text border-bb-divider"
                }
              `}
              >
                {isPast ? <CheckIcon /> : index + 1}
              </div>

              {/* Label */}
              <span
                className={`font-heading text-sm uppercase tracking-wide flex-grow ${
                  isActive ? "text-shadow-sm" : ""
                }`}
              >
                {step.label}
              </span>

              {/* Active Indicator (Chevron) */}
              {isActive && (
                <div className="absolute right-2 text-bb-gold animate-pulse">
                  ◄
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Cancel Action Button */}
      <div className="pt-2 mt-2 border-t border-bb-divider">
        <button
          onClick={(e) => {
            e.stopPropagation();
            eventBus.emit(GameEventNames.PlayerSelected, { player: null });
          }}
          className="w-full py-2 px-3 text-xs font-heading font-bold uppercase tracking-widest text-bb-blood-red hover:bg-bb-blood-red hover:text-bb-parchment border border-transparent hover:border-bb-dark-gold rounded-sm transition-colors"
        >
          Cancel Action
        </button>
      </div>
    </div>
  );
};
