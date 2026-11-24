import { type Team } from "../../types/Team";

export type TeamMode = "draft" | "active";

export function getTeamMode(team: Team): TeamMode {
  return team.firstMatchPlayedAt != null ? "active" : "draft";
}

export function isDraftTeam(team: Team): boolean {
  return getTeamMode(team) === "draft";
}

export function isActiveTeam(team: Team): boolean {
  return getTeamMode(team) === "active";
}

export function assertKeepsStartedTeam(
  team: Team,
  stored: Team | undefined
): void {
  if (!stored || team.seedMetadata || isActiveTeam(team)) return;
  if (isActiveTeam(stored))
    throw new Error(
      `${team.name} has played its first match since this copy was opened. Reload the team before you edit it.`
    );
}

export function stampFirstCompletedMatch(
  team: Team,
  completedAt: number = Date.now()
): void {
  if (team.firstMatchPlayedAt == null) {
    team.firstMatchPlayedAt = completedAt;
  }
}

export function backfillFirstMatchPlayedAt(
  team: Team,
  backfilledAt: number = Date.now()
): void {
  if (team.firstMatchPlayedAt != null) return;
  const hasRecordedHistory =
    (team.wins ?? 0) + (team.losses ?? 0) + (team.draws ?? 0) > 0;
  if (hasRecordedHistory) {
    team.firstMatchPlayedAt = backfilledAt;
  }
}
