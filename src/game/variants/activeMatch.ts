import {
  DEFAULT_GAME_TYPE,
  type GameType,
  type MatchType,
} from "./gameTypes";
import {
  gameTypeRules,
  type GameTypeRules,
  matchTypeRules,
} from "./gameTypeRules";
import {
  PITCH_LAYOUTS,
  type PitchLayout,
  twoTeamFrames,
  type Venue,
} from "./pitchLayouts";
import type { Frame } from "../rules/frames";

export interface MatchFormat {
  gameType: GameType;
  venue: Venue;
}

export const SEVENS_FORMAT: MatchFormat = {
  gameType: DEFAULT_GAME_TYPE,
  venue: "stadium",
};

export const DEATHBOWL_FORMAT = {
  gameType: "deathbowl",
  venue: "deathbowl",
} as const;

export type ActiveFormat = MatchFormat | typeof DEATHBOWL_FORMAT;

const session: { active: ActiveFormat } = { active: SEVENS_FORMAT };

export function formatOf(state: {
  gameType?: MatchType;
  venue?: Venue;
}): ActiveFormat {
  const gameType = state.gameType ?? DEFAULT_GAME_TYPE;
  if (gameType === DEATHBOWL_FORMAT.gameType) return DEATHBOWL_FORMAT;
  const venue = state.venue ?? gameTypeRules(gameType).venues[0];
  return { gameType, venue };
}

export function activateStateFormat(state: {
  gameType?: MatchType;
  venue?: Venue;
}): void {
  activateMatchFormat(formatOf(state));
}

export function activateMatchFormat(format: ActiveFormat): void {
  if (!matchTypeRules(format.gameType).venues.includes(format.venue)) {
    throw new Error(`${format.venue} is not a ${format.gameType} venue.`);
  }
  session.active = format;
}

export function keepMatchFormat(format: ActiveFormat): void {
  const { active } = session;
  if (active.gameType === format.gameType && active.venue === format.venue)
    return;
  throw new Error(
    `A ${session.active.gameType} match on the ${session.active.venue} took over the rules while a ${format.gameType} match on the ${format.venue} was running.`
  );
}

export function activeMatchFormat(): ActiveFormat {
  return session.active;
}

export function activeLayout(): PitchLayout {
  return PITCH_LAYOUTS[session.active.venue];
}

export function pairFrame(isTeam1: boolean): Frame {
  const [ahead, behind] = twoTeamFrames(activeLayout());
  return isTeam1 ? ahead : behind;
}

export function activeRules(): GameTypeRules {
  return matchTypeRules(session.active.gameType);
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
