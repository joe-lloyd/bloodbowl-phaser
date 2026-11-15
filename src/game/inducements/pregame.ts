import { GamePhase, GameState, SubPhase } from "../../types/GameState";
import type { PregameInducementsState } from "../../types/Inducements";

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

/**
 * The team buying inducements now, or null before the offer or once both
 * have confirmed. Teams buy in turn, the higher team value first: that team
 * has the smaller budget, and on equal budgets the home team goes first.
 * One coach buys at a time, so two coaches online never act at once.
 */
export function shoppingTeamId(
  pregame: PregameInducementsState | undefined,
  teamIds: readonly [string, string]
): string | null {
  const offer = pregame?.offer;
  if (!offer || pregame.complete) return null;
  const [home, away] = teamIds;
  const order =
    (offer.budgets[away] ?? 0) < (offer.budgets[home] ?? 0)
      ? [away, home]
      : [home, away];
  return order.find((teamId) => !offer.confirmed[teamId]) ?? null;
}
