import React from "react";
import { IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import {
  KICKOFF_EVENT_MEANING,
  KickoffEvent,
  isOneSquareMoveEvent,
} from "../../../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useEventBus } from "../../hooks/useEventBus";
import { Chip, HudButton, Panel } from "../componentWarehouse/HudKit";

export function KickoffEventOverlay({ eventBus }: { eventBus: IEventBus }) {
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
      : isOneSquareMoveEvent(step.event)
        ? "Click an eligible player on the pitch, then click one adjacent empty square."
        : step.event === KickoffEvent.HIGH_KICK
          ? `Click one eligible receiving player on the pitch to place them under the ball at (${step.landingSquare?.x}, ${step.landingSquare?.y}).`
          : step.charge
            ? `${activeChargePlayer?.playerName ?? "The selected player"} is active. Choose an action in the normal player action window.`
            : "Click up to the limit on the pitch, then confirm to activate them in order.";

  return (
    <Panel
      as="section"
      accent="gold"
      className="pointer-events-auto mt-auto max-h-[48vh] w-full max-w-sm overflow-y-auto hud-scroll p-4 animate-hud-in"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="hud-label">Kickoff</span>
          <h2 className="font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-gold">
            {step.event}
          </h2>
          <p className="mt-1 text-hud-sm text-hud-bone/75">
            {KICKOFF_EVENT_MEANING[step.event]}
          </p>
        </div>
        <Chip tone="gold" className="shrink-0 !text-hud-sm">
          {selected.size}/{step.selectionLimit}
        </Chip>
      </div>

      <p className="mt-3 rounded-hud border-l-[3px] border-hud-gold bg-white/5 px-3 py-2 text-hud-sm text-hud-bone">
        {canAct ? instruction : `Waiting for ${team.name}'s coach…`}
      </p>

      {/* Skip/Confirm are the deciding coach's controls only — the other
          coach is a passive spectator for this step and just watches the
          result play out live on the board. */}
      {canAct && (
        <div className="mt-4 flex justify-end gap-2">
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
              disabled={awaiting.size > 0}
              onClick={() => {
                service.confirmKickoffEventStep();
                refresh();
              }}
            >
              Confirm
            </HudButton>
          )}
        </div>
      )}
    </Panel>
  );
}
