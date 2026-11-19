import { EMPTY_CAREER_STATS, type Player } from "../../types/Player";
import { type Team } from "../../types/Team";
import { type MatchStatsSummary, type PlayerMatchStats } from "./MatchStats";

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
