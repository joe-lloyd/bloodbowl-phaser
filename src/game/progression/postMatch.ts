import { calculateTeamValue, Team } from "../../types/Team";
import { offerRaisedDeadRecruit } from "../rules/raiseDead";
import { stampFirstCompletedMatch } from "../rules/teamLifecycle";
import {
  createPendingSkillSelection,
  eligibleSkillSelectionPlayers,
} from "./advancementModes";
import { mustAdvance } from "./progression";

/**
 * After a match's SPP are confirmed: record the team's mode-specific
 * development, but do not resolve it. Per team-advancement-modes, "the
 * results screen SHALL NOT require direct skill assignment": Advanced League
 * advancements and Sevens Skill Selection awards are completed later, from
 * Manage Team or, for a computer team, by the computer.
 */
export function recordPendingDevelopment(
  team: Team,
  matchId: string,
  /** The player this team's Raise the Dead raised, if any. */
  raisedDeadPlayerId: string | undefined
): void {
  if (raisedDeadPlayerId) offerRaisedDeadRecruit(team, raisedDeadPlayerId);
  if (team.advancementMode === "sevens-skill-selection") {
    const eligible = eligibleSkillSelectionPlayers(team);
    if (eligible.length > 0) {
      createPendingSkillSelection(team, matchId, eligible);
    }
  } else if (
    !team.advancementMode ||
    team.advancementMode === "advanced-league"
  ) {
    team.players.filter(mustAdvance).forEach((player) => {
      team.pendingDevelopment ??= [];
      const already = team.pendingDevelopment.some(
        (entry) =>
          entry.kind === "advanced-league-advancement" &&
          entry.playerId === player.id
      );
      if (!already) {
        team.pendingDevelopment.push({
          id: `pending-${matchId}-${player.id}`,
          kind: "advanced-league-advancement",
          playerId: player.id,
          createdAt: Date.now(),
        });
      }
    });
  }
  team.teamValue = calculateTeamValue(team);
  // A confirmed post-match result is this team's completed match — stamp
  // it active (idempotent; see teamLifecycle.ts). Abandoning before this
  // point never reaches here, so it never activates.
  stampFirstCompletedMatch(team);
}
