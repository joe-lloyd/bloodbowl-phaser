import { DecisionTeam } from "./DecisionTeam";
import React, { useEffect, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import {
  type DecisionRequest,
  type FoulAssistsDecisionRequest,
} from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface FoulAssistsDialogProps {
  eventBus: EventBus;
}

export const FoulAssistsDialog: React.FC<FoulAssistsDialogProps> = ({
  eventBus,
}) => {
  const [request, setRequest] = useState<FoulAssistsDecisionRequest | null>(
    null
  );

  useEffect(() => {
    const onRequested = (data: DecisionRequest) => {
      if (data.type === "foul-assists") setRequest(data);
    };

    const onResolved = ({ type }: { type: string }) => {
      if (type === "foul-assists") setRequest(null);
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  if (
    !request ||
    !ServiceContainer.isInitialized() ||
    getActiveOnlineMatch()?.mayAct() === false
  )
    return null;
  const gameService = ServiceContainer.getInstance().gameService;
  const name = (id: string) => gameService.getPlayerById(id)?.playerName ?? id;

  const answer = (count: number) => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (gameService.answerFoulAssists(count)) setRequest(null);
  };

  const counts = Array.from({ length: request.available + 1 }, (_, i) => i);

  return (
    <FoulAssistsDialogView
      request={request}
      counts={counts}
      answer={answer}
      name={name}
    />
  );
};

interface FoulAssistsDialogViewProps {
  request: FoulAssistsDecisionRequest;
  counts: number[];
  answer: (count: number) => void;
  name: (id: string) => string;
}
function FoulAssistsDialogView({
  request,
  counts,
  answer,
  name,
}: FoulAssistsDialogViewProps) {
  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="foul-assists-dialog"
      title="Foul assists"
      actions={
        <DialogActions>
          {counts.map((count) => (
            <HudButton
              key={count}
              data-testid={`foul-assists-${String(count)}`}
              variant={count === request.available ? "gold" : "ghost"}
              {...(count <= 9 ? { hotkey: String(count) } : {})}
              onClick={() => {
                answer(count);
              }}
            >
              +{count}
            </HudButton>
          ))}
        </DialogActions>
      }
    >
      <p>
        {name(request.playerId)} fouls {name(request.targetId)}. Add how many of
        the {request.available} Offensive Assists to the Armour Roll?
      </p>
      {request.defensive > 0 && (
        <p>
          {request.defensive === 1
            ? "The 1 Defensive Assist always applies."
            : `The ${String(request.defensive)} Defensive Assists always apply.`}
        </p>
      )}
    </DialogShell>
  );
}
