import { DEFAULT_GAME_TYPE, type GameType } from "./gameTypes";
import { gameTypeRules, type GameTypeRules } from "./gameTypeRules";
import { PITCH_LAYOUTS, type PitchLayout, type Venue } from "./pitchLayouts";

export interface MatchFormat {
  gameType: GameType;
  venue: Venue;
}

export const SEVENS_FORMAT: MatchFormat = {
  gameType: DEFAULT_GAME_TYPE,
  venue: "stadium",
};

let active: MatchFormat = SEVENS_FORMAT;

export function formatOf(state: {
  gameType?: GameType;
  venue?: Venue;
}): MatchFormat {
  const gameType = state.gameType ?? DEFAULT_GAME_TYPE;
  const venue = state.venue ?? gameTypeRules(gameType).venues[0];
  return { gameType, venue };
}

export function activateMatchFormat(format: MatchFormat): void {
  if (!gameTypeRules(format.gameType).venues.includes(format.venue)) {
    throw new Error(
      `${format.venue} is not a ${format.gameType} venue.`
    );
  }
  active = format;
}

export function activeMatchFormat(): MatchFormat {
  return active;
}

export function activeLayout(): PitchLayout {
  return PITCH_LAYOUTS[active.venue];
}

export function activeRules(): GameTypeRules {
  return gameTypeRules(active.gameType);
}

export function matchFormatFor(
  gameType: GameType,
  random: () => number = Math.random
): MatchFormat {
  const { venues } = gameTypeRules(gameType);
  const index = Math.min(venues.length - 1, Math.floor(random() * venues.length));
  return { gameType, venue: venues[index] ?? venues[0] };
}
