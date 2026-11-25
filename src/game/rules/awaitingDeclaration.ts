import { type GameState } from "@/types/GameState";

export function mustRedeclare(
  state: Pick<GameState, "activePlayer">,
  playerId: string
): boolean {
  const active = state.activePlayer;
  return (
    active?.id === playerId && !!active.squigRageSettled && active.action === null
  );
}

export function awaitingDeclaration(
  state: Pick<GameState, "activePlayer">,
  playerId: string
): boolean {
  const active = state.activePlayer;
  return (
    active?.id === playerId &&
    (!!active.razzleDazzle?.awaitingSecond || mustRedeclare(state, playerId))
  );
}

export function rageLeavesOpen(active: GameState["activePlayer"]): boolean {
  return !!active?.squigRageSettled && !active.committed;
}

export function activationRolling(
  state: Pick<GameState, "activePlayer">,
  playerId: string
): boolean {
  const active = state.activePlayer;
  return active?.id === playerId && active.activationRollStarted === true;
}
