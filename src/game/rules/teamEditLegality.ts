/**
 * Team edit legality — the single `canEdit(team, operation)` gate used by
 * both the Team Builder (draft) and Team Management (draft + active) so the
 * two surfaces never diverge on what a coach may currently do to a team.
 *
 * Draft teams may use every draft-only operation; once a team is active
 * (see teamLifecycle.ts) roster-type changes and draft-only edits are
 * refused, and player removal no longer refunds the purchase. Every refusal
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
  | { type: "buy-reroll" }
  | { type: "buy-apothecary" }
  | { type: "buy-dedicated-fans" }
  | { type: "buy-coach" }
  | { type: "buy-cheerleader" }
  | { type: "select-for-match" }
  | { type: "enter-competition" };

export interface EditDecision {
  allowed: boolean;
  /** Present when refused; names the exact rule enforced. */
  reason?: string;
}

const ALLOWED: EditDecision = { allowed: true };

function refuse(reason: string): EditDecision {
  return { allowed: false, reason };
}

/**
 * Structured allowed/refused result for a team-building operation. Draft
 * teams accept every operation listed here (roster completeness for
 * play/competition entry is a separate gate — see rosterLegality.ts's
 * validateRosterLegality). Active teams refuse roster-type changes and
 * draft-only edits, per the shared active-team rule.
 */
export function canEdit(team: Team, operation: TeamOperation): EditDecision {
  if (!isActiveTeam(team)) return ALLOWED;

  switch (operation.type) {
    case "change-roster-type":
      return refuse(
        "Active teams cannot change roster type once their first match is played."
      );
    case "buy-dedicated-fans":
      return refuse("Active teams cannot purchase Dedicated Fans.");
    default:
      return ALLOWED;
  }
}
