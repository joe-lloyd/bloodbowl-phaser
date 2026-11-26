import { useLandedDecision } from "../../hooks/useDecisionRequest";
import { DecisionTeam } from "./DecisionTeam";
import type { TeamRerollKind } from "../../../game/skills/RerollArbiter";
import type React from "react";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { type RerollSource } from "@/types/decisions";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

const keepRerollWhole = (label: string) => (
  <span>
    {label.split(/(RE-ROLL)/).map((part, index) =>
      part === "RE-ROLL" ? (
        <span key={index} className="whitespace-nowrap">
          {part}
        </span>
      ) : (
        part
      )
    )}
  </span>
);

interface RerollDialogProps {
  eventBus: EventBus;
}

export const RerollDialog: React.FC<RerollDialogProps> = ({ eventBus }) => {
  const { request, answer: settle } = useLandedDecision(eventBus, {
    type: "reroll",
  });

  if (!request) return null;

  const answer = (accept: boolean, source?: RerollSource) => {
    settle(() => {
      eventBus.emit(GameEventNames.UI_RerollResponse, {
        accept,
        ...(source !== undefined && { source: source }),
      });
    });
  };

  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const player = container?.gameService.getPlayerById(request.playerId);

  const arbiter = container?.gameService.getRerollArbiter();
  const teamReroll = arbiter?.nextTeamReroll(request.chooserTeamId) ?? null;
  const teamLabel = (kind: TeamRerollKind): string => {
    switch (kind) {
      case "free":
        return "USE BRILLIANT COACHING RE-ROLL";
      case "leader":
        return "USE LEADER RE-ROLL";
      case "team":
        return `USE TEAM RE-ROLL (${String(arbiter?.teamRerollsLeftFor(request.chooserTeamId) ?? 0)} left)`;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  };

  const offered = request.sources.filter(
    (source) => source !== "team" || teamReroll
  );

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="reroll-dialog"
      title="Re-roll?"
      actions={
        <DialogActions stack>
          {offered.map((source, index) => {
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
                label = "USE VETERAN RE-ROLL";
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
                  variant={offered.length === 1 ? "primary" : "secondary"}
                  block
                  hotkey={String(index + 1)}
                  onClick={() => {
                    answer(true, source);
                  }}
                >
                  {keepRerollWhole(label)}
                </HudButton>
                <SourceNeed source={source} needed={request.needed} />
              </div>
            );
          })}
          <HudButton
            data-testid="reroll-decline"
            variant="ghost"
            block
            hotkey="n"
            onClick={() => {
              answer(false);
            }}
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
        {request.needed === undefined
          ? `Rolled ${String(request.roll)}.`
          : `Needed ${String(request.needed)}+, rolled ${String(request.roll)}.`}
      </p>
    </DialogShell>
  );
};

function SourceNeed({
  source,
  needed,
}: {
  source: RerollSource;
  needed: number | undefined;
}) {
  if (source === "pro")
    return (
      <p data-testid="reroll-need-pro" className="mt-1 text-hud-sm">
        {needed === undefined
          ? "Pro needs 3+."
          : `Pro needs 3+, then ${String(needed)}+.`}{" "}
        A failed Pro check ends the re-roll.
      </p>
    );
  if (needed === undefined && source !== "veteran") return null;
  return (
    <p data-testid={`reroll-need-${source}`} className="mt-1 text-hud-sm">
      {needed !== undefined && `Needs ${String(needed)}+.`}
      {needed !== undefined && source === "veteran" && " "}
      {source === "veteran" && "Once per game."}
    </p>
  );
}
