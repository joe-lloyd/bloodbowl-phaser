/**
 * Prayers to Nuffle — Sevens-specific reroll rule only.
 *
 * Implementing the full sixteen-entry Prayers to Nuffle effect table is a
 * separate, larger change (see design.md non-goals: this change does not
 * implement every inducement's mechanical effect). What Sevens changes is
 * narrower and self-contained: outside Advanced League play, results 10-13
 * are rerolled until an allowed result comes up. This function is that rule,
 * ready to be called by whatever eventually rolls the full table.
 */

import { InducementRuleProfile, PrayerRerollRecord } from "../../types/Inducements";
import { DiceController } from "../controllers/DiceController";

/** Rerolls a Prayers to Nuffle roll until it lands outside the restricted set. */
export function rollPrayerToNuffle(
  roll: () => number,
  profile: InducementRuleProfile,
  teamId: string
): PrayerRerollRecord {
  const rejectedRolls: number[] = [];
  const restricted = new Set(profile.prayersRerollResults);

  // A restricted-every-result profile would spin forever; that is a config
  // error, not a runtime one, so cap the loop rather than block a match.
  const MAX_ATTEMPTS = 64;
  let result = roll();
  let attempts = 1;
  while (restricted.has(result) && attempts < MAX_ATTEMPTS) {
    rejectedRolls.push(result);
    result = roll();
    attempts++;
  }

  return { teamId, rejectedRolls, result };
}

/**
 * Convenience wrapper that rolls through the match `DiceController` — every
 * roll (rejected or accepted) goes through the same `DiceRoll` event stream
 * as every other roll in the engine (the "operation log" design.md refers
 * to), so it is recorded and replays deterministically from a seed with no
 * extra plumbing.
 */
export function rollPrayerToNuffleViaDice(
  dice: DiceController,
  teamId: string,
  profile: InducementRuleProfile
): PrayerRerollRecord {
  return rollPrayerToNuffle(
    () => dice.rollD16(`Prayers to Nuffle (${teamId})`, teamId),
    profile,
    teamId
  );
}
