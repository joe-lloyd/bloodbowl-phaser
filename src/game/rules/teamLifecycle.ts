/**
 * Team lifecycle (draft vs active) — the single source of truth for whether
 * a team may still use draft-only operations.
 *
 * A team is "draft" until its first completed match is confirmed, and
 * "active" forever after (see overhaul-team-lifecycle-management). Mode is
 * derived from `Team.firstMatchPlayedAt`, never stored directly, so there is
 * no path that can set a team back to draft.
 */

import { Team } from "../../types/Team";

export type TeamMode = "draft" | "active";

/** Draft until the first completed match is confirmed; active thereafter. */
export function getTeamMode(team: Team): TeamMode {
  return team.firstMatchPlayedAt != null ? "active" : "draft";
}

export function isDraftTeam(team: Team): boolean {
  return getTeamMode(team) === "draft";
}

export function isActiveTeam(team: Team): boolean {
  return getTeamMode(team) === "active";
}

/**
 * Stamp a team's first completed match. A no-op once already stamped —
 * activation is permanent and idempotent. Call this only at the point a
 * match's result is actually confirmed (post-match SPP confirmation,
 * competition fixture recording); an abandoned match must never reach this
 * function, which is what keeps an abandoned draft's team in draft mode.
 */
export function stampFirstCompletedMatch(
  team: Team,
  completedAt: number = Date.now()
): void {
  if (team.firstMatchPlayedAt == null) {
    team.firstMatchPlayedAt = completedAt;
  }
}

/**
 * Backfill `firstMatchPlayedAt` for teams persisted before this field
 * existed. A team with recorded win/loss/draw history has necessarily
 * completed a match, so it is stamped active as of the backfill run; a team
 * with no recorded history is left as draft (its true first-match time is
 * unknown, but "no history" and "no first match" agree). Idempotent — a
 * team that already carries the field is left untouched.
 */
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
