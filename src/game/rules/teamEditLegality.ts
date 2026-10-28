/**
 * Team edit legality — the single `canEdit(team, operation)` gate used by
 * both the Team Builder (draft) and Team Management (draft + active) so the
 * two surfaces never diverge on what a coach may currently do to a team.
 *
 * Draft teams may use every draft-only operation; once a team is active
 * (see teamLifecycle.ts) roster-type changes are refused, and so is firing a
 * player (Sevens L6). Re-rolls and Sideline Staff are on sale at the same
 * Sevens prices for draft and active teams, so their limits live in
 * teamPricing.ts; an active team can never sell them back. Every refusal
 * carries a structured reason naming the rule so the UI can render it
 * verbatim instead of inventing its own copy.
 */

import { Team } from "../../types/Team";
import { isActiveTeam } from "./teamLifecycle";

export type TeamOperation =
  | { type: "rename" }
  | { type: "change-roster-type" }
  | { type: "hire-player" }
  | { type: "fire-player" }
  | { type: "reorder-players" }
  | { type: "select-for-match" }
  | { type: "enter-competition" };

export interface EditDecision {
  allowed: boolean;
  /** Present when refused; names the exact rule enforced. */
  reason?: string;
}

const ALLOWED: EditDecision = { allowed: true };

/**
 * Structured allowed/refused result for a team-building operation. Draft
 * teams accept every operation listed here (roster completeness for
 * play/competition entry is a separate gate — see rosterLegality.ts's
 * validateRosterLegality). Active teams refuse roster-type changes.
 */
export function canEdit(team: Team, operation: TeamOperation): EditDecision {
  if (!isActiveTeam(team)) return ALLOWED;
  switch (operation.type) {
    case "change-roster-type":
      return {
        allowed: false,
        reason:
          "Active teams cannot change roster type once their first match is played.",
      };
    case "fire-player":
      return {
        allowed: false,
        reason: "Sevens teams cannot fire players after a game.",
      };
    case "rename":
    case "hire-player":
    case "reorder-players":
    case "select-for-match":
    case "enter-competition":
      return ALLOWED;
  }
}
