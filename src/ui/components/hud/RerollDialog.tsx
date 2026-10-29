import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { RerollDecisionRequest, RerollSource } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { teamRerollsLeft } from "../../../game/teamRerolls";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface RerollDialogProps {
  eventBus: EventBus;
}

/**
 * Offers the failed roll's reroll sources (skill and/or team) to the rolling
 * coach. The engine is paused on this decision; every button resolves it via
 * UI_RerollResponse → gameService.answerReroll.
 */
export const RerollDialog: React.FC<RerollDialogProps> = ({ eventBus }) => {
  const [request, setRequest] = useState<RerollDecisionRequest | null>(null);

  useEffect(() => {
    const onRequested = (data: RerollDecisionRequest | { type: string }) => {
      if (data.type === "reroll") {
        setRequest(data as RerollDecisionRequest);
      }
    };
    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type === "reroll") setRequest(null);
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

  const answer = (accept: boolean, source?: RerollSource) => {
    // Online: only the rolling coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_RerollResponse, { accept, source });
    setRequest(null);
  };

  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const player = container?.gameService.getPlayerById(request.playerId);
  const chooserTeam = container?.gameService.getTeam(request.chooserTeamId);
  const rerollsLeft =
    container && chooserTeam
      ? teamRerollsLeft(container.gameService.getState(), chooserTeam)
      : 0;

  return (
    <DialogShell
      testId="reroll-dialog"
      title="Re-roll?"
      actions={
        <DialogActions stack>
          {request.sources.includes("skill") && (
            <HudButton
              data-testid="reroll-use-skill"
              variant="gold"
              block
              onClick={() => answer(true, "skill")}
            >
              USE {request.skill?.toUpperCase() ?? "SKILL"} RE-ROLL
            </HudButton>
          )}
          {request.sources.includes("team") && (
            <HudButton
              data-testid="reroll-use-team"
              variant="gold"
              block
              onClick={() => answer(true, "team")}
            >
              USE TEAM RE-ROLL ({rerollsLeft} left)
            </HudButton>
          )}
          {request.sources.includes("veteran") && (
            <HudButton
              data-testid="reroll-use-veteran"
              variant="secondary"
              block
              onClick={() => answer(true, "veteran")}
            >
              USE VETERAN RE-ROLL (once per game)
            </HudButton>
          )}
          <HudButton
            data-testid="reroll-decline"
            variant="ghost"
            block
            onClick={() => answer(false)}
          >
            DECLINE
          </HudButton>
        </DialogActions>
      }
    >
      <p>
        {player?.playerName ?? "Player"} failed the {request.rollKind} roll
        (rolled a {request.roll}).
      </p>
    </DialogShell>
  );
};
