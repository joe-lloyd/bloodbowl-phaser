/**
 * Fold a confirmed match's stats summary into each participating player's
 * lifetime `careerStats`. Called once, from the post-match confirmation flow
 * (MatchResultsScreen.confirmSpp), after `MatchStats.applySpp` — which
 * itself refuses to run twice for the same match instance
 * (`this.applied`), so a re-render or re-confirmation cannot fold twice.
 * An abandoned match never calls this, so it contributes nothing.
 */

import { EMPTY_CAREER_STATS, Player } from "../../types/Player";
import { Team } from "../../types/Team";
import { MatchStatsSummary, PlayerMatchStats } from "./MatchStats";

/**
 * A player who never took the field (`participated === false`) gets no
 * games-played increment and no other totals — the whole point of the
 * "games played" line is to count matches actually played.
 */
export function foldMatchStatsIntoCareer(
  player: Player,
  stats: PlayerMatchStats
): void {
  if (!stats.participated) return;
  const career = player.careerStats
    ? { ...player.careerStats }
    : { ...EMPTY_CAREER_STATS };
  career.matches += 1;
  career.completions += stats.completions;
  career.passesAttempted += stats.attempts;
  career.interceptions += stats.interceptions;
  career.casualties += stats.casualties;
  career.kills += stats.kills;
  career.touchdowns += stats.touchdowns;
  career.mvps += stats.mvps;
  career.squaresMoved += stats.yards;
  career.sppEarned += stats.sppEarned;
  player.careerStats = career;
}

/** Fold every participating player across both teams into their career totals. */
export function foldMatchSummaryIntoCareers(
  teams: Team[],
  summary: MatchStatsSummary
): void {
  const byId = new Map(
    teams.flatMap((team) => team.players).map((player) => [player.id, player])
  );
  summary.players.forEach((stats) => {
    const player = byId.get(stats.playerId);
    if (player) foldMatchStatsIntoCareer(player, stats);
  });
}
