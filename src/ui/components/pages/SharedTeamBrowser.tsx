import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SharedTeam } from "../../../competition/types";
import { fetchSharedTeams } from "../../../firebase/sharedTeamRepository";
import { useAuth } from "../../hooks/useAuth";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import Parchment from "../componentWarehouse/Parchment";
import { Title } from "../componentWarehouse/Titles";

export function SharedTeamBrowser() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [teams, setTeams] = useState<SharedTeam[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchSharedTeams()
      .then(setTeams)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason))
      );
  }, [user]);

  return (
    <MinHeightContainer className="!justify-start">
      <Parchment $intensity="low" />
      <ContentContainer>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <Title>Shared Teams</Title>
            <p className="font-body text-bb-muted-text">
              Published roster snapshots are read-only and can be invited to a
              league or tournament.
            </p>
          </div>
          <Button onClick={() => navigate("/build-team")}>Your Teams</Button>
        </div>

        {!user ? (
          <p className="font-body text-xl">
            Sign in to browse published teams.
          </p>
        ) : error ? (
          <p className="font-body text-bb-deep-crimson">{error}</p>
        ) : teams.length === 0 ? (
          <p className="font-body text-xl italic text-bb-muted-text">
            No teams have been published yet.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((shared) => (
              <article
                key={shared.id}
                className="bg-bb-warm-paper border-2 border-bb-dark-gold rounded-lg p-5 shadow-md"
              >
                <h2 className="font-heading text-2xl text-bb-blood-red">
                  {shared.team.name}
                </h2>
                <p className="font-body">{shared.team.rosterName}</p>
                <p className="font-body text-sm text-bb-muted-text">
                  Coach {shared.ownerName}
                </p>
                <div className="mt-4 border-t border-bb-divider pt-3 font-body text-sm">
                  <p>{shared.team.players.length} players</p>
                  <p>
                    Record {shared.team.wins}-{shared.team.draws}-
                    {shared.team.losses}
                  </p>
                </div>
                <details className="mt-4">
                  <summary className="font-heading cursor-pointer">
                    View roster
                  </summary>
                  <ol className="mt-2 space-y-1 font-body text-sm">
                    {shared.team.players.map((player) => (
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
