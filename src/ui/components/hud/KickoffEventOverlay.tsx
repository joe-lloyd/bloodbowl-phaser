import React from "react";
import { type IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import {
  KickoffEvent,
  isOneSquareMoveEvent,
} from "../../../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";
import { type KickoffTodo, kickoffTodo } from "./kickoffSteps";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useEventBus } from "../../hooks/useEventBus";
import { Chip, HudButton, Panel } from "../componentWarehouse/HudKit";

function TodoList({ todo, active }: { todo: KickoffTodo; active: boolean }) {
  return (
    <ol className="mt-2 space-y-1 font-hud-body text-hud-sm" data-testid="kickoff-todo">
      {todo.lines.map((line, index) => {
        const current = active && index === todo.current;
        return (
          <li
            key={line}
            aria-current={current ? "step" : undefined}
            className={`flex gap-2 rounded-hud border-l-[3px] px-2.5 py-1 ${
              current
                ? "border-hud-gold bg-white/5 text-hud-bone"
                : "border-hud-edge text-hud-dim"
            }`}
          >
            <span className="w-3 shrink-0 font-hud-label font-bold tabular-nums">
              {index + 1}
            </span>
            {line}
          </li>
        );
      })}
    </ol>
  );
}

function finishButton(step: KickoffEventStepState) {
  if (isOneSquareMoveEvent(step.event))
    return { label: "Done", ready: step.movedPlayerIds.length > 0 };
  if (step.event === KickoffEvent.HIGH_KICK)
    return { label: "Confirm", ready: true };
  return { label: step.event, ready: step.selectedPlayerIds.length > 0 };
}

export function KickoffEventOverlay({ eventBus }: { eventBus: IEventBus }) {
  const [step, setStep] = React.useState<KickoffEventStepState | null>(null);

  const refresh = React.useCallback(() => {
    if (!ServiceContainer.isInitialized()) return;
    setStep(ServiceContainer.getInstance().gameService.getKickoffEventStep());
  }, []);

  useEventBus(eventBus, GameEventNames.KickoffEventStepStarted, refresh);
  useEventBus(eventBus, GameEventNames.KickoffEventStepResolved, refresh);
  useEventBus(eventBus, GameEventNames.KickoffEventStepChanged, refresh);
  useEventBus(eventBus, GameEventNames.UI_SyncBoard, refresh);
  useEventBus(eventBus, GameEventNames.GameStateRestored, refresh);
  useEventBus(eventBus, GameEventNames.PlayerMoved, refresh);
  useEventBus(eventBus, GameEventNames.PlayerPlaced, refresh);
  useEventBus(eventBus, GameEventNames.PlayerRemoved, refresh);
  useEventBus(eventBus, GameEventNames.PlayerSelected, refresh);

  if (!step || !ServiceContainer.isInitialized()) return null;

  const service = ServiceContainer.getInstance().gameService;
  const team = service.getTeam(step.teamId);
  if (!team) return null;
  const match = getActiveOnlineMatch();
  const canAct = !match || (match.myTeamId === step.teamId && match.mayAct());
  const awaiting = new Set(step.awaitingPlacement);
  const oneSquare = isOneSquareMoveEvent(step.event);
  const limit = step.selectionLimit;
  const moved = step.movedPlayerIds.length;
  const picked = step.selectedPlayerIds.length;
  const count = oneSquare
    ? `${String(moved)}/${String(limit)} moved`
    : `${String(picked)}/${String(limit)}`;
  const finish = finishButton(step);

  return (
    <Panel
      as="section"
      accent="gold"
      className="pointer-events-auto mt-auto max-h-[48vh] w-full max-w-sm overflow-y-auto hud-scroll p-3 animate-hud-in"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-gold">
          {step.event}
        </h2>
        <Chip tone="gold" className="shrink-0 !text-hud-sm">
          {count}
        </Chip>
      </div>

      <TodoList todo={kickoffTodo(step)} active={canAct} />
      {!canAct && (
        <p className="mt-2 text-hud-sm text-hud-bone">
          Waiting for {team.name}'s coach…
        </p>
      )}

      {canAct && (
        <div className="mt-3 flex justify-end gap-2">
          <HudButton
            variant="ghost"
            disabled={awaiting.size > 0}
            onClick={() => {
              service.skipKickoffEventStep();
              refresh();
            }}
          >
            Skip
          </HudButton>
          {!step.charge && (
            <HudButton
              variant="gold"
              disabled={awaiting.size > 0 || !finish.ready}
              onClick={() => {
                service.confirmKickoffEventStep();
                refresh();
              }}
            >
              {finish.label}
            </HudButton>
          )}
        </div>
      )}
    </Panel>
  );
}
