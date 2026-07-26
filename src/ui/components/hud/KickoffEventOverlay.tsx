import React from "react";
import { IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import {
  KICKOFF_EVENT_MEANING,
  KickoffEvent,
} from "../../../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useEventBus } from "../../hooks/useEventBus";

export function KickoffEventOverlay({
  eventBus,
}: {
  eventBus: IEventBus;
}) {
  const [step, setStep] = React.useState<KickoffEventStepState | null>(null);

  const refresh = React.useCallback(() => {
    if (!ServiceContainer.isInitialized()) return;
    setStep(ServiceContainer.getInstance().gameService.getKickoffEventStep());
  }, []);

  useEventBus(eventBus, GameEventNames.KickoffEventStepStarted, refresh);
  useEventBus(eventBus, GameEventNames.KickoffEventStepResolved, refresh);
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
  const selected = new Set(step.selectedPlayerIds);
  const awaiting = new Set(step.awaitingPlacement);
  const activeChargePlayer = team.players.find(
    (player) => player.id === step.charge?.activePlayerId
  );
  const instruction =
    awaiting.size > 0
      ? "Finish placing the highlighted player."
      : step.event === KickoffEvent.QUICK_SNAP
        ? "Click an eligible player on the pitch, then click one adjacent empty square."
        : step.event === KickoffEvent.HIGH_KICK
          ? `Click one eligible receiving player on the pitch to place them under the ball at (${step.landingSquare?.x}, ${step.landingSquare?.y}).`
          : step.event === KickoffEvent.SOLID_DEFENCE
            ? "Drag a highlighted Open player directly to a different legal setup square. Confirm when finished."
            : step.charge
              ? `${activeChargePlayer?.playerName ?? "The selected player"} is active. Choose an action in the normal player action window.`
              : "Click up to the limit on the pitch, then confirm to activate them in order.";

  return (
    <section className="pointer-events-auto mt-auto max-h-[48vh] w-full max-w-sm overflow-y-auto rounded border-2 border-bb-gold bg-black/95 p-4 text-bb-parchment shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl text-bb-gold">{step.event}</h2>
            <p className="mt-1 text-sm text-white/75">
              {KICKOFF_EVENT_MEANING[step.event]}
            </p>
          </div>
          <span className="shrink-0 rounded border border-bb-gold/60 px-2 py-1 text-xs">
            {selected.size}/{step.selectionLimit}
          </span>
        </div>

        <p className="mt-3 rounded bg-white/5 px-3 py-2 text-sm">
          {canAct ? instruction : `Waiting for ${team.name}'s coach…`}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={!canAct || awaiting.size > 0}
            onClick={() => {
              service.skipKickoffEventStep();
              refresh();
            }}
            className="rounded border border-white/30 px-4 py-2 disabled:opacity-40"
          >
            Skip
          </button>
          {!step.charge && (
            <button
              type="button"
              disabled={!canAct || awaiting.size > 0}
              onClick={() => {
                service.confirmKickoffEventStep();
                refresh();
              }}
              className="rounded bg-bb-gold px-4 py-2 font-bold text-black disabled:opacity-40"
            >
              Confirm
            </button>
          )}
        </div>
    </section>
  );
}
