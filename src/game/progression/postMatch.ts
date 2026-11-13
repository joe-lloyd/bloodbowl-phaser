import { calculateTeamValue, Team } from "../../types/Team";
import { offerJourneymen } from "../rules/journeymen";
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
 * Manage Team or, for a computer team, by the computer. After a league
 * fixture each Journeyman who played waits on a hiring decision there too;
 * any other Journeyman leaves now.
 */
export function recordPendingDevelopment(
  team: Team,
  matchId: string,
  /** The player this team's Raise the Dead raised, if any. */
  raisedDeadPlayerId: string | undefined,
  game: {
    /** The game was a league fixture (`GameState.paysWinnings`). */
    leagueFixture?: boolean;
    /** Who took part (MatchStats participation), when known. */
    playedIds?: ReadonlySet<string>;
  } = {}
): void {
  if (raisedDeadPlayerId) offerRaisedDeadRecruit(team, raisedDeadPlayerId);
  offerJourneymen(team, matchId, {
    leagueFixture: !!game.leagueFixture,
    playedIds: game.playedIds,
  });
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
