import { type IGameService } from "@/services/interfaces/IGameService";
import { mustRedeclare } from "./awaitingDeclaration";

export function activationLost(
  gameService: Pick<
    IGameService,
    "getState" | "hasPlayerActed" | "isTurnoverInProgress"
  >,
  playerId: string
): boolean {
  if (gameService.isTurnoverInProgress()) return true;
  const state = gameService.getState();
  if (state.activePlayer?.id !== playerId)
    return gameService.hasPlayerActed(playerId);
  return (
    state.activePlayer.forcedBlock === true || mustRedeclare(state, playerId)
  );
}
