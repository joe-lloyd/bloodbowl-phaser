import { d6Chance, percent } from "../../../game/rules/rollOdds";
import { useAfterDice } from "../../hooks/useAfterDice";
import { DecisionTeam } from "./DecisionTeam";
import type { TeamRerollKind } from "../../../game/skills/RerollArbiter";
import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { DecisionRequest } from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { RerollDecisionRequest, RerollSource } from "@/types/decisions";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface RerollDialogProps {
  eventBus: EventBus;
}

/**
 * Offers the failed roll's reroll sources (skill and/or team) to the rolling
 * coach. The engine is paused on this decision; every button resolves it via
 * UI_RerollResponse → gameService.answerReroll.
 */
export const RerollDialog: React.FC<RerollDialogProps> = ({ eventBus }) => {
  const [pending, setRequest] = useState<RerollDecisionRequest | null>(null);

  useEffect(() => {
    const onRequested = (data: DecisionRequest) => {
      if (data.type === "reroll") {
        setRequest(data);
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

  // Hold the decision until the die it follows has landed in the tray
  const request = useAfterDice(eventBus, pending);

  // Online, only the coach who owns the decision sees it; the other
  // coach has the "Waiting for…" banner
  if (!request || getActiveOnlineMatch()?.mayAct() === false) return null;

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
  // Name the re-roll the team button would actually spend, and drop the
  // button when there is none to spend
  const arbiter = container?.gameService.getRerollArbiter();
  const teamReroll = arbiter?.nextTeamReroll(request.chooserTeamId) ?? null;
  const teamLabel = (kind: TeamRerollKind): string => {
    switch (kind) {
      case "free":
        return "USE BRILLIANT COACHING RE-ROLL";
      case "leader":
        return "USE LEADER RE-ROLL";
      case "team":
        return `USE TEAM RE-ROLL (${arbiter?.teamRerollsLeftFor(request.chooserTeamId) ?? 0} left)`;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  };

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="reroll-dialog"
      title="Re-roll?"
      actions={
        <DialogActions stack>
          {request.sources.map((source) => {
            let label: string;
            switch (source) {
              case "skill":
                label = `USE ${request.skill?.toUpperCase() ?? "SKILL"} RE-ROLL`;
                break;
              case "pro":
                label = "USE PRO RE-ROLL";
                break;
              case "team":
                if (!teamReroll) return null;
                label = teamLabel(teamReroll);
                break;
              case "veteran":
                label = "USE VETERAN RE-ROLL (once per game)";
                break;
              default: {
                const exhaustive: never = source;
                return exhaustive;
              }
            }
            return (
              <div key={source}>
                <HudButton
                  data-testid={`reroll-use-${source}`}
                  variant={source === "veteran" ? "secondary" : "gold"}
                  block
                  onClick={() => answer(true, source)}
                >
                  {label}
                </HudButton>
                {/* One number per option: the chance it recovers the roll */}
                {source === "pro" ? (
                  <p
                    data-testid="reroll-chance-pro"
                    className="mt-1 text-hud-sm"
                  >
                    {request.needed !== undefined
                      ? `Pro needs 3+, then ${request.needed}+: ${percent((d6Chance(request.needed) * 2) / 3)}.`
                      : "Pro needs 3+."}{" "}
                    A failed Pro check ends the re-roll.
                  </p>
                ) : (
                  request.needed !== undefined && (
                    <p
                      data-testid={`reroll-chance-${source}`}
                      className="mt-1 text-hud-sm"
                    >
                      {request.needed}+ to succeed:{" "}
                      {percent(d6Chance(request.needed))}.
                    </p>
                  )
                )}
              </div>
            );
          })}
          <HudButton
            data-testid="reroll-decline"
            variant="ghost"
            block
            onClick={() => answer(false)}
          >
            DECLINE
          </HudButton>
        </DialogActions>
      }
    >
      <p>
        {player?.playerName ?? "Player"} failed the{" "}
        {request.rollName ?? request.rollKind} roll.
      </p>
      <p data-testid="reroll-odds">
        {request.needed !== undefined
          ? `Needed ${request.needed}+, rolled ${request.roll}.`
          : `Rolled ${request.roll}.`}
      </p>
    </DialogShell>
  );
};
