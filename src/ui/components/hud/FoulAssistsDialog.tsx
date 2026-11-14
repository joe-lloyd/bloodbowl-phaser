import { DecisionTeam } from "./DecisionTeam";
import React, { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { DecisionRequest, FoulAssistsDecisionRequest } from "@/types/decisions";
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

/**
 * The fouling coach declares how many Offensive Assists add +1 to the
 * Armour Roll, before it is rolled (FAQ, May 2026). Fewer assists keep a
 * Sneaky Git fouler's double from breaking armour. The engine is paused on
 * this decision; each button answers it through gameService.answerFoulAssists.
 */
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
    // The other coach may be the one who answers
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

  // Online, only the fouling coach sees it; the other coach has the
  // "Waiting for…" banner
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
              data-testid={`foul-assists-${count}`}
              variant={count === request.available ? "gold" : "ghost"}
              hotkey={count <= 9 ? String(count) : undefined}
              onClick={() => answer(count)}
            >
              +{count}
            </HudButton>
          ))}
        </DialogActions>
      }
    >
      <p>
        {name(request.playerId)} fouls {name(request.targetId)}. Add how many
        of the {request.available} Offensive Assists to the Armour Roll?
      </p>
      {request.defensive > 0 && (
        <p>
          {request.defensive === 1
            ? "The 1 Defensive Assist always applies."
            : `The ${request.defensive} Defensive Assists always apply.`}
        </p>
      )}
    </DialogShell>
  );
};
