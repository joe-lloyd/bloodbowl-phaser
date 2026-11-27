import { DEFAULT_GAME_TYPE, type GameType } from "./gameTypes";
import {
  gameTypeRules,
  type GameTypeRules,
  type SetupRules,
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

type DeathbowlFormat = typeof DEATHBOWL_FORMAT;

type ActiveFormat = MatchFormat | DeathbowlFormat;

const DEATHBOWL_SETUP: SetupRules = {
  maxOnPitch: 8,
  minOnLineOfScrimmage: 3,
  maxPerWideZone: 0,
};

const session: { active: ActiveFormat } = { active: SEVENS_FORMAT };

export function formatOf(state: {
  gameType?: GameType;
  venue?: Venue;
}): MatchFormat {
  const gameType = state.gameType ?? DEFAULT_GAME_TYPE;
  const venue = state.venue ?? gameTypeRules(gameType).venues[0];
  return { gameType, venue };
}

export function activateStateFormat(state: {
  gameType?: GameType;
  venue?: Venue;
}): void {
  activateMatchFormat(
    state.venue === DEATHBOWL_FORMAT.venue ? DEATHBOWL_FORMAT : formatOf(state)
  );
}

export function activateMatchFormat(format: ActiveFormat): void {
  if (
    format.gameType !== DEATHBOWL_FORMAT.gameType &&
    !gameTypeRules(format.gameType).venues.includes(format.venue)
  ) {
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

function twoTeamFormat(): MatchFormat {
  const { active } = session;
  if (active.gameType !== DEATHBOWL_FORMAT.gameType) return active;
  throw new Error("Deathbowl has no two-team match rules.");
}

export function activeMatchFormat(): MatchFormat {
  return twoTeamFormat();
}

export function activeLayout(): PitchLayout {
  return PITCH_LAYOUTS[session.active.venue];
}

export function pairFrame(isTeam1: boolean): Frame {
  const [ahead, behind] = twoTeamFrames(activeLayout());
  return isTeam1 ? ahead : behind;
}

export function activeRules(): GameTypeRules {
  return gameTypeRules(twoTeamFormat().gameType);
}

export function activeSetupRules(): SetupRules {
  return session.active.gameType === DEATHBOWL_FORMAT.gameType
    ? DEATHBOWL_SETUP
    : activeRules().setup;
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
