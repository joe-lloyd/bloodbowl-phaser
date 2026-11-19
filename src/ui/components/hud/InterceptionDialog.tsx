import { requiredRoll } from "../../../game/rules/rollTargets";
import { useAfterDice } from "../../hooks/useAfterDice";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { interceptNeed } from "../../../game/rules/rollPreview";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
import { type DecisionRequest } from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { type InterceptionDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface InterceptionDialogProps {
  eventBus: EventBus;
}

export const InterceptionDialog: React.FC<InterceptionDialogProps> = ({
  eventBus,
}) => {
  const [pending, setRequest] = useState<InterceptionDecisionRequest | null>(
    null
  );

  useEffect(() => {
    const onRequested = (data: DecisionRequest) => {
      if (data.type === "interception") {
        setRequest(data);
      }
    };

    const onResolved = ({ type }: { type: string }) => {
      if (type === "interception") setRequest(null);
    };
    eventBus.on(GameEventNames.DecisionRequested, onRequested);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);
    return () => {
      eventBus.off(GameEventNames.DecisionRequested, onRequested);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  const request = useAfterDice(eventBus, pending);

  if (!request || getActiveOnlineMatch()?.mayAct() === false) return null;

  const respond = (playerId?: string) => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    eventBus.emit(GameEventNames.UI_InterceptionResponse, {
      ...(playerId === undefined ? {} : { playerId: playerId }),
    });
    setRequest(null);
  };

  const service = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService
    : null;
  const needed = (id: string, modifier: number) => {
    const interceptor = service?.getPlayerById(id);
    return interceptor
      ? interceptNeed(interceptor, modifier)
      : requiredRoll(3, modifier);
  };

  return (
    <InterceptionDialogView
      request={request}
      respond={respond}
      needed={needed}
    />
  );
};

interface InterceptionDialogViewProps {
  request: InterceptionDecisionRequest;
  respond: (playerId?: string) => void;
  needed: (id: string, modifier: number) => number;
}
function InterceptionDialogView({
  request,
  respond,
  needed,
}: InterceptionDialogViewProps) {
  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="interception-dialog"
      tone="blood"
      title="Interception!"
      actions={
        <DialogActions stack>
          {request.candidates.map((c, index) => {
            const name = c.playerName ?? c.playerId;
            const [, position, number] = /^(.*?)(?: (#\d+))?$/.exec(name)!;
            return (
              <HudButton
                key={c.playerId}
                variant="secondary"
                block
                className="!justify-between"
                title={name}
                {...(index < 9 ? { hotkey: String(index + 1) } : {})}
                onClick={() => {
                  respond(c.playerId);
                }}
              >
                <span className="flex min-w-0 gap-1 whitespace-nowrap">
                  <span className="truncate">{position}</span>
                  {number && <span className="shrink-0">{number}</span>}
                </span>
                <span className="shrink-0 font-hud-display text-hud-lg tabular-nums text-hud-gold">
                  {needed(c.playerId, c.modifier)}+
                </span>
              </HudButton>
            );
          })}
          <HudButton
            variant="ghost"
            block
            hotkey="n"
            onClick={() => {
              respond(undefined);
            }}
          >
            DECLINE
          </HudButton>
        </DialogActions>
      }
    >
      <p>Choose a player to attempt the interception. A miss costs nothing.</p>
    </DialogShell>
  );
}
