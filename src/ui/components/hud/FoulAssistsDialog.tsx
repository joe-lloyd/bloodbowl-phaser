import { useGameDecision } from "../../hooks/useDecisionRequest";
import { DecisionTeam } from "./DecisionTeam";
import type React from "react";
import type { EventBus } from "../../../services/EventBus";
import { type FoulAssistsDecisionRequest } from "@/types/decisions";
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
  const decision = useGameDecision(eventBus, { type: "foul-assists" });
  if (!decision) return null;
  const { request, gameService, name } = decision;

  const answer = (count: number) => {
    decision.answer(() => gameService.answerFoulAssists(count));
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
