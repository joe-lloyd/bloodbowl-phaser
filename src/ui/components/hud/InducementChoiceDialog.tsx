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
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";

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
    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type === "inducement-choice") setRequest(null);
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
  if (
    !request ||
    !ServiceContainer.isInitialized() ||
    getActiveOnlineMatch()?.mayAct() === false
  )
    return null;
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
    <DialogShell
      title={TITLES[request.kind]}
      width="w-[520px]"
      placement="center"
      backdrop="heavy"
      className="max-h-[80vh] overflow-y-auto hud-scroll"
      actions={
        request.optional && (
          <HudButton variant="ghost" block onClick={() => answer({})}>
            Keep it for later
          </HudButton>
        )
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <HudButton
            key={option.label}
            variant="secondary"
            className="!h-auto !py-2 !normal-case !tracking-normal text-left"
            onClick={() => answer(option.choice)}
          >
            {option.label}
          </HudButton>
        ))}
      </div>
    </DialogShell>
  );
};
