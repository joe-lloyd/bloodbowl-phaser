import { type Team } from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { isActiveTeam } from "./teamLifecycle";
import { exceedsRosterLimit } from "./rosterLegality";

export type TeamOperation =
  | { type: "rename" }
  | { type: "change-roster-type" }
  | { type: "hire-player" }
  | { type: "fire-player"; playerId: string }
  | { type: "reorder-players" }
  | { type: "select-for-match" }
  | { type: "enter-competition" };

export interface EditDecision {
  allowed: boolean;

  reason?: string;
}

const ALLOWED: EditDecision = { allowed: true };

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
      return exceedsRosterLimit(
        team,
        getRosterByRosterName(team.rosterName),
        operation.playerId
      )
        ? ALLOWED
        : {
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
