/**
 * League winnings: the first step of the post-game sequence ("Record
 * Outcome and Winnings", Blood Bowl Second Season rulebook). The spec is
 * openspec/specs/league-winnings/spec.md.
 *
 * - The Fans: each team's Fan Factor is its Dedicated Fans plus a D3.
 * - Fan Attendance is both Fan Factors added together.
 * - Each team wins (Fan Attendance / 2 + its own touchdowns) x 10,000 gp.
 *   Nothing is rounded: an odd Fan Attendance pays a 5,000 gp half, as in
 *   the 2025 rulebook's worked example (7 / 2 = 3.5).
 *
 * Only league teams run the post-game sequence (`isLeagueMode`): Matched
 * Play has none and keeps no Treasury between games.
 */

import { Team, isLeagueMode } from "../../types/Team";
import type { CompetitionType } from "../../competition/types";

/**
 * Whether a fixture of this competition type pays winnings. Only a league
 * does: a tournament, and any game outside a competition, pays nothing and
 * rolls no Fan Factor. Result recording and the engine both ask this.
 */
export function fixturePaysWinnings(
  type: CompetitionType | undefined
): boolean {
  return type === "league";
}

/** Gold pieces paid per point of the winnings total. */
export const WINNINGS_MULTIPLIER = 10_000;

/** A D3 from the game's dice source: a D6 halved, rounding up. */
export function rollD3(rng: { rollDie(sides: number): number }): number {
  return Math.ceil(rng.rollDie(6) / 2);
}

/** The Fans: Dedicated Fans plus the fair-weather fans' D3. */
export function fanFactor(dedicatedFans: number, d3: number): number {
  return dedicatedFans + d3;
}

/** One team's winnings in gold pieces. */
export function winningsFor(fanAttendance: number, touchdowns: number): number {
  return Math.round((fanAttendance / 2 + touchdowns) * WINNINGS_MULTIPLIER);
}

/** What a played league fixture pays, recorded on its result. */
export interface FixtureWinnings {
  /** Each side's Fan Factor for the game. */
  fanFactor: { home: number; away: number };
  /** Gold pieces each side won. */
  home: number;
  away: number;
}

/** Both sides' winnings from their Fan Factors and touchdowns. */
export function fixtureWinnings(
  fanFactors: { home: number; away: number },
  homeTouchdowns: number,
  awayTouchdowns: number
): FixtureWinnings {
  const attendance = fanFactors.home + fanFactors.away;
  return {
    fanFactor: { ...fanFactors },
    home: winningsFor(attendance, homeTouchdowns),
    away: winningsFor(attendance, awayTouchdowns),
  };
}

/** Whether a team takes winnings into its Treasury after a league game. */
export function earnsWinnings(team: Pick<Team, "advancementMode">): boolean {
  return isLeagueMode(team.advancementMode);
}

/**
 * The entry a paid tournament prize leaves in `Team.recordedFixtureIds`, so
 * the prize is paid once however often the tournament is read or recorded.
 */
export function tournamentPrizeKey(competitionId: string): string {
  return `${competitionId}:prize`;
}

/** Whether a tournament prize, in gold pieces, is one an organizer may set. */
export function isValidPrize(prize: number): boolean {
  return Number.isSafeInteger(prize) && prize >= 0;
}

/** Add a game's winnings to the Treasury of a team that earns them. */
export function payWinnings(team: Team, winnings: number): void {
  if (!earnsWinnings(team) || winnings <= 0) return;
  team.treasury = (team.treasury ?? 0) + winnings;
}
