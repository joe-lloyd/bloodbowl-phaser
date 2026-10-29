import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { ApothecaryDecisionRequest } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

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
    const onRequested = (
      data: ApothecaryDecisionRequest | { type: string }
    ) => {
      if (data.type === "apothecary") {
        setRequest(data as ApothecaryDecisionRequest);
      }
    };
    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type === "apothecary") setRequest(null);
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
    <DialogShell
      title="Use the Apothecary?"
      width="w-[460px]"
      actions={
        <DialogActions>
          <HudButton variant="ghost" onClick={() => answer(false)}>
            DECLINE
          </HudButton>
          <HudButton variant="gold" onClick={() => answer(true)}>
            USE APOTHECARY
          </HudButton>
        </DialogActions>
      }
    >
      <p className="font-hud-label text-hud-lg font-bold text-hud-bone">
        {player?.playerName ?? "Player"} — {resultLabel}
      </p>
      <p className="mt-2 text-hud-sm text-hud-dim">
        If used: {outcomeDescription}. The Apothecary is consumed either way
        once used.
      </p>
    </DialogShell>
  );
};
