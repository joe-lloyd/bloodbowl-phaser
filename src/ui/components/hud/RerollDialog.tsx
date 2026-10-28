import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { RerollDecisionRequest, RerollSource } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { teamRerollsLeft } from "../../../game/teamRerolls";

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

  if (!request) return null;

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
    <div
      data-testid="reroll-dialog"
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto"
    >
      <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[440px] text-white shadow-2xl">
        <h2 className="text-2xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider glow-text">
          Re-roll?
        </h2>

        <p className="text-center text-slate-300 mb-6">
          {player?.playerName ?? "Player"} failed the {request.rollKind} roll
          (rolled a {request.roll}).
        </p>

        <div className="flex flex-col gap-3">
          {request.sources.includes("skill") && (
            <button
              data-testid="reroll-use-skill"
              onClick={() => answer(true, "skill")}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              USE {request.skill?.toUpperCase() ?? "SKILL"} RE-ROLL
            </button>
          )}
          {request.sources.includes("team") && (
            <button
              data-testid="reroll-use-team"
              onClick={() => answer(true, "team")}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              USE TEAM RE-ROLL ({rerollsLeft} left)
            </button>
          )}
          {request.sources.includes("veteran") && (
            <button
              data-testid="reroll-use-veteran"
              onClick={() => answer(true, "veteran")}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              USE VETERAN RE-ROLL (once per game)
            </button>
          )}
          <button
            data-testid="reroll-decline"
            onClick={() => answer(false)}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            DECLINE
          </button>
        </div>
      </div>
    </div>
  );
};
