import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
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
  const [request, setRequest] = useState<InterceptionDecisionRequest | null>(
    null
  );

  useEffect(() => {
    const onRequested = (
      data: InterceptionDecisionRequest | { type: string }
    ) => {
      if (data.type === "interception") {
        setRequest(data as InterceptionDecisionRequest);
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

  // Online, only the coach who owns the decision sees it; the other
  // coach has the "Waiting for…" banner
  if (!request || getActiveOnlineMatch()?.mayAct() === false) return null;

  const respond = (playerId?: string) => {
    // Online: only the defending coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_InterceptionResponse, { playerId });
    setRequest(null);
  };

  return (
    <DialogShell
      tone="blood"
      title="Interception!"
      actions={
        <DialogActions stack>
          {request.candidates.map((c) => (
            <HudButton
              key={c.playerId}
              variant="secondary"
              block
              className="!justify-between"
              onClick={() => respond(c.playerId)}
            >
              <span className="truncate">{c.playerName ?? c.playerId}</span>
              <span className="font-hud-display text-hud-lg tabular-nums text-hud-gold">
                {c.modifier >= 0 ? `+${c.modifier}` : c.modifier}
              </span>
            </HudButton>
          ))}
          <HudButton variant="ghost" block onClick={() => respond(undefined)}>
            DECLINE
          </HudButton>
        </DialogActions>
      }
    >
      <p>Choose a player to attempt the interception:</p>
    </DialogShell>
  );
};
