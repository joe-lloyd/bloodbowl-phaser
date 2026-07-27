import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAllCoachTeams,
  OwnedTeam,
} from "../../../firebase/cloudTeamRepository";
import { getTeamMode } from "../../../game/rules/teamLifecycle";
import { useAuth } from "../../hooks/useAuth";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import Parchment from "../componentWarehouse/Parchment";
import { Title } from "../componentWarehouse/Titles";

/**
 * Browse every coach's live teams directly — there is no publish step and
 * no separate copy (shared-team-library: "A coach's teams are directly
 * readable by other coaches"; "What a reader sees is current"). Reads
 * always reflect the owner's team as it stands right now.
 */
export function SharedTeamBrowser() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [teams, setTeams] = useState<OwnedTeam[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchAllCoachTeams()
      .then(setTeams)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason))
      );
  }, [user]);

  const others = teams.filter((owned) => owned.ownerUid !== user?.uid);

  return (
    <MinHeightContainer className="!justify-start">
      <Parchment $intensity="low" />
      <ContentContainer>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <Title>Other Coaches</Title>
            <p className="font-body text-bb-muted-text">
              Every coach&apos;s team is readable directly — no publishing step,
              and no snapshot to go stale. Use these to build a league or
              tournament.
            </p>
          </div>
          <Button onClick={() => navigate("/build-team")}>Your Teams</Button>
        </div>

        {!user ? (
          <p className="font-body text-xl">
            Sign in to browse other coaches&apos; teams.
          </p>
        ) : error ? (
          <p className="font-body text-bb-deep-crimson">{error}</p>
        ) : others.length === 0 ? (
          <p className="font-body text-xl italic text-bb-muted-text">
            No other coach has a team saved to the cloud yet.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {others.map(({ ownerUid, team }) => (
              <article
                key={`${ownerUid}:${team.id}`}
                className="bg-bb-warm-paper border-2 border-bb-dark-gold rounded-lg p-5 shadow-md"
              >
                <h2 className="font-heading text-2xl text-bb-blood-red">
                  {team.name}
                </h2>
                <p className="font-body">{team.rosterName}</p>
                <p className="font-body text-sm text-bb-muted-text">
                  Coach {team.coachName || "Unnamed"} · {getTeamMode(team)}
                </p>
                <div className="mt-4 border-t border-bb-divider pt-3 font-body text-sm">
                  <p>{team.players.length} players</p>
                  <p>
                    Record {team.wins}-{team.draws}-{team.losses}
                  </p>
                </div>
                <details className="mt-4">
                  <summary className="font-heading cursor-pointer">
                    View roster
                  </summary>
                  <ol className="mt-2 space-y-1 font-body text-sm">
                    {team.players.map((player) => (
                      <li key={player.id}>
                        #{player.number} {player.playerName} —{" "}
                        {player.positionName}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
          </div>
        )}

        <SecondaryButton onClick={() => navigate("/")} className="mt-8">
          Back to Menu
        </SecondaryButton>
      </ContentContainer>
    </MinHeightContainer>
  );
}
