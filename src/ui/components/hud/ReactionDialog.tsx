import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { ReactionDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface ReactionDialogProps {
  eventBus: EventBus;
}

/**
 * A reactive skill's yes/no question to the REACTING coach (Stand Firm
 * "refuse the push?", Wrestle "both down without armour?"). The engine is
 * paused on this decision; both buttons resolve it via UI_ReactionResponse.
 */
export const ReactionDialog: React.FC<ReactionDialogProps> = ({ eventBus }) => {
  const [request, setRequest] = useState<ReactionDecisionRequest | null>(null);

  useEffect(() => {
    const onRequested = (data: ReactionDecisionRequest | { type: string }) => {
      if (data.type === "reaction") {
        setRequest(data as ReactionDecisionRequest);
      }
    };
    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type === "reaction") setRequest(null);
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

  const answer = (accept: boolean) => {
    // Online: only the reacting coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_ReactionResponse, { accept });
    setRequest(null);
  };

  return (
    <DialogShell
      testId="reaction-dialog"
      title={request.skill}
      actions={
        <DialogActions>
          <HudButton
            data-testid="reaction-no"
            variant="ghost"
            onClick={() => answer(false)}
          >
            NO
          </HudButton>
          <HudButton
            data-testid="reaction-yes"
            variant="gold"
            onClick={() => answer(true)}
          >
            YES
          </HudButton>
        </DialogActions>
      }
    >
      <p>{request.prompt}</p>
    </DialogShell>
  );
};
