import React, { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import {
  InducementChoiceDecisionAnswer,
  InducementChoiceDecisionRequest,
  InducementChoiceKind,
} from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";

interface InducementChoiceDialogProps {
  eventBus: EventBus;
}

const TITLES: Record<InducementChoiceKind, string> = {
  "iron-man": "Iron Man: +1 AV for the game",
  "knuckle-dusters": "Knuckle Dusters: Mighty Blow for the game",
  "intensive-training": "Intensive Training: pick a Primary skill",
  hangover: "Hangover: who misses the first drive?",
  "you-dope": "You Dope!: +1 ST or +1 AG for the game",
};

/**
 * A Prayer to Nuffle or Desperate Measure waiting on its coach's pick. The
 * engine is paused on this decision; each button answers it through
 * gameService.answerInducementChoice.
 */
export const InducementChoiceDialog: React.FC<InducementChoiceDialogProps> = ({
  eventBus,
}) => {
  const [request, setRequest] =
    useState<InducementChoiceDecisionRequest | null>(null);

  useEffect(() => {
    const onRequested = (
      data: InducementChoiceDecisionRequest | { type: string }
    ) => {
      if (data.type === "inducement-choice") {
        setRequest(data as InducementChoiceDecisionRequest);
      }
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
    };
  }, [eventBus]);

  if (!request || !ServiceContainer.isInitialized()) return null;
  const gameService = ServiceContainer.getInstance().gameService;
  const name = (id: string) => gameService.getPlayerById(id)?.playerName ?? id;

  const answer = (choice: InducementChoiceDecisionAnswer) => {
    // Online: only the choosing coach may answer
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (gameService.answerInducementChoice(choice)) setRequest(null);
  };

  const options: { label: string; choice: InducementChoiceDecisionAnswer }[] =
    request.playerIds.flatMap((playerId) => {
      if (request.skills) {
        return request.skills.map((skill) => ({
          label: `${name(playerId)}: ${skill}`,
          choice: { playerId, skill },
        }));
      }
      if (request.stats) {
        return request.stats.map((stat) => ({
          label: `${name(playerId)}: +1 ${stat}`,
          choice: { playerId, stat },
        }));
      }
      return [{ label: name(playerId), choice: { playerId } }];
    });

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
      <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[520px] max-h-[80vh] overflow-y-auto text-white shadow-2xl">
        <h2 className="text-xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider">
          {TITLES[request.kind]}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => (
            <button
              key={option.label}
              onClick={() => answer(option.choice)}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-bold"
            >
              {option.label}
            </button>
          ))}
        </div>
        {request.optional && (
          <button
            onClick={() => answer({})}
            className="mt-4 w-full px-3 py-2 bg-red-700 hover:bg-red-600 rounded font-bold"
          >
            Keep it for later
          </button>
        )}
      </div>
    </div>
  );
};
