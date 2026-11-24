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

type StartLock = Pick<
  Team,
  "firstMatchPlayedAt" | "rerolls" | "dedicatedFans" | "seedMetadata"
>;

export function withStartLock<T extends StartLock>(
  team: T,
  stored: StartLock | undefined
): T {
  if (stored?.firstMatchPlayedAt === undefined) return team;
  if (team.firstMatchPlayedAt !== undefined || team.seedMetadata) return team;
  const { firstMatchPlayedAt, rerolls, dedicatedFans } = stored;
  return { ...team, firstMatchPlayedAt, rerolls, dedicatedFans };
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
