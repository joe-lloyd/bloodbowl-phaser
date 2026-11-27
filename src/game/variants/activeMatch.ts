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

const session: { active: MatchFormat } = { active: SEVENS_FORMAT };

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
    throw new Error(`${format.venue} is not a ${format.gameType} venue.`);
  }
  session.active = format;
}

export function keepMatchFormat(format: MatchFormat): void {
  const { active } = session;
  if (active.gameType === format.gameType && active.venue === format.venue)
    return;
  throw new Error(
    `A ${session.active.gameType} match on the ${session.active.venue} took over the rules while a ${format.gameType} match on the ${format.venue} was running.`
  );
}

export function activeMatchFormat(): MatchFormat {
  return session.active;
}

export function activeLayout(): PitchLayout {
  return PITCH_LAYOUTS[session.active.venue];
}

export function activeRules(): GameTypeRules {
  return gameTypeRules(session.active.gameType);
}

export function matchFormatFor(
  gameType: GameType,
  random: () => number = Math.random
): MatchFormat {
  const { venues } = gameTypeRules(gameType);
  const index = Math.min(
    venues.length - 1,
    Math.floor(random() * venues.length)
  );
  return { gameType, venue: venues[index] ?? venues[0] };
}

export function withMatchFormat<T>(format: MatchFormat, run: () => T): T {
  const previous = session.active;
  activateMatchFormat(format);
  try {
    return run();
  } finally {
    session.active = previous;
  }
}
