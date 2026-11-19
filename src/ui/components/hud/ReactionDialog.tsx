import { useLandedDecision } from "../../hooks/useDecisionRequest";
import { DecisionTeam } from "./DecisionTeam";
import type React from "react";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
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
  const { request, answer: settle } = useLandedDecision(eventBus, {
    type: "reaction",
    accepts: (data) => data.skill !== BRIBE_DECISION,
  });

  if (!request) return null;

  const answer = (accept: boolean) => {
    settle(() => {
      eventBus.emit(GameEventNames.UI_ReactionResponse, { accept });
    });
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
