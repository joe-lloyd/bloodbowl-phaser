import { useEffect, useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import { competitionGameTypes } from "../../../competition/fixtureContext";
import { GameTypeName } from "../common/GameTypeBadge";
import { useNavigate } from "react-router-dom";
import { listCompetitions } from "../../../competition/repository";
import {
  type CompetitionDoc,
  type CompetitionStatus,
  type CompetitionType,
} from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import { releaseFinishedEntries } from "../../../competition/teamLocks";
import { OpenSignups } from "../competition/OpenSignups";
import {
  Chip,
  cx,
  EmptyState,
  HudButton,
  hudChoiceClass,
  type HudTone,
  PageHeader,
  PageShell,
} from "../componentWarehouse/HudKit";

const STATUS_TONE: Record<CompetitionStatus, HudTone> = {
  draft: "info",
  active: "gold",
  complete: "good",
};

function CompetitionCard({
  competition,
  onOpen,
}: {
  competition: CompetitionDoc;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={cx(hudChoiceClass(false), "flex flex-col gap-3 p-5")}
    >
      <Title level="card" as="span" className="block">
        {competition.name}
      </Title>
      <span className="flex flex-wrap items-center gap-2">
        {(competition.gameTypePool ?? competitionGameTypes(competition)).map((gameType) => (
          <Chip key={gameType} tone="info">
            <GameTypeName gameType={gameType} size={14} />
          </Chip>
        ))}
        <Chip>{competition.entrants.length} teams</Chip>
        <Chip tone={STATUS_TONE[competition.status]}>
          {competition.status === "draft" ? "sign-ups open" : competition.status}
        </Chip>
      </span>
    </button>
  );
}

export function CompetitionHub({ type }: { type: CompetitionType }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const label = type === "league" ? "Leagues" : "Tournaments";
  const route = type === "league" ? "leagues" : "tournaments";

  useEffect(() => {
    const uid = user?.uid ?? null;
    void releaseFinishedEntries()
      .catch((error: unknown) => {
        console.warn("[competition] could not release finished entries", error);
      })
      .then(() => listCompetitions(type, uid))
      .then(setCompetitions);
  }, [type, user]);

  const competitionCreateButton = (
    <HudButton variant="primary" onClick={() => navigate(`/${route}/new`)}>
      Create {type}
    </HudButton>
  );

  return (
    <PageShell width="medium">
      <PageHeader
        back={{ label: "Back to Menu", onClick: () => navigate("/") }}
        title={label}
        subtitle="Build a competition, play its fixtures locally or online, and resume the season at any time."
        actions={competitions.length > 0 && competitionCreateButton}
      />

      {user && <OpenSignups type={type} uid={user.uid} />}

      {competitions.length === 0 ? (
        <EmptyState
          title={`No ${label.toLowerCase()} yet.`}
          action={competitionCreateButton}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {competitions.map((competition) => (
            <CompetitionCard
              key={competition.id}
              competition={competition}
              onOpen={() => navigate(`/${route}/${competition.id}`)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
