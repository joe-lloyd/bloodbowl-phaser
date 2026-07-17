import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { ReactionDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

interface ReactionDialogProps {
  eventBus: EventBus;
}

/**
 * A reactive skill's yes/no question to the REACTING coach (Stand Firm
 * "refuse the push?", Wrestle "both down without armour?"). The engine is
 * paused on this decision; both buttons resolve it via UI_ReactionResponse.
 */
export const ReactionDialog: React.FC<ReactionDialogProps> = ({ eventBus }) => {
  const [request, setRequest] = useState<ReactionDecisionRequest | null>(null);

  useEffect(() => {
    const onRequested = (data: ReactionDecisionRequest | { type: string }) => {
      if (data.type === "reaction") {
        setRequest(data as ReactionDecisionRequest);
      }
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
    };
  }, [eventBus]);

  if (!request) return null;

  const answer = (accept: boolean) => {
    // Online: only the reacting coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_ReactionResponse, { accept });
    setRequest(null);
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
      <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[440px] text-white shadow-2xl">
        <h2 className="text-2xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider glow-text">
          {request.skill}
        </h2>

        <p className="text-center text-slate-300 mb-6">{request.prompt}</p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => answer(true)}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            YES
          </button>
          <button
            onClick={() => answer(false)}
            className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            NO
          </button>
        </div>
      </div>
    </div>
  );
};
