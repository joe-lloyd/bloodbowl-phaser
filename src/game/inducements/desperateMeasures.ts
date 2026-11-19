import { DiceController } from "../controllers/DiceController";

export const DesperateMeasure = {
  YOU_DOPE: "You Dope!",
  RAZZLE_DAZZLE: "Razzle-Dazzle",
  HANGOVER: "Hangover",
  GRUDGE_MATCH: "Grudge Match",
  SET_PIECE: "Set Piece",
  SPORTS_ESPIONAGE: "Sports Espionage",
  DISCARDED_BANANA_SKIN: "Discarded Banana Skin",
  MAGIC_SCROLL: "Magic Scroll",
} as const;
export type DesperateMeasure =
  (typeof DesperateMeasure)[keyof typeof DesperateMeasure];

const DESPERATE_MEASURE_TABLE: readonly DesperateMeasure[] = [
  DesperateMeasure.YOU_DOPE,
  DesperateMeasure.RAZZLE_DAZZLE,
  DesperateMeasure.HANGOVER,
  DesperateMeasure.GRUDGE_MATCH,
  DesperateMeasure.SET_PIECE,
  DesperateMeasure.SPORTS_ESPIONAGE,
  DesperateMeasure.DISCARDED_BANANA_SKIN,
  DesperateMeasure.MAGIC_SCROLL,
];

export function rollDesperateMeasures(
  dice: DiceController,
  teamId: string,
  count: number
): DesperateMeasure[] {
  const measures: DesperateMeasure[] = [];
  for (let i = 0; i < Math.min(count, DESPERATE_MEASURE_TABLE.length); i++) {
    let measure: DesperateMeasure;
    do {
      measure = measureForRoll(
        dice.rollD8(`Desperate Measures (${teamId})`, teamId)
      );
    } while (measures.includes(measure));
    measures.push(measure);
  }
  return measures;
}

function measureForRoll(roll: number): DesperateMeasure {
  const measure = DESPERATE_MEASURE_TABLE[roll - 1];
  if (measure === undefined)
    throw new Error(`No Desperate Measure for roll ${String(roll)}`);
  return measure;
}
