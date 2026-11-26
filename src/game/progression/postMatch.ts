import { calculateTeamValue, type Team } from "../../types/Team";
import { offerJourneymen } from "../rules/journeymen";
import { offerRaisedDeadRecruit } from "../rules/raiseDead";
import { stampFirstCompletedMatch } from "../rules/teamLifecycle";
import {
  createPendingSkillSelection,
  eligibleSkillSelectionPlayers,
} from "./advancementModes";
import { mustAdvance } from "./progression";

function queueAdvancement(
  team: Team,
  matchId: string,
  player: Team["players"][number]
): void {
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
}

export function recordPendingDevelopment(
  team: Team,
  matchId: string,

  raisedDeadPlayerId: string | undefined,
  game: {
    leagueFixture?: boolean;

    playedIds?: ReadonlySet<string>;
  } = {}
): void {
  if (raisedDeadPlayerId) offerRaisedDeadRecruit(team, raisedDeadPlayerId);
  offerJourneymen(team, matchId, {
    leagueFixture: !!game.leagueFixture,
    ...(game.playedIds === undefined ? {} : { playedIds: game.playedIds }),
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
    for (const player of team.players) {
      if (!mustAdvance(player)) continue;
      queueAdvancement(team, matchId, player);
    }
  }
  team.teamValue = calculateTeamValue(team);

  stampFirstCompletedMatch(team);
}
