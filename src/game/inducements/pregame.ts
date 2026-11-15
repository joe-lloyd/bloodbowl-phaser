import { GamePhase, GameState, SubPhase } from "../../types/GameState";

export function isPregameOpening(state: GameState): boolean {
  return (
    state.phase === GamePhase.SETUP &&
    state.turn.turnNumber === 0 &&
    [SubPhase.INTRO, SubPhase.WEATHER, SubPhase.COIN_FLIP].includes(
      state.subPhase!
    )
  );
}

/** Ceremony commands must fail before changing RNG, weather or drive identity. */
export function assertPregamePurchasesComplete(state: GameState): void {
  if (
    state.pregameInducements &&
    (!state.pregameInducements.complete || state.pregameInducements.resolving)
  )
    throw new Error("inducements-not-confirmed");
}

/** Suspended pregame choices cannot be reconstructed from a save snapshot. */
export function assertPregameSaveable(state: GameState): void {
  if (state.pregameInducements?.resolving)
    throw new Error("Finish pregame choices before saving and leaving.");
}
