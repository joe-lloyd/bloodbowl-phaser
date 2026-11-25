import { useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { type BiteTargetDecisionRequest } from "../../../types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { useEventBus } from "../../hooks/useEventBus";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";
import { DecisionTeam } from "./DecisionTeam";

function livePendingBite(): BiteTargetDecisionRequest | null {
  if (!ServiceContainer.isInitialized()) return null;
  const online = getActiveOnlineMatch();
  const pending = online
    ? online.pendingDecision()
    : ServiceContainer.getInstance().gameService.getDecisionService().pending();
  return pending?.type === BITE_TARGET ? pending : null;
}

export function BiteTargetPrompt({ eventBus }: { eventBus: EventBus }) {
  const [request, setRequest] = useState<BiteTargetDecisionRequest | null>(
    null
  );

  const [sent, setSent] = useState(false);
  const show = (next: BiteTargetDecisionRequest | null) => {
    setRequest(next);
    setSent(false);
  };
  useEventBus(eventBus, GameEventNames.DecisionRequested, (data) => {
    if (data.type === BITE_TARGET) show(data);
  });

  useEventBus(eventBus, GameEventNames.DecisionResolved, ({ type }) => {
    if (type === BITE_TARGET) show(null);
  });

  useEventBus(eventBus, GameEventNames.GameStateRestored, () => {
    show(livePendingBite());
  });

  useEventBus(eventBus, GameEventNames.NetworkCommandRejected, (data) => {
    if (data.commandType === "choose-bite-target") show(livePendingBite());
  });

  if (
    !request ||
    !ServiceContainer.isInitialized() ||
    getActiveOnlineMatch()?.mayAct() === false
  )
    return null;
  const gameService = ServiceContainer.getInstance().gameService;
  const biter = gameService.getPlayerById(request.playerId)?.playerName;

  const biteNobody = () => {
    if (sent || getActiveOnlineMatch()?.mayAct() === false) return;

    if (gameService.answerBiteTarget(undefined)) setSent(true);
  };

  return (
    <BiteTargetPromptView
      request={request}
      biter={biter}
      sent={sent}
      biteNobody={biteNobody}
    />
  );
}

interface BiteTargetPromptViewProps {
  request: BiteTargetDecisionRequest;
  biter: string | undefined;
  sent: boolean;
  biteNobody: () => void;
}
function BiteTargetPromptView({
  request,
  biter,
  sent,
  biteNobody,
}: BiteTargetPromptViewProps) {
  const copy = biteTargetCopy(request, biter);
  return (
    <DialogShell
      placement="dock"
      testId="bite-target-prompt"
      eyebrow={
        <DecisionTeam
          teamId={request.chooserTeamId}
          playerId={request.playerId}
        />
      }
      title={copy.title}
      actions={
        copy.decline && (
          <DialogActions>
            <HudButton
              data-testid="bite-target-none"
              variant="ghost"
              disabled={sent}
              onClick={biteNobody}
            >
              {copy.decline}
            </HudButton>
          </DialogActions>
        )
      }
    >
      <p>{copy.detail}</p>
    </DialogShell>
  );
}

function biteTargetCopy(
  request: BiteTargetDecisionRequest,
  biter: string | undefined
) {
  if (request.purpose === "squig-block") {
    return {
      title: "Choose an opponent for Squig Rage",
      detail: "Click a marked opponent to Block them.",
    };
  }
  if (request.purpose === "squig-knock-down") {
    return {
      title: "Choose a team-mate for Squig Rage",
      detail: "Click a marked team-mate to knock them down and continue the activation.",
      decline: "Become Distracted",
    };
  }
  return {
    title: "Bloodlust: choose who to bite",
    detail: `${biter ?? "This player"} can bite ${String(request.targetIds.length)} Thrall Linemen. Click the one to bite on the pitch: they are marked in red.`,
    decline: "Bite nobody",
  };
}

const BITE_TARGET = "bite-target";
