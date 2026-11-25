import { useAfterDice } from "../../hooks/useAfterDice";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames, type UIEvents } from "../../../types/events";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface ConfirmationModalProps {
  eventBus: IEventBus;
}

type ConfirmationData = UIEvents[typeof GameEventNames.UI_RequestConfirmation];

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

  const handleConfirm = () => {
    if (!data || getActiveOnlineMatch()?.mayAct() === false) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: true,
      actionId,
    });
  };

  const answer = (result: { confirmed: false; alternative?: true }) => {
    if (!data || getActiveOnlineMatch()?.mayAct() === false) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      ...result,
      actionId,
    });
  };

  const shown = useAfterDice(eventBus, data);
  if (!shown || !data || getActiveOnlineMatch()?.mayAct() === false)
    return null;

  return (
    <ConfirmationModalView
      data={data}
      handleConfirm={handleConfirm}
      handleCancel={() => {
        answer({ confirmed: false });
      }}
      handleAlternative={() => {
        answer({ confirmed: false, alternative: true });
      }}
    />
  );
};

interface ConfirmationModalViewProps {
  data: ConfirmationData;
  handleConfirm: () => void;
  handleCancel: () => void;
  handleAlternative: () => void;
}
function ConfirmationModalView({
  data,
  handleConfirm,
  handleCancel,
  handleAlternative,
}: ConfirmationModalViewProps) {
  return (
    <DialogShell
      placement="dock"
      eyebrow={
        <DecisionTeam
          {...(data.chooserTeamId === undefined
            ? {}
            : { teamId: data.chooserTeamId })}
        />
      }
      testId="confirmation-modal"
      tone={data.risky ? "blood" : "gold"}
      titleAs="h3"
      title={data.title}
      actions={
        <DialogActions>
          <HudButton variant="ghost" hotkey="Escape" onClick={handleCancel}>
            {confirmationLabel(data.cancelLabel, "Cancel")}
          </HudButton>
          {data.alternativeLabel && (
            <HudButton variant="secondary" onClick={handleAlternative}>
              {data.alternativeLabel}
            </HudButton>
          )}
          <HudButton
            variant="primary"
            hotkey="Enter"
            onClick={handleConfirm}
          >
            {confirmationLabel(data.confirmLabel, "Confirm")}
          </HudButton>
        </DialogActions>
      }
    >
      <div className="whitespace-pre-line leading-relaxed">{data.message}</div>
    </DialogShell>
  );
}

function confirmationLabel(
  value: string | undefined,
  fallback: string
): string {
  return value?.length ? value : fallback;
}
