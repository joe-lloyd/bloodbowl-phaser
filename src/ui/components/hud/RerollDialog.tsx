import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { RerollDecisionRequest, RerollSource } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
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
  // Name the re-roll the team button would actually spend, and drop the
  // button when there is none to spend
  const arbiter = container?.gameService.getRerollArbiter();
  const teamReroll = arbiter?.nextTeamReroll(request.chooserTeamId) ?? null;
  const teamLabel =
    teamReroll === "free"
      ? "USE BRILLIANT COACHING RE-ROLL"
      : teamReroll === "leader"
        ? "USE LEADER RE-ROLL"
        : `USE TEAM RE-ROLL (${arbiter?.teamRerollsLeftFor(request.chooserTeamId) ?? 0} left)`;

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
          {request.sources.includes("team") && teamReroll && (
            <HudButton
              data-testid="reroll-use-team"
              variant="gold"
              block
              onClick={() => answer(true, "team")}
            >
              {teamLabel}
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
