import { useNavigate } from "react-router-dom";
import type { Team } from "../../../types/Team";
import { GAME_TYPE_LABELS } from "../../../game/variants/gameTypes";
import { clubEntries } from "../../../game/rules/clubEntries";
import { inTournament } from "../../../game/rules/club";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import {
  Chip,
  cx,
  EmptyState,
  HudButton,
  hudChoiceClass,
  PageHeader,
  PageShell,
} from "../componentWarehouse/HudKit";
import { GutterProgress } from "./GutterProgress";

function competitionChip(team: Team) {
  if (!team.activeCompetitionId) return null;
  return inTournament(team) ? (
    <Chip tone="blood">In a tournament</Chip>
  ) : (
    <Chip tone="gold">In a league</Chip>
  );
}

function ClubCard({ team, onOpen }: { team: Team; onOpen: () => void }) {
  const playable = clubEntries(team).filter(
    (entry) => entry.problems.length === 0
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(hudChoiceClass(false), "flex flex-col gap-3 p-5 text-left")}
    >
      <span className="block font-hud-label text-hud-xl font-bold uppercase tracking-[0.03em] text-hud-bone">
        {team.name}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Chip tone="info">{team.rosterName}</Chip>
        {playable.map((entry) => (
          <Chip key={entry.gameType} tone="good">
            {GAME_TYPE_LABELS[entry.gameType]}
          </Chip>
        ))}
        {competitionChip(team)}
      </span>
      <GutterProgress team={team} />
    </button>
  );
}

export function ClubHub() {
  const navigate = useNavigate();
  const [library] = useTeamLibrary();
  const clubs = library.filter((team) => team.club && !team.computerCoached);
  const found = (
    <HudButton variant="primary" onClick={() => void navigate("/clubs/new")}>
      Found a club
    </HudButton>
  );
  return (
    <PageShell width="medium">
      <PageHeader
        back={{ label: "Back to Menu", onClick: () => void navigate("/") }}
        title="Clubs"
        subtitle="A club is a Core Sevens team that keeps one career across every game type. It plays Sevens, Street Bowl and Beach Bowl from the first match, and opens Gutter Bowl once its team value plus treasury reaches 750k."
        actions={clubs.length > 0 && found}
      />
      {clubs.length === 0 ? (
        <EmptyState title="No clubs yet." action={found} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clubs.map((team) => (
            <ClubCard
              key={team.id}
              team={team}
              onOpen={() => void navigate(`/clubs/${team.id}`)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
