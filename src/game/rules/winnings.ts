import { type Team, isLeagueMode } from "../../types/Team";
import type { CompetitionType } from "../../competition/types";

export function fixturePaysWinnings(
  type: CompetitionType | undefined
): boolean {
  return type === "league";
}

const WINNINGS_MULTIPLIER = 10_000;

export function rollD3(rng: { rollDie(sides: number): number }): number {
  return Math.ceil(rng.rollDie(6) / 2);
}

export function fanFactor(dedicatedFans: number, d3: number): number {
  return dedicatedFans + d3;
}

export function winningsFor(
  fanAttendance: number,
  touchdowns: number,
  stalled: boolean
): number {
  return Math.round(
    (fanAttendance / 2 + touchdowns + (stalled ? 0 : 1)) * WINNINGS_MULTIPLIER
  );
}

export interface FixtureWinnings {
  fanFactor: { home: number; away: number };

  home: number;
  away: number;
}

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

export function stalledSides(
  stallingPlayerIds: readonly string[] | undefined,
  home: Pick<Team, "players">,
  away: Pick<Team, "players">
): { home: boolean; away: boolean } {
  const stalled = (team: Pick<Team, "players">) =>
    team.players.some((player) => stallingPlayerIds?.includes(player.id));
  return { home: stalled(home), away: stalled(away) };
}

export function earnsWinnings(team: Pick<Team, "advancementMode">): boolean {
  return isLeagueMode(team.advancementMode);
}

export function payWinnings(team: Team, winnings: number): void {
  if (!earnsWinnings(team) || winnings <= 0) return;
  team.treasury = (team.treasury ?? 0) + winnings;
}
