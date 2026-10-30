import { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames, UIEvents } from "../../../types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useEventBus } from "../../hooks/useEventBus";
import { DialogShell } from "../componentWarehouse/HudKit";
import { DecisionTeam } from "./DecisionTeam";

export function PushChoicePrompt({ eventBus }: { eventBus: EventBus }) {
  const [push, setPush] = useState<
    UIEvents[GameEventNames.UI_SelectPushDirection] | null
  >(null);
  useEventBus(eventBus, GameEventNames.UI_SelectPushDirection, setPush);
  useEventBus(eventBus, GameEventNames.UI_PushDirectionSelected, () =>
    setPush(null)
  );
  useEventBus(eventBus, GameEventNames.DecisionResolved, ({ type }) => {
    if (type === "push-direction") setPush(null);
  });
  useEventBus(eventBus, GameEventNames.PlayerMoved, ({ playerId }) => {
    if (playerId === push?.defenderId) setPush(null);
  });
  useEventBus(
    eventBus,
    GameEventNames.PlayerPushedIntoCrowd,
    ({ playerId }) => {
      if (playerId === push?.defenderId) setPush(null);
    }
  );
  useEventBus(eventBus, GameEventNames.UI_FollowUpPrompt, () => setPush(null));
  if (!push || getActiveOnlineMatch()?.mayAct() === false) return null;
  return (
    <DialogShell
      placement="dock"
      testId="push-choice-prompt"
      eyebrow={
        <DecisionTeam teamId={push.chooserTeamId} playerId={push.attackerId} />
      }
      title="Choose a push square"
    >
      <p>Pick a highlighted square on the pitch.</p>
    </DialogShell>
  );
}
