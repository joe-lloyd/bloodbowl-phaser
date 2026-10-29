import React, { useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface ConfirmationModalProps {
  eventBus: IEventBus;
}

interface ConfirmationData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  actionId: string; // To verify which action we are confirming
  risky?: boolean; // If true, show warning colors
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  eventBus,
}) => {
  const [data, setData] = useState<ConfirmationData | null>(null);

  useEventBus(eventBus, GameEventNames.UI_RequestConfirmation, (payload) => {
    setData(payload);
  });

  // Clear BEFORE emitting: the result handler can synchronously request the
  // next confirmation (dodge -> sprint), and a trailing setData(null) would
  // wipe that fresh dialog
  const handleConfirm = () => {
    if (!data) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: true,
      actionId,
    });
  };

  const handleCancel = () => {
    if (!data) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: false,
      actionId,
    });
  };

  if (!data) return null;

  return (
    // z-[150]: a confirmation must always sit ABOVE the block/follow-up
    // dialogs (z-[100]) — the blitz "Rush Required!" prompt fires while the
    // block dialog is open and was unreachable behind it
    <DialogShell
      zClass="z-[150]"
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
