import { DecisionTeam } from "./DecisionTeam";
import { useAfterDice } from "../../hooks/useAfterDice";
import React, { useState, useEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
import { type DecisionRequest } from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { type ReactionDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { BRIBE_DECISION } from "../../../game/inducements/bribes";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface ReactionDialogProps {
  eventBus: EventBus;
}

export const ReactionDialog: React.FC<ReactionDialogProps> = ({ eventBus }) => {
  const [pending, setRequest] = useState<ReactionDecisionRequest | null>(null);

  useEffect(() => {
    const onRequested = (data: DecisionRequest) => {
      if (data.type === "reaction" && data.skill !== BRIBE_DECISION) {
        setRequest(data);
      }
    };

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

  const request = useAfterDice(eventBus, pending);

  if (!request || getActiveOnlineMatch()?.mayAct() === false) return null;

  const answer = (accept: boolean) => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_ReactionResponse, { accept });
    setRequest(null);
  };

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="reaction-dialog"
      title={request.skill}
      actions={
        <DialogActions>
          <HudButton
            data-testid="reaction-no"
            variant="ghost"
            hotkey="n"
            onClick={() => {
              answer(false);
            }}
          >
            NO
          </HudButton>
          <HudButton
            data-testid="reaction-yes"
            variant="gold"
            hotkey="y"
            onClick={() => {
              answer(true);
            }}
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
