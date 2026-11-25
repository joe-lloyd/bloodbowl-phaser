import { useLandedDecision } from "../../hooks/useDecisionRequest";
import { DecisionTeam } from "./DecisionTeam";
import type React from "react";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { type ApothecaryDecisionRequest } from "@/types/decisions";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface ApothecaryDialogProps {
  eventBus: EventBus;
}

export const ApothecaryDialog: React.FC<ApothecaryDialogProps> = ({
  eventBus,
}) => {
  const { request, answer: settle } = useLandedDecision(eventBus, {
    type: "apothecary",
  });

  if (!request) return null;

  const answer = (accept: boolean) => {
    settle(() => {
      eventBus.emit(GameEventNames.UI_ApothecaryResponse, { accept });
    });
  };

  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const player = container?.gameService.getPlayerById(request.playerId);

  const playerName = player?.playerName ?? "Player";
  return (
    <ApothecaryView request={request} answer={answer} playerName={playerName} />
  );
};

interface ApothecaryViewProps {
  request: ApothecaryDecisionRequest;
  answer: (accept: boolean) => void;
  playerName: string;
}
function ApothecaryView({ request, answer, playerName }: ApothecaryViewProps) {
  const resultLabel = apothecaryResultLabel(request);
  const outcomeDescription = apothecaryOutcomeDescription(request);
  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      testId="apothecary-dialog"
      title="Use the Apothecary?"
      width="w-[460px]"
      actions={<ApothecaryActions answer={answer} />}
    >
      <p className="font-hud-label text-hud-lg font-bold text-hud-bone">
        {playerName} — {resultLabel}
      </p>
      <p className="mt-2 text-hud-sm text-hud-dim">
        If used: {outcomeDescription}. The Apothecary is consumed either way
        once used.
      </p>
    </DialogShell>
  );
}
function ApothecaryActions({ answer }: { answer: (accept: boolean) => void }) {
  return (
    <DialogActions>
      <HudButton
        variant="ghost"
        hotkey="n"
        onClick={() => {
          answer(false);
        }}
      >
        DECLINE
      </HudButton>
      <HudButton
        variant="primary"
        hotkey="y"
        onClick={() => {
          answer(true);
        }}
      >
        USE APOTHECARY
      </HudButton>
    </DialogActions>
  );
}

function apothecaryResultLabel(request: ApothecaryDecisionRequest): string {
  if (request.resultKind === "ko")
    return request.location === "crowd" ? "Knocked Out (crowd)" : "Knocked Out";
  if (request.casualtyRoll) return request.casualtyRoll.grade;
  if (request.casualtyType === "dead") return "Dead";
  return request.casualtyType === "seriously-hurt"
    ? "Seriously Hurt"
    : "Badly Hurt";
}
function apothecaryOutcomeDescription(
  request: ApothecaryDecisionRequest
): string {
  if (request.resultKind !== "ko" && request.casualtyRoll)
    return "makes a second Casualty roll and keeps the better result. Badly Hurt goes to the Reserves";
  if (request.resultKind !== "ko")
    return "rolls a D6 — 4+ moves them to the Reserves, 1-3 leaves the result unchanged";
  return request.location === "crowd"
    ? "moves straight to the Reserves"
    : "stays on their square, Stunned";
}
