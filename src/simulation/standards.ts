/**
 * What "good enough" means for each roster against the heuristic.
 *
 * The brief asks for about two touchdowns a game. Races do not score alike:
 * in real Blood Bowl Skaven score half as much again as Dwarfs. So the two
 * touchdowns are an average over the rosters, shared out by each race's real
 * scoring rate (raceRates.ts). Casualties count too, in the SPP the roster's
 * own rules pay. A Brawlin' Brutes team earns 3 SPP for a Casualty and only
 * 2 for a Touchdown, so for those teams casualties can stand in for a
 * touchdown it does not score.
 */

import { RosterName } from "../types/Team";
import { SppValues, sppValuesFor } from "../game/progression/MatchStats";
import { RACE_RATES } from "./raceRates";

/** The brief's touchdowns a game, averaged over every roster. */
export const AVERAGE_TOUCHDOWNS = 2;

/**
 * A Sevens side has seven players and twelve turns against the full game's
 * eleven and sixteen, so it throws about half the blocks a real team does.
 */
const SEVENS_BLOCK_SHARE = (7 / 11) * (12 / 16);

const ROSTERS = Object.values(RosterName);
const MEAN_TOUCHDOWNS =
  ROSTERS.reduce((sum, roster) => sum + RACE_RATES[roster].touchdowns, 0) /
  ROSTERS.length;

export interface Standard {
  touchdowns: number;
  casualties: number;
  /** What the roster's players earn for each. */
  values: SppValues;
  /** The SPP a game those touchdowns and casualties are worth. */
  spp: number;
}

/** SPP a game from touchdowns and casualties, at a roster's own values. */
export function scoringSpp(
  values: SppValues,
  touchdowns: number,
  casualties: number
): number {
  return touchdowns * values.touchdown + casualties * values.casualty;
}

export function standardFor(roster: RosterName): Standard {
  const rates = RACE_RATES[roster];
  const values = sppValuesFor(roster);
  const touchdowns = (AVERAGE_TOUCHDOWNS * rates.touchdowns) / MEAN_TOUCHDOWNS;
  const casualties = rates.casualties * SEVENS_BLOCK_SHARE;
  return {
    touchdowns,
    casualties,
    values,
    spp: scoringSpp(values, touchdowns, casualties),
  };
}
