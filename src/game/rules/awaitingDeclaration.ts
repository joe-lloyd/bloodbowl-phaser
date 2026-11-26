import { type GameState } from "@/types/GameState";
import { type Player } from "@/types/Player";
import { kickoffTurnOf } from "@/game/kickoff/kickRecord";
import { isTurnRunning } from "@/game/kickoff/kickoffTurn";
import { ragesOnActivation } from "@/game/skills/rules/SquigRageRule";

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

export function opensWithSquigRage(
  state: Pick<GameState, "phase" | "kick" | "activePlayer">,
  squig: Player,
  teammates: Player[]
): boolean {
  return (
    isTurnRunning(state) &&
    kickoffTurnOf(state)?.play.kind !== "one-square" &&
    state.activePlayer?.id !== squig.id &&
    ragesOnActivation(squig, teammates)
  );
}
