import type { EventBus } from "../../../services/EventBus";
import { useGameDecision } from "../../hooks/useDecisionRequest";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";
import { DecisionTeam } from "./DecisionTeam";

export function ReserveMovePrompt({ eventBus }: { eventBus: EventBus }) {
  const decision = useGameDecision(eventBus, { type: "reserve-move" });
  if (!decision) return null;
  const { request, gameService, name } = decision;
  const square = request.squares[Math.floor(request.squares.length / 2)];
  const bringOn = (playerId: string) => {
    if (!square) return;
    decision.answer(() => gameService.answerReserveMove({ playerId, square }));
  };
  return (
    <DialogShell
      placement="dock"
      testId="reserve-move-prompt"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      title="Bring on reserves?"
      actions={
        <DialogActions>
          <HudButton
            data-testid="reserve-move-done"
            variant="ghost"
            onClick={() => {
              decision.answer(() => gameService.answerReserveMove(null));
            }}
          >
            Keep in reserve
          </HudButton>
        </DialogActions>
      }
    >
      <p>
        Someone scored this turn. Each player you bring on stands on your Line
        of Scrimmage, up to 8 on the pitch.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {request.playerIds.map((playerId) => (
          <li key={playerId}>
            <HudButton
              data-testid={`reserve-move-${playerId}`}
              block
              onClick={() => {
                bringOn(playerId);
              }}
            >
              Bring on {name(playerId)}
            </HudButton>
          </li>
        ))}
      </ul>
    </DialogShell>
  );
}
