/**
 * League winnings: the first step of the post-game sequence ("Record
 * Outcome and Winnings", Blood Bowl Second Season rulebook). The spec is
 * openspec/specs/league-winnings/spec.md.
 *
 * - The Fans: each team's Fan Factor is its Dedicated Fans plus a D3.
 * - Fan Attendance is both Fan Factors added together.
 * - Each team wins (Fan Attendance / 2 + its own touchdowns) x 10,000 gp,
 *   plus 1 more if no player on the team was deemed to be Stalling during
 *   the match (2025 rulebook p.95). Nothing is rounded: an odd Fan
 *   Attendance pays a 5,000 gp half, as in the rulebook's worked example
 *   (7 / 2 + 2 + 1 = 6.5, so 65,000 gp).
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

/** One team's winnings in gold pieces; `stalled` costs the +1 for not Stalling. */
export function winningsFor(
  fanAttendance: number,
  touchdowns: number,
  stalled: boolean
): number {
  return Math.round(
    (fanAttendance / 2 + touchdowns + (stalled ? 0 : 1)) * WINNINGS_MULTIPLIER
  );
}

/** What a played league fixture pays, recorded on its result. */
export interface FixtureWinnings {
  /** Each side's Fan Factor for the game. */
  fanFactor: { home: number; away: number };
  /** Gold pieces each side won. */
  home: number;
  away: number;
}

/**
 * Both sides' winnings from their Fan Factors and touchdowns, and whether
 * each had a player deemed to be Stalling (GameState.stallingPlayerIds).
 */
export function fixtureWinnings(
  fanFactors: { home: number; away: number },
  homeTouchdowns: number,
  awayTouchdowns: number,
  stalled: { home: boolean; away: boolean }
): FixtureWinnings {
  const attendance = fanFactors.home + fanFactors.away;
  return {
    fanFactor: { ...fanFactors },
    home: winningsFor(attendance, homeTouchdowns, stalled.home),
    away: winningsFor(attendance, awayTouchdowns, stalled.away),
  };
}

/** Whether each side fielded a player deemed to be Stalling this match. */
export function stalledSides(
  stallingPlayerIds: readonly string[] | undefined,
  home: Pick<Team, "players">,
  away: Pick<Team, "players">
): { home: boolean; away: boolean } {
  const stalled = (team: Pick<Team, "players">) =>
    team.players.some((player) => stallingPlayerIds?.includes(player.id));
  return { home: stalled(home), away: stalled(away) };
}

/** Whether a team takes winnings into its Treasury after a league game. */
export function earnsWinnings(team: Pick<Team, "advancementMode">): boolean {
  return isLeagueMode(team.advancementMode);
}

/** Add a game's winnings to the Treasury of a team that earns them. */
export function payWinnings(team: Team, winnings: number): void {
  if (!earnsWinnings(team) || winnings <= 0) return;
  team.treasury = (team.treasury ?? 0) + winnings;
}
