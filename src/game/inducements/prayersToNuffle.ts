/**
 * Prayers to Nuffle, the Sevens D8 table (Spike! Journal 22, rules L12 to
 * L19). Each prayer a team bought rolls once on the table; a result the team
 * already has is re-rolled, as on page 146 of the 2025 rulebook. Prayers last
 * until the end of the game. Their effects live in matchInducements.ts.
 */

import { PrayerRerollRecord, PrayerToNuffle } from "../../types/Inducements";
import { DiceController } from "../controllers/DiceController";

/** The table in roll order: index 0 is a roll of 1. */
export const PRAYER_TABLE: readonly PrayerToNuffle[] = [
  PrayerToNuffle.TREACHEROUS_TRAPDOOR,
  PrayerToNuffle.STILETTO,
  PrayerToNuffle.IRON_MAN,
  PrayerToNuffle.KNUCKLE_DUSTERS,
  PrayerToNuffle.BLESSING_OF_NUFFLE,
  PrayerToNuffle.MOLES_UNDER_THE_PITCH,
  PrayerToNuffle.UNDER_SCRUTINY,
  PrayerToNuffle.INTENSIVE_TRAINING,
];

/** Roll `count` prayers for one team, re-rolling results it already has. */
export function rollPrayersToNuffle(
  dice: DiceController,
  teamId: string,
  count: number
): PrayerRerollRecord[] {
  const records: PrayerRerollRecord[] = [];
  // A team can hold at most one of each of the eight results.
  for (let i = 0; i < Math.min(count, PRAYER_TABLE.length); i++) {
    const rejectedRolls: number[] = [];
    let result = dice.rollD8(`Prayers to Nuffle (${teamId})`, teamId);
    while (records.some((r) => r.prayer === PRAYER_TABLE[result - 1])) {
      rejectedRolls.push(result);
      result = dice.rollD8(`Prayers to Nuffle re-roll (${teamId})`, teamId);
    }
    records.push({
      teamId,
      rejectedRolls,
      result,
      prayer: PRAYER_TABLE[result - 1],
    });
  }
  return records;
}
