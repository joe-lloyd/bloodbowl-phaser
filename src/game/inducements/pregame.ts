import { GamePhase, type GameState, SubPhase } from "../../types/GameState";
import type { PregameInducementsState } from "../../types/Inducements";

const PREGAME_OPENING_SUBPHASES: readonly SubPhase[] = [
  SubPhase.INTRO,
  SubPhase.WEATHER,
  SubPhase.COIN_FLIP,
];

export function isPregameOpening(state: GameState): boolean {
  return (
    state.phase === GamePhase.SETUP &&
    state.turn.turnNumber === 0 &&
    PREGAME_OPENING_SUBPHASES.some((subPhase) => subPhase === state.subPhase)
  );
}

export function assertPregamePurchasesComplete(state: GameState): void {
  if (
    state.pregameInducements &&
    (!state.pregameInducements.complete || state.pregameInducements.resolving)
  )
    throw new Error("inducements-not-confirmed");
}

export function assertPregameSaveable(state: GameState): void {
  if (state.pregameInducements?.resolving)
    throw new Error("Finish pregame choices before saving and leaving.");
}

export function buyOrder(
  home: { id: string; value: number },
  away: { id: string; value: number }
): [string, string] {
  return away.value > home.value ? [away.id, home.id] : [home.id, away.id];
}

export function shoppingTeamId(
  pregame: PregameInducementsState | undefined,
  teamIds: readonly [string, string]
): string | null {
  const offer = pregame?.offer;
  if (!offer || pregame.complete) return null;
  const order = pregame.buyOrder ?? teamIds;
  return order.find((teamId) => offer.confirmed[teamId] !== true) ?? null;
}
