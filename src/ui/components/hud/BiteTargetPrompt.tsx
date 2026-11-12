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

/** The bite the game waits on, if any: online the match's, else the engine's. */
function livePendingBite(): BiteTargetDecisionRequest | null {
  if (!ServiceContainer.isInitialized()) return null;
  const online = getActiveOnlineMatch();
  const pending = online
    ? online.pendingDecision()
    : ServiceContainer.getInstance().gameService.getDecisionService().pending();
  return pending?.type === "bite-target" ? pending : null;
}

/**
 * A failed Bloodlust player with two or more Thrall Linemen in reach: tells
 * the coach to click the one to bite. The Thralls are marked on the pitch
 * and the click is taken there (GameplayInteractionController), as a push
 * square is; this prompt only says so, and offers biting nobody.
 *
 * It stays up until the decision is resolved (or a resync replaces it):
 * online an answer is only sent, and the host may refuse it.
 */
export function BiteTargetPrompt({ eventBus }: { eventBus: EventBus }) {
  const [request, setRequest] = useState<BiteTargetDecisionRequest | null>(
    null
  );
  // "Bite nobody" was sent and has not been resolved or refused yet
  const [sent, setSent] = useState(false);
  const show = (next: BiteTargetDecisionRequest | null) => {
    setRequest(next);
    setSent(false);
  };
  useEventBus(eventBus, GameEventNames.DecisionRequested, (data) => {
    if (data.type === "bite-target") show(data);
  });
  // The other coach may be the one who answers
  useEventBus(eventBus, GameEventNames.DecisionResolved, ({ type }) => {
    if (type === "bite-target") show(null);
  });
  // A resync replaces the state without resolving: show what it waits on
  useEventBus(eventBus, GameEventNames.GameStateRestored, () =>
    show(livePendingBite())
  );
  // A refused answer leaves the bite open: offer it again, if it still is
  useEventBus(eventBus, GameEventNames.NetworkCommandRejected, (data) => {
    if (data.commandType === "choose-bite-target") show(livePendingBite());
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
    if (sent || getActiveOnlineMatch()?.mayAct() === false) return;
    // Closed by DecisionResolved, not here: online the host may refuse it
    if (gameService.answerBiteTarget(undefined)) setSent(true);
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
            disabled={sent}
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
