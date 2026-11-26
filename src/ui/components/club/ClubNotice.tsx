import type { Team } from "../../../types/Team";
import { inTournament } from "../../../game/rules/club";
import { Notice } from "../componentWarehouse/HudKit";

export function ClubNotice({ team }: { team: Team }) {
  if (!team.club) return null;
  if (!team.activeCompetitionId)
    return (
      <Notice tone="info" title="Club" className="mb-4">
        One squad plays Sevens, Street Bowl and Beach Bowl, and Gutter Bowl
        once it opens. The club may enter a league or a tournament of any game
        type it can play.
      </Notice>
    );
  return inTournament(team) ? (
    <Notice tone="warn" title="Playing a tournament" className="mb-4">
      A club in a tournament plays no other games, friendlies included, until
      the tournament ends.
    </Notice>
  ) : (
    <Notice tone="gold" title="Playing a league" className="mb-4">
      The club may play friendlies between league fixtures. It cannot enter
      another competition until the league ends.
    </Notice>
  );
}
