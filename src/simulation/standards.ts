import { type RosterName } from "../types/Team";
import {
  SPP_VALUES,
  type SppValues,
  sppValuesFor,
} from "../game/progression/MatchStats";
import { RACE_RATES } from "./raceRates";

export const AVERAGE_TOUCHDOWNS = 2;

const OBSERVED_RATES = Object.values(RACE_RATES);
const MEAN_TOUCHDOWNS =
  OBSERVED_RATES.reduce((sum, rate) => sum + rate.touchdowns, 0) /
  OBSERVED_RATES.length;

export interface Standard {
  touchdowns: number;

  values: SppValues;

  spp: number;
}

export function scoringSpp(
  values: SppValues,
  touchdowns: number,
  casualties: number
): number {
  const fromCasualties =
    values.casualty >= values.touchdown ? casualties * values.casualty : 0;
  return touchdowns * values.touchdown + fromCasualties;
}

export function standardFor(roster: RosterName): Standard {
  const rate = RACE_RATES[roster]?.touchdowns ?? MEAN_TOUCHDOWNS;
  const touchdowns = (AVERAGE_TOUCHDOWNS * rate) / MEAN_TOUCHDOWNS;
  return {
    touchdowns,
    values: sppValuesFor(roster),
    spp: touchdowns * SPP_VALUES.touchdown,
  };
}
