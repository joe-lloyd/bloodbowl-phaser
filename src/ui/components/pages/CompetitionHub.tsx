import { useEffect, useState } from "react";
import {
  GAME_TYPE_LABELS,
  readGameType,
} from "../../../game/variants/gameTypes";
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

  const createButton = (
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
        actions={competitions.length > 0 && createButton}
      />

      {user && <OpenSignups type={type} uid={user.uid} />}

      {competitions.length === 0 ? (
        <EmptyState
          title={`No ${label.toLowerCase()} yet.`}
          action={createButton}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {competitions.map((competition) => (
            <button
              key={competition.id}
              onClick={() => navigate(`/${route}/${competition.id}`)}
              className={cx(hudChoiceClass(false), "flex flex-col gap-3 p-5")}
            >
              <span className="block font-hud-label text-hud-xl font-bold uppercase tracking-[0.03em] text-hud-bone">
                {competition.name}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Chip tone="info">
                  {GAME_TYPE_LABELS[readGameType(competition.gameType)]}
                </Chip>
                <Chip>{competition.entrants.length} teams</Chip>
                <Chip tone={STATUS_TONE[competition.status]}>
                  {competition.status === "draft"
                    ? "sign-ups open"
                    : competition.status}
                </Chip>
              </span>
            </button>
          ))}
        </div>
      )}
    </PageShell>
  );
}
