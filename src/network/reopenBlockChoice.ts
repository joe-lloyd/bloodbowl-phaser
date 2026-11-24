import type { PendingDecision } from "../headless/protocol";
import type { IGameService } from "../services/interfaces/IGameService";
import type { IEventBus } from "../services/EventBus";
import { GameEventNames } from "../types/events";

type PendingOf<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

function showDice(
  pending: PendingOf<"block-dice">,
  engine: IGameService,
  eventBus: IEventBus
): void {
  const { chooserTeamId, options, ...choice } = pending;
  eventBus.emit(GameEventNames.BlockDiceRolled, {
    ...choice,
    numDice: options.length,
    isAttackerChoice:
      chooserTeamId === engine.getPlayerById(pending.attackerId)?.teamId,
    results: options,
    shownAgain: true,
  });
}

function showPush(
  pending: PendingOf<"push-direction">,
  eventBus: IEventBus
): void {
  const { options, ...push } = pending;
  eventBus.emit(GameEventNames.UI_SelectPushDirection, {
    ...push,
    validDirections: options,
    canFollowUp: true,
  });
}

export function reopenBlockChoice(
  pending: PendingDecision | null,
  engine: IGameService,
  eventBus: IEventBus
): void {
  if (pending?.type === "block-dice") showDice(pending, engine, eventBus);
  if (pending?.type === "push-direction") showPush(pending, eventBus);
  if (pending?.type === "follow-up")
    eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: pending.attackerId,
      targetSquare: pending.targetSquare,
    });
}
