import React, { useRef } from "react";
import { RouteSummary } from "./RollPreviews";
import { GameEventNames, type ActionStep } from "../../../types/events";
import type { EventBus } from "../../../services/EventBus";
import { cx, HudButton, KeyBadge } from "../componentWarehouse/HudKit";
import { StepMark } from "../componentWarehouse/HudSteps";
import { type StepState, stepRowClass } from "../componentWarehouse/stepRow";
import { useHotkey, type Hotkey } from "../../hotkeys";
import { MoveSplit } from "./MoveSplit";
import { MOVEMENT_HALVES } from "./movementHalves";

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
  const state = stepState(isActive, isPast);
  return (
    <button
      ref={button}
      data-testid={`action-step-${step.id}`}
      data-active={isActive ? "true" : "false"}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(step.id);
      }}
      className={cx(
        stepRowClass(state),
        "relative min-h-[44px] transition-[background-color,border-color] duration-150 ease-bb hover:border-hud-gold/60"
      )}
    >
      {numbered && <StepMark state={state} number={index + 1} />}

      <span
        className={`flex-grow font-hud-label font-bold uppercase tracking-[0.05em] ${compact ? "leading-tight" : ""}`}
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
    <div className="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2 phone:flex-row phone:[&>button]:min-h-[44px] phone:[&>button]:px-1 phone:[&>button]:text-hud-sm phone:[&>button]:leading-none">
      {!hasMovedInAction && (
        <HudButton
          variant="ghost"
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

function stepState(active: boolean, past: boolean): StepState {
  if (active) return "current";
  return past ? "done" : "todo";
}
