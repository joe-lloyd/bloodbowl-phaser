import { type PrayerRerollRecord, PrayerToNuffle } from "../../types/Inducements";
import { DiceController } from "../controllers/DiceController";

const PRAYER_TABLE: readonly PrayerToNuffle[] = [
  PrayerToNuffle.TREACHEROUS_TRAPDOOR,
  PrayerToNuffle.STILETTO,
  PrayerToNuffle.IRON_MAN,
  PrayerToNuffle.KNUCKLE_DUSTERS,
  PrayerToNuffle.BLESSING_OF_NUFFLE,
  PrayerToNuffle.MOLES_UNDER_THE_PITCH,
  PrayerToNuffle.UNDER_SCRUTINY,
  PrayerToNuffle.INTENSIVE_TRAINING,
];

export function rollPrayersToNuffle(
  dice: DiceController,
  teamId: string,
  count: number
): PrayerRerollRecord[] {
  const records: PrayerRerollRecord[] = [];

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
      prayer: prayerForRoll(result),
    });
  }
  return records;
}

function prayerForRoll(roll: number): PrayerToNuffle {
  const prayer = PRAYER_TABLE[roll - 1];
  if (prayer === undefined)
    throw new Error(`No Prayer to Nuffle for roll ${String(roll)}`);
  return prayer;
}
