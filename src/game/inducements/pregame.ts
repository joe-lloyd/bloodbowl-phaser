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
 * The order the teams buy inducements in: the higher team value first, the
 * home team on a tie. Set once, with the offer.
 */
export function buyOrder(
  home: { id: string; value: number },
  away: { id: string; value: number }
): [string, string] {
  return away.value > home.value ? [away.id, home.id] : [home.id, away.id];
}

/**
 * The team buying inducements now, or null before the offer or once both
 * have confirmed. Teams buy in turn (`buyOrder`), so one coach buys at a
 * time and two coaches online never act at once.
 */
export function shoppingTeamId(
  pregame: PregameInducementsState | undefined,
  teamIds: readonly [string, string]
): string | null {
  const offer = pregame?.offer;
  if (!offer || pregame.complete) return null;
  const order = pregame.buyOrder ?? teamIds;
  return order.find((teamId) => !offer.confirmed[teamId]) ?? null;
}
