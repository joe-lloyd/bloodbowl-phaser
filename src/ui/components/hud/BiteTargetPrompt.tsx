import { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { BiteTargetDecisionRequest } from "../../../types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { useEventBus } from "../../hooks/useEventBus";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";
import { DecisionTeam } from "./DecisionTeam";

/**
 * A failed Bloodlust player with two or more Thrall Linemen in reach: tells
 * the coach to click the one to bite. The Thralls are marked on the pitch
 * and the click is taken there (GameplayInteractionController), as a push
 * square is; this prompt only says so, and offers biting nobody.
 */
export function BiteTargetPrompt({ eventBus }: { eventBus: EventBus }) {
  const [request, setRequest] = useState<BiteTargetDecisionRequest | null>(
    null
  );
  useEventBus(eventBus, GameEventNames.DecisionRequested, (data) => {
    if (data.type === "bite-target") setRequest(data);
  });
  // The other coach may be the one who answers
  useEventBus(eventBus, GameEventNames.DecisionResolved, ({ type }) => {
    if (type === "bite-target") setRequest(null);
  });
  // A resync replaces the state without resolving: show what it waits on
  useEventBus(eventBus, GameEventNames.GameStateRestored, () => {
    if (!ServiceContainer.isInitialized()) return;
    const online = getActiveOnlineMatch();
    const pending = online
      ? online.pendingDecision()
      : ServiceContainer.getInstance()
          .gameService.getDecisionService()
          .pending();
    setRequest(pending?.type === "bite-target" ? pending : null);
  });

  // Online, only the biting coach sees it; the other coach has the
  // "Waiting for…" banner
  if (
    !request ||
    !ServiceContainer.isInitialized() ||
    getActiveOnlineMatch()?.mayAct() === false
  )
    return null;
  const gameService = ServiceContainer.getInstance().gameService;
  const biter = gameService.getPlayerById(request.playerId)?.playerName;

  const biteNobody = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (gameService.answerBiteTarget(undefined)) setRequest(null);
  };

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
      title="Bloodlust: choose who to bite"
      actions={
        <DialogActions>
          <HudButton
            data-testid="bite-target-none"
            variant="ghost"
            onClick={biteNobody}
          >
            Bite nobody
          </HudButton>
        </DialogActions>
      }
    >
      <p>
        {biter ?? "This player"} can bite {request.targetIds.length} Thrall
        Linemen. Click the one to bite on the pitch: they are marked in red.
      </p>
    </DialogShell>
  );
}
