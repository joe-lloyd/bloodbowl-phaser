import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames, UIEvents } from "../../../types/events";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface ConfirmationModalProps {
  eventBus: IEventBus;
}

type ConfirmationData = UIEvents[GameEventNames.UI_RequestConfirmation];

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  eventBus,
}) => {
  const [data, setData] = useState<ConfirmationData | null>(null);

  useEventBus(eventBus, GameEventNames.UI_RequestConfirmation, (payload) => {
    setData(payload);
  });

  useEventBus(eventBus, GameEventNames.TurnEnded, () => {
    if (!data) return;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      actionId: data.actionId,
      confirmed: false,
    });
  });

  // Clear BEFORE emitting: the result handler can synchronously request the
  // next confirmation (dodge -> sprint), and a trailing setData(null) would
  // wipe that fresh dialog
  const handleConfirm = () => {
    if (!data || getActiveOnlineMatch()?.mayAct() === false) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: true,
      actionId,
    });
  };

  const handleCancel = () => {
    if (!data || getActiveOnlineMatch()?.mayAct() === false) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: false,
      actionId,
    });
  };

  if (!data || getActiveOnlineMatch()?.mayAct() === false) return null;

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={data.chooserTeamId} />}
      testId="confirmation-modal"
      tone={data.risky ? "blood" : "gold"}
      titleAs="h3"
      title={data.title}
      width="w-[420px]"
      actions={
        <DialogActions>
          <HudButton variant="ghost" onClick={handleCancel}>
            {data.cancelLabel || "Cancel"}
          </HudButton>
          <HudButton
            variant={data.risky ? "primary" : "gold"}
            onClick={handleConfirm}
          >
            {data.confirmLabel || "Confirm"}
          </HudButton>
        </DialogActions>
      }
    >
      <div className="whitespace-pre-line leading-relaxed">{data.message}</div>
    </DialogShell>
  );
};
