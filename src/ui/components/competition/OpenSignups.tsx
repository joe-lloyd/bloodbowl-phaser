import { useEffect, useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import { useNavigate } from "react-router-dom";
import { listOpenCompetitions } from "../../../competition/repository";
import {
  type CompetitionDoc,
  competitionPath,
  type CompetitionType,
} from "../../../competition/types";
import { Chip, cx, hudChoiceClass, Section } from "../componentWarehouse/HudKit";

function OpenCompetitionCard({
  competition,
  onOpen,
}: {
  competition: CompetitionDoc;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="open-competition"
      onClick={onOpen}
      className={cx(hudChoiceClass(false), "flex flex-col gap-2 p-4")}
    >
      <Title level="row" as="span">
        {competition.name}
      </Title>
      <span className="flex flex-wrap gap-2">
        <Chip tone="gold">
          {competition.entrants.length} of {competition.online?.places} places
          taken
        </Chip>
        <Chip>one round every {competition.online?.roundDays} days</Chip>
      </span>
    </button>
  );
}

export function OpenSignups({
  type,
  uid,
}: {
  type: CompetitionType;
  uid: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<CompetitionDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    listOpenCompetitions(type)
      .then((found) => {
        if (!cancelled) setOpen(found);
      })
      .catch((error: unknown) => {
        console.warn("[competition] could not list open sign-ups", error);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const joinable = open.filter(
    (competition) =>
      competition.organizerUid !== uid &&
      !competition.participantUids.includes(uid)
  );
  if (joinable.length === 0) return null;
  return (
    <Section title="Open for sign-up">
      <div className="grid gap-3 md:grid-cols-2">
        {joinable.map((competition) => (
          <OpenCompetitionCard
            key={competition.id}
            competition={competition}
            onOpen={() =>
              void navigate(
                competitionPath({
                  competitionType: competition.type,
                  competitionId: competition.id,
                })
              )
            }
          />
        ))}
      </div>
    </Section>
  );
}
