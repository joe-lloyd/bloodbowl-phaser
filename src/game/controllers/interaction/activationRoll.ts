import type { ActionType } from "@/types/events";
import type { GameplayInteractionController } from "../GameplayInteractionController";

export async function settleActivationRoll(
  c: GameplayInteractionController,
  playerId: string,
  action: ActionType
): Promise<boolean> {
  c.isBusy = true;
  try {
    await c.gameService.getFlowContext().flowManager.whenIdle();
    await c.dice.landed();
  } finally {
    c.isBusy = false;
  }
  const active = c.gameService.getState().activePlayer;
  return (
    active?.id === playerId &&
    active.action === action &&
    !active.forcedBlock &&
    !c.gameService.hasPlayerActed(playerId)
  );
}
