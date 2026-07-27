import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { ApothecaryDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";

interface ApothecaryDialogProps {
  eventBus: EventBus;
}

/**
 * Offers an owned, unused Apothecary immediately after an eligible Knocked
 * Out or casualty result, before the player's final placement. The engine is
 * paused on this decision; both buttons resolve it via
 * UI_ApothecaryResponse → gameService.answerApothecary.
 */
export const ApothecaryDialog: React.FC<ApothecaryDialogProps> = ({
  eventBus,
}) => {
  const [request, setRequest] = useState<ApothecaryDecisionRequest | null>(
    null
  );

  useEffect(() => {
    const onRequested = (data: ApothecaryDecisionRequest | { type: string }) => {
      if (data.type === "apothecary") {
        setRequest(data as ApothecaryDecisionRequest);
      }
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
    };
  }, [eventBus]);

  if (!request) return null;

  const answer = (accept: boolean) => {
    // Online: only the injured player's own coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_ApothecaryResponse, { accept });
    setRequest(null);
  };

  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const player = container?.gameService.getPlayerById(request.playerId);

  const resultLabel =
    request.resultKind === "ko"
      ? request.location === "crowd"
        ? "Knocked Out (crowd)"
        : "Knocked Out"
      : request.casualtyType === "dead"
        ? "Dead"
        : request.casualtyType === "seriously-hurt"
          ? "Seriously Hurt"
          : "Badly Hurt";

  const outcomeDescription =
    request.resultKind === "ko"
      ? request.location === "crowd"
        ? "moves straight to the Reserves"
        : "stays on their square, Stunned"
      : "rolls a D6 — 4+ moves them to the Reserves, 1-3 leaves the result unchanged";

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
      <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[460px] text-white shadow-2xl">
        <h2 className="text-2xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider glow-text">
          Use the Apothecary?
        </h2>

        <p className="text-center text-slate-300 mb-2">
          {player?.playerName ?? "Player"} — {resultLabel}
        </p>
        <p className="text-center text-slate-400 text-sm mb-6">
          If used: {outcomeDescription}. The Apothecary is consumed either
          way once used.
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => answer(true)}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            USE APOTHECARY
          </button>
          <button
            onClick={() => answer(false)}
            className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            DECLINE
          </button>
        </div>
      </div>
    </div>
  );
};
