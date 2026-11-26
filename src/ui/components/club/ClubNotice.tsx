import { useNavigate } from "react-router-dom";
import type { Team } from "../../../types/Team";
import { inTournament } from "../../../game/rules/club";
import { homeLeagueOf } from "../../../competition/homeLeague";
import { HudButton, Notice } from "../componentWarehouse/HudKit";

function CompetitionLine({ team }: { team: Team }) {
  const league = homeLeagueOf(team);
  if (!team.activeCompetitionId)
    return (
      <Notice tone="info" title="Club">
        One squad plays Sevens, Street Bowl and Beach Bowl, and Gutter Bowl
        once it opens. Its career runs through the club league, one season at
        a time.
      </Notice>
    );
  if (team.activeCompetitionId === league.leagueId)
    return (
      <Notice tone="gold" title={`Season ${String(league.season)} under way`}>
        Play the club league&apos;s fixtures from the league page. The club may
        play friendlies between fixtures.
      </Notice>
    );
  return inTournament(team) ? (
    <Notice tone="warn" title="Playing a tournament">
      A club in a tournament plays no other games, friendlies included, until
      the tournament ends.
    </Notice>
  ) : (
    <Notice tone="gold" title="Playing a league">
      The club may play friendlies between league fixtures. It cannot enter
      another competition until the league ends.
    </Notice>
  );
}

export function ClubNotice({ team }: { team: Team }) {
  const navigate = useNavigate();
  if (!team.club) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      <CompetitionLine team={team} />
      <div>
        <HudButton
          size="sm"
          onClick={() => void navigate(`/clubs/${team.id}/season`)}
        >
          Club league · season {homeLeagueOf(team).season}
        </HudButton>
      </div>
    </div>
  );
}
