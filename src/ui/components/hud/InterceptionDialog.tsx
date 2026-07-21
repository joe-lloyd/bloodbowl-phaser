import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { InterceptionDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

interface InterceptionDialogProps {
  eventBus: EventBus;
}

/**
 * A pass' landing square is fixed and one or more opponents lie under the
 * Range Ruler: the DEFENDING coach picks who attempts the interception, or
 * declines. The engine is paused on this decision; every button resolves it
 * via UI_InterceptionResponse (playerId chosen, or undefined to decline).
 */
export const InterceptionDialog: React.FC<InterceptionDialogProps> = ({
  eventBus,
}) => {
  const [request, setRequest] = useState<InterceptionDecisionRequest | null>(
    null
  );

  useEffect(() => {
    const onRequested = (
      data: InterceptionDecisionRequest | { type: string }
    ) => {
      if (data.type === "interception") {
        setRequest(data as InterceptionDecisionRequest);
      }
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
    };
  }, [eventBus]);

  if (!request) return null;

  const respond = (playerId?: string) => {
    // Online: only the defending coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_InterceptionResponse, { playerId });
    setRequest(null);
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
      <div className="bg-slate-900 border-2 border-red-500 rounded-lg p-6 w-[440px] text-white shadow-2xl">
        <h2 className="text-2xl font-black text-center text-red-400 mb-4 uppercase tracking-wider glow-text">
          Interception!
        </h2>

        <p className="text-center text-slate-300 mb-6">
          Choose a player to attempt the interception:
        </p>

        <div className="flex flex-col gap-3">
          {request.candidates.map((c) => (
            <button
              key={c.playerId}
              onClick={() => respond(c.playerId)}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95 flex justify-between"
            >
              <span>{c.playerName ?? c.playerId}</span>
              <span className="tabular-nums">
                {c.modifier >= 0 ? `+${c.modifier}` : c.modifier}
              </span>
            </button>
          ))}
          <button
            onClick={() => respond(undefined)}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            DECLINE
          </button>
        </div>
      </div>
    </div>
  );
};
