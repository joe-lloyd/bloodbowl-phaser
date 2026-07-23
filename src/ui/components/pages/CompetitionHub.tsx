import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCompetitions } from "../../../competition/repository";
import { CompetitionDoc, CompetitionType } from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import Parchment from "../componentWarehouse/Parchment";
import { Title } from "../componentWarehouse/Titles";

export function CompetitionHub({ type }: { type: CompetitionType }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const label = type === "league" ? "Leagues" : "Tournaments";
  const route = type === "league" ? "leagues" : "tournaments";

  useEffect(() => {
    void listCompetitions(type, user?.uid ?? null).then(setCompetitions);
  }, [type, user]);

  return (
    <MinHeightContainer className="!justify-start">
      <Parchment $intensity="low" />
      <ContentContainer>
        <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
          <div>
            <Title>{label}</Title>
            <p className="font-body text-bb-muted-text">
              Build a competition, play its fixtures locally or online, and
              resume the season at any time.
            </p>
          </div>
          <Button onClick={() => navigate(`/${route}/new`)}>
            Create {type}
          </Button>
        </div>

        {competitions.length === 0 ? (
          <p className="font-body text-xl italic text-bb-muted-text">
            No {label.toLowerCase()} yet.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {competitions.map((competition) => (
              <button
                key={competition.id}
                onClick={() => navigate(`/${route}/${competition.id}`)}
                className="text-left bg-bb-warm-paper border-2 border-bb-dark-gold
                  rounded-lg p-5 shadow-md hover:shadow-lg transition-bb"
              >
                <span className="block font-heading text-2xl text-bb-blood-red">
                  {competition.name}
                </span>
                <span className="font-body">
                  {competition.entrants.length} teams · {competition.status}
                </span>
              </button>
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
