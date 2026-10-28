/**
 * Desperate Measures, the Sevens D8 table (Spike! Journal 22, rules L21 to
 * L28). Each one bought rolls once on the table, re-rolling duplicates, and
 * each result can be used once per game at its trigger point. Their effects
 * live in matchInducements.ts and at the trigger points it names.
 */

import { DiceController } from "../controllers/DiceController";

export enum DesperateMeasure {
  YOU_DOPE = "You Dope!",
  RAZZLE_DAZZLE = "Razzle-Dazzle",
  HANGOVER = "Hangover",
  GRUDGE_MATCH = "Grudge Match",
  SET_PIECE = "Set Piece",
  SPORTS_ESPIONAGE = "Sports Espionage",
  DISCARDED_BANANA_SKIN = "Discarded Banana Skin",
  MAGIC_SCROLL = "Magic Scroll",
}

/** The table in roll order: index 0 is a roll of 1. */
export const DESPERATE_MEASURE_TABLE: readonly DesperateMeasure[] = [
  DesperateMeasure.YOU_DOPE,
  DesperateMeasure.RAZZLE_DAZZLE,
  DesperateMeasure.HANGOVER,
  DesperateMeasure.GRUDGE_MATCH,
  DesperateMeasure.SET_PIECE,
  DesperateMeasure.SPORTS_ESPIONAGE,
  DesperateMeasure.DISCARDED_BANANA_SKIN,
  DesperateMeasure.MAGIC_SCROLL,
];

/** Roll `count` measures for one team, re-rolling results it already has. */
export function rollDesperateMeasures(
  dice: DiceController,
  teamId: string,
  count: number
): DesperateMeasure[] {
  const measures: DesperateMeasure[] = [];
  for (let i = 0; i < Math.min(count, DESPERATE_MEASURE_TABLE.length); i++) {
    let measure: DesperateMeasure;
    do {
      measure =
        DESPERATE_MEASURE_TABLE[
          dice.rollD8(`Desperate Measures (${teamId})`, teamId) - 1
        ];
    } while (measures.includes(measure));
    measures.push(measure);
  }
  return measures;
}
