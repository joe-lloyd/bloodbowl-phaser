import { requiredRoll } from "../../../game/rules/rollTargets";
import { useAfterDice } from "../../hooks/useAfterDice";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { interceptNeed } from "../../../game/rules/rollPreview";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { DecisionRequest } from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { InterceptionDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface InterceptionDialogProps {
  eventBus: EventBus;
}

/**
 * A pass' landing square is fixed and one or more opponents lie under the
 * Range Ruler: the DEFENDING coach picks who attempts the interception, or
 * declines. The engine is paused on this decision; every button resolves it
 * via UI_InterceptionResponse (playerId chosen, or undefined to decline).
 */
export const InterceptionDialog: React.FC<InterceptionDialogProps> = ({
  eventBus,
}) => {
  const [pending, setRequest] = useState<InterceptionDecisionRequest | null>(
    null
  );

  useEffect(() => {
    const onRequested = (data: DecisionRequest) => {
      if (data.type === "interception") {
        setRequest(data);
      }
    };
    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type === "interception") setRequest(null);
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  // Hold the decision until the die it follows has landed in the tray
  const request = useAfterDice(eventBus, pending);

  // Online, only the coach who owns the decision sees it; the other
  // coach has the "Waiting for…" banner
  if (!request || getActiveOnlineMatch()?.mayAct() === false) return null;

  const respond = (playerId?: string) => {
    // Online: only the defending coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_InterceptionResponse, { playerId });
    setRequest(null);
  };

  const service = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService
    : null;
  const needed = (id: string, modifier: number) => {
    const interceptor = service?.getPlayerById(id);
    return interceptor
      ? interceptNeed(interceptor, modifier)
      : requiredRoll(3, modifier);
  };

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="interception-dialog"
      tone="blood"
      title="Interception!"
      actions={
        <DialogActions stack>
          {request.candidates.map((c) => {
            // Two Linemen differ only by number: cut the position, never it
            const name = c.playerName ?? c.playerId;
            const [, position, number] = /^(.*?)(?: (#\d+))?$/.exec(name)!;
            return (
              <HudButton
                key={c.playerId}
                variant="secondary"
                block
                className="!justify-between"
                title={name}
                onClick={() => respond(c.playerId)}
              >
                <span className="flex min-w-0 gap-1 whitespace-nowrap">
                  <span className="truncate">{position}</span>
                  {number && <span className="shrink-0">{number}</span>}
                </span>
                <span className="shrink-0 font-hud-display text-hud-lg tabular-nums text-hud-gold">
                  {needed(c.playerId, c.modifier)}+
                </span>
              </HudButton>
            );
          })}
          <HudButton variant="ghost" block onClick={() => respond(undefined)}>
            DECLINE
          </HudButton>
        </DialogActions>
      }
    >
      <p>Choose a player to attempt the interception. A miss costs nothing.</p>
    </DialogShell>
  );
};
