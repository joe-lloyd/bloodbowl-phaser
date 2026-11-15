import { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { GameEventNames } from "../../../types/events";
import { InducementCommandResponse } from "../../../types/Inducements";

/** Read the accepted state again after local commands, replay or resync. */
export function usePregameInducements(eventBus: EventBus) {
  const [revision, refresh] = useState(0);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    const events = [
      GameEventNames.UI_SyncBoard,
      GameEventNames.GameStateRestored,
      GameEventNames.DecisionRequested,
      GameEventNames.DecisionResolved,
      GameEventNames.PhaseChanged,
    ] as const;
    events.forEach((event) => eventBus.on(event, update));
    return () => events.forEach((event) => eventBus.off(event, update));
  }, [eventBus]);
  const service = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService
    : null;
  const pregame = service?.getState().pregameInducements;
  const decision =
    service?.getDecisionService().pending() ??
    getActiveOnlineMatch()?.pendingDecision();
  useEffect(() => {
    let live = true;
    if (pregame?.complete && service) {
      void service
        .getFlowContext()
        .flowManager.whenIdle()
        .then(() => {
          if (live) setSettled(true);
        });
    } else setSettled(false);
    return () => {
      live = false;
    };
  }, [pregame?.complete, service, revision]);
  return {
    pregame,
    pending: !!pregame && (!settled || !!decision),
    decision,
    refresh: () => refresh((value) => value + 1),
  };
}

/** Await acknowledgment; a refused network purchase never advances this screen. */
export function usePregameCommand(onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => InducementCommandResponse) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if (!result.ok) setError(result.errors.join(", "));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't save your selection. Try again."
      );
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  return { busy, error, run };
}
