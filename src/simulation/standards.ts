import { RosterName } from "../types/Team";
import {
  SPP_VALUES,
  type SppValues,
  sppValuesFor,
} from "../game/progression/MatchStats";
import { RACE_RATES } from "./raceRates";

export const AVERAGE_TOUCHDOWNS = 2;

const ROSTERS = Object.values(RosterName);
const MEAN_TOUCHDOWNS =
  ROSTERS.reduce((sum, roster) => sum + RACE_RATES[roster].touchdowns, 0) /
  ROSTERS.length;

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
  const touchdowns =
    (AVERAGE_TOUCHDOWNS * RACE_RATES[roster].touchdowns) / MEAN_TOUCHDOWNS;
  return {
    touchdowns,
    values: sppValuesFor(roster),
    spp: touchdowns * SPP_VALUES.touchdown,
  };
}
