import React, { useRef } from "react";
import { RouteSummary } from "./RollPreviews";
import { GameEventNames, type ActionStep } from "../../../types/events";
import type { EventBus } from "../../../services/EventBus";
import { HudButton, KeyBadge } from "../componentWarehouse/HudKit";
import { useHotkey, type Hotkey } from "../../hotkeys";
import { MoveSplit } from "./MoveSplit";
import { MOVEMENT_HALVES } from "./movementHalves";

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
  steps: ActionStep[];
  currentStepId: string;
  eventBus: EventBus;
  hasMovedInAction: boolean;

  compact?: boolean;

  firstOfTwo?: boolean;
}

export const ActionStepper: React.FC<ActionStepperProps> = ({
  steps,
  currentStepId,
  eventBus,
  hasMovedInAction,
  compact = false,
  firstOfTwo = false,
}) => {
  const handleStepClick = (stepId: string) => {
    eventBus.emit(GameEventNames.UI_StepSelected, { stepId });
  };
  const singleMove = steps.length === 1 && steps[0]?.id === "move";

  return (
    <div
      className={
        compact
          ? "flex w-[176px] flex-col rounded-hud border border-white/10 bg-hud-ink/90 p-1.5 shadow-hud"
          : "flex min-w-[220px] flex-col p-2"
      }
    >
      {!compact && (
        <div className="hud-label mb-2 px-1">
          {singleMove ? "Action" : "Action Sequence"}
        </div>
      )}

      <ActionSteps
        steps={steps}
        currentStepId={currentStepId}
        compact={compact}
        singleMove={singleMove}
        onSelect={handleStepClick}
      />

      {!compact && <RouteSummary eventBus={eventBus} />}

      <ActionFooter
        eventBus={eventBus}
        hasMovedInAction={hasMovedInAction}
        firstOfTwo={firstOfTwo}
      />
    </div>
  );
};

function StepButton({
  step,
  index,
  isActive,
  isPast,
  compact,
  numbered,
  hotkey,
  onSelect,
}: {
  step: { id: string; label: string };
  index: number;
  isActive: boolean;
  isPast: boolean;
  compact: boolean;
  numbered: boolean;
  hotkey: Hotkey | undefined;
  onSelect: (stepId: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useHotkey(
    hotkey,
    () => {
      onSelect(step.id);
    },
    true,
    button
  );
  return (
    <button
      ref={button}
      data-testid={`action-step-${step.id}`}
      data-active={isActive ? "true" : "false"}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(step.id);
      }}
      className={`relative flex min-h-[44px] w-full items-center ${compact ? "gap-1.5" : "gap-3"} rounded-hud border px-2 text-left transition-[background-color,border-color] duration-150 ease-bb ${stepButtonColors(
        isActive,
        isPast
      )}`}
    >
      <StepNumber
        numbered={numbered}
        index={index}
        isActive={isActive}
        isPast={isPast}
      />

      <span
        className={`flex-grow font-hud-label font-bold uppercase tracking-[0.05em] ${compact ? "text-hud-sm leading-tight" : "text-hud-base"}`}
      >
        {step.label}
      </span>

      {hotkey && !numbered && !compact && <KeyBadge hotkey={hotkey} />}
      {isActive && !compact && (
        <span className="text-hud-gold animate-pulse">◄</span>
      )}
    </button>
  );
}

function ActionFooter({
  eventBus,
  hasMovedInAction,
  firstOfTwo,
}: Pick<ActionStepperProps, "eventBus" | "hasMovedInAction"> & {
  firstOfTwo: boolean;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2 phone:flex-row phone:[&>button]:min-h-[44px] phone:[&>button]:px-1">
      {!hasMovedInAction && (
        <HudButton
          variant="ghost"
          size="sm"
          block
          onClick={(e) => {
            e.stopPropagation();
            eventBus.emit(GameEventNames.UI_CancelAction, undefined);
          }}
        >
          ← Back
        </HudButton>
      )}

      <HudButton
        data-testid="action-end-activation"
        variant="danger"
        size="sm"
        block
        onClick={(e) => {
          e.stopPropagation();
          eventBus.emit(GameEventNames.UI_EndActivation, undefined);
        }}
      >
        {firstOfTwo ? "End First Action" : "End Activation"}
      </HudButton>
    </div>
  );
}
function ActionSteps({
  steps,
  currentStepId,
  compact,
  singleMove,
  onSelect,
}: Pick<ActionStepperProps, "steps" | "currentStepId"> & {
  compact: boolean;
  singleMove: boolean;
  onSelect: (stepId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, index) => {
        const isActive = step.id === currentStepId;
        const isPast = steps.findIndex((s) => s.id === currentStepId) > index;

        const button = (
          <StepButton
            key={step.id}
            step={step}
            index={index}
            isActive={isActive}
            isPast={isPast}
            compact={compact}
            numbered={!singleMove && !(compact && step.half)}
            hotkey={singleMove || index > 8 ? undefined : String(index + 1)}
            onSelect={onSelect}
          />
        );
        if (!step.half) return button;
        const { label, hotkey } = MOVEMENT_HALVES[step.half];
        return (
          <MoveSplit key={step.id}>
            {button}
            <StepButton
              step={{ id: step.half, label }}
              index={index}
              isActive={currentStepId === step.half}
              isPast={false}
              compact={compact}
              numbered={false}
              hotkey={hotkey}
              onSelect={onSelect}
            />
          </MoveSplit>
        );
      })}
    </div>
  );
}

function StepNumber({
  numbered,
  index,
  isActive,
  isPast,
}: {
  numbered: boolean;
  index: number;
  isActive: boolean;
  isPast: boolean;
}) {
  return (
    <>
      {numbered && (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-hud font-hud-display text-hud-base leading-none ${stepNumberColors(
            isActive,
            isPast
          )}`}
        >
          {isPast ? <CheckIcon /> : index + 1}
        </span>
      )}
    </>
  );
}

function stepButtonColors(active: boolean, past: boolean): string {
  if (active)
    return "border-hud-gold bg-hud-gold/15 text-hud-bone shadow-hud-glow";
  return past
    ? "border-hud-good/40 bg-hud-good/10 text-hud-bone/85 hover:border-hud-good"
    : "border-white/10 bg-hud-raise/70 text-hud-dim hover:border-hud-gold/50 hover:text-hud-bone";
}
function stepNumberColors(active: boolean, past: boolean): string {
  if (active) return "bg-hud-gold text-hud-ink";
  return past
    ? "bg-hud-good text-hud-ink"
    : "border border-white/15 text-hud-dim";
}
