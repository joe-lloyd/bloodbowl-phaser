import React from "react";
import { type IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { KickoffEvent } from "../../../game/kickoff/kickoffEvents";
import { type KickoffTodo, kickoffTodo, playersLeft } from "./kickoffSteps";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useEventBus } from "../../hooks/useEventBus";
import { Chip, HudButton, Panel, PanelHeader } from "../componentWarehouse/HudKit";
import { StepRow } from "../componentWarehouse/HudSteps";

function TodoList({ todo, active }: { todo: KickoffTodo; active: boolean }) {
  return (
    <ol className="space-y-1" data-testid="kickoff-todo">
      {todo.lines.map((line, index) => (
        <StepRow
          key={line}
          state={active && index === todo.current ? "current" : "todo"}
          number={index + 1}
        >
          {line}
        </StepRow>
      ))}
    </ol>
  );
}

function stepCount(step: KickoffEventStepState): string {
  return step.stage === "play"
    ? `${String(playersLeft(step))} left`
    : `${String(step.selectedPlayerIds.length)}/${String(step.selectionLimit)} chosen`;
}

function ChoosingButtons({
  step,
  onSkip,
  onStart,
}: {
  step: KickoffEventStepState;
  onSkip: () => void;
  onStart: () => void;
}) {
  return (
    <>
      <HudButton variant="ghost" onClick={onSkip}>
        Skip
      </HudButton>
      {step.event !== KickoffEvent.HIGH_KICK && (
        <HudButton
          variant="primary"
          disabled={step.selectedPlayerIds.length === 0}
          onClick={onStart}
        >
          Start {step.event}
        </HudButton>
      )}
    </>
  );
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
  useEventBus(eventBus, GameEventNames.PlayerActivated, refresh);
  useEventBus(eventBus, GameEventNames.TurnDataUpdated, refresh);
  useEventBus(eventBus, GameEventNames.KickoffTurnStarted, refresh);
  useEventBus(eventBus, GameEventNames.KickoffTurnEnded, refresh);

  if (!step || !ServiceContainer.isInitialized()) return null;

  const service = ServiceContainer.getInstance().gameService;
  const team = service.getTeam(step.teamId);
  if (!team) return null;
  const match = getActiveOnlineMatch();
  const canAct = !match || (match.myTeamId === step.teamId && match.mayAct());
  const answer = (send: () => boolean) => () => {
    send();
    refresh();
  };

  return (
    <Panel
      as="section"
      accent="gold"
      className="pointer-events-auto mt-auto max-h-[48vh] phone:max-h-none w-full max-w-sm overflow-y-auto hud-scroll animate-hud-in"
    >
      <PanelHeader
        as="h2"
        title={step.event}
        controls={<Chip tone="gold">{stepCount(step)}</Chip>}
      />
      <div className="p-3 phone:p-2">
        <TodoList todo={kickoffTodo(step)} active={canAct} />
        {!canAct && (
          <p className="mt-2 text-hud-sm text-hud-bone">
            Waiting for {team.name}'s coach…
          </p>
        )}

        {canAct && (step.stage === "choose" || step.canReselect) && (
          <div className="mt-3 flex justify-end gap-2">
            {step.stage === "choose" ? (
              <ChoosingButtons
                step={step}
                onSkip={answer(() => service.skipKickoffEventStep())}
                onStart={answer(() => service.confirmKickoffEventStep())}
              />
            ) : (
              <HudButton
                variant="ghost"
                onClick={answer(() => service.reselectKickoffEventPlayers())}
              >
                Change picks
              </HudButton>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
