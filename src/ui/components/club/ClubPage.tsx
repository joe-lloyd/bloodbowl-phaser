import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Team, calculateTeamValue } from "../../../types/Team";
import { getTeamById, saveTeam } from "../../../game/managers/TeamManager";
import { inTournament, thousands } from "../../../game/rules/club";
import { clubEntries } from "../../../game/rules/clubEntries";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { errorText } from "../../errorText";
import {
  EmptyState,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
  Stat,
} from "../componentWarehouse/HudKit";
import { ClubEntryCard } from "./ClubEntryCard";
import { type ClubChange, GutterPanel } from "./GutterPanel";

function CompetitionNotice({ team }: { team: Team }) {
  if (!team.activeCompetitionId)
    return (
      <Notice tone="info">
        Not entered in a competition. The club may enter a league or a
        tournament of any game type it can play.
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

function ClubStats({ team }: { team: Team }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Stat label="Team value" value={thousands(calculateTeamValue(team))} />
      <Stat label="Treasury" value={thousands(team.treasury)} tone="gold" />
      <Stat label="Fans" value={team.dedicatedFans} />
      <Stat label="Re-rolls" value={team.rerolls} />
      <Stat
        label="W-D-L"
        value={`${String(team.wins)}-${String(team.draws)}-${String(team.losses)}`}
      />
    </div>
  );
}

function ClubBody({ team }: { team: Team }) {
  const navigate = useNavigate();
  const [, reload] = useTeamLibrary();
  const [error, setError] = useState("");

  const change = async (apply: ClubChange) => {
    const stored = getTeamById(team.id);
    if (!stored) return;
    const refusal = apply(stored);
    if (refusal) {
      setError(refusal);
      return;
    }
    try {
      await saveTeam(stored);
      setError("");
    } catch (cause) {
      setError(`The club could not be saved. ${errorText(cause)}`);
    }
    reload();
  };

  return (
    <PageShell width="wide">
      <PageHeader
        back={{ label: "Back to Clubs", onClick: () => void navigate("/clubs") }}
        eyebrow={`Club · ${team.rosterName}`}
        title={team.name}
        actions={
          <HudButton
            onClick={() =>
              void navigate(`/build-team/${team.id}?returnTo=/clubs/${team.id}`)
            }
          >
            Team sheet
          </HudButton>
        }
      />
      <ClubStats team={team} />
      <div className="mt-4">
        <CompetitionNotice team={team} />
      </div>
      {error && (
        <Notice tone="bad" role="alert" className="mt-4">
          {error}
        </Notice>
      )}
      <Section title="Game types">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {clubEntries(team).map((entry) => (
            <ClubEntryCard key={entry.gameType} team={team} entry={entry} />
          ))}
        </div>
      </Section>
      <GutterPanel team={team} onChange={(apply) => void change(apply)} />
    </PageShell>
  );
}

export function ClubPage() {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [library] = useTeamLibrary();
  const team = library.find((candidate) => candidate.id === teamId);
  if (!team?.club)
    return (
      <PageShell width="medium">
        <EmptyState
          title="This club could not be found."
          action={
            <HudButton onClick={() => void navigate("/clubs")}>
              Back to Clubs
            </HudButton>
          }
        />
      </PageShell>
    );
  return <ClubBody team={team} />;
}
