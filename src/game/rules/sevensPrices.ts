/**
 * Sevens draft prices and limits (docs/SEVENS_RULES.md D4-D7). A leaf
 * module with no imports so src/types/Team.ts can value a team without an
 * import cycle through the roster templates.
 */

/** D4: flat price at the draft and during a league, whatever the roster. */
export const TEAM_REROLL_COST = 100_000;
/** The re-roll tracker runs to 6 (P4). */
export const MAX_TEAM_REROLLS = 6;

/** D5 */
export const ASSISTANT_COACH_COST = 20_000;
export const MAX_ASSISTANT_COACHES = 3;
export const CHEERLEADER_COST = 20_000;
export const MAX_CHEERLEADERS = 3;

/** D6: only for rosters that allow one, at most one. */
export const APOTHECARY_COST = 80_000;

/** D7: league teams start on 1 and stay within 1-5. */
export const DEDICATED_FAN_COST = 20_000;
export const MAX_DEDICATED_FANS = 5;
export const MIN_DEDICATED_FANS = 1;
