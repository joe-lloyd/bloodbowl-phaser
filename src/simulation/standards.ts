/**
 * What "good enough" means for each roster against the heuristic.
 *
 * The brief asks for about two touchdowns a game. Races do not score alike:
 * in real Blood Bowl Skaven score half as much again as Dwarfs. So the two
 * touchdowns are an average over the rosters, shared out by each race's real
 * scoring rate (raceRates.ts). Those rates come from the eleven-player game;
 * no per-race Sevens figures are published yet.
 *
 * The bar is the SPP those touchdowns are worth at the usual 3 each. A team
 * earns towards it at its own rules' values. A Brawlin' Brutes team earns 2
 * for a Touchdown and 3 for a Casualty, so its casualties stand in for the
 * touchdowns it does not score. Other teams count touchdowns only.
 */

import { RosterName } from "../types/Team";
import {
  SPP_VALUES,
  SppValues,
  sppValuesFor,
} from "../game/progression/MatchStats";
import { RACE_RATES } from "./raceRates";

/** The brief's touchdowns a game, averaged over every roster. */
export const AVERAGE_TOUCHDOWNS = 2;

const ROSTERS = Object.values(RosterName);
const MEAN_TOUCHDOWNS =
  ROSTERS.reduce((sum, roster) => sum + RACE_RATES[roster].touchdowns, 0) /
  ROSTERS.length;

export interface Standard {
  touchdowns: number;
  /** What the roster's players earn for each. */
  values: SppValues;
  /** The SPP a game the touchdown aim is worth at the usual values. */
  spp: number;
}

/**
 * SPP a game towards the standard. Casualties count only for a team whose
 * rules pay at least as much for one as for a touchdown.
 */
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
