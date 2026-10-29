import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAllCoachTeams,
  OwnedTeam,
} from "../../../firebase/cloudTeamRepository";
import { getTeamMode } from "../../../game/rules/teamLifecycle";
import { useAuth } from "../../hooks/useAuth";
import {
  Chip,
  EmptyState,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Panel,
} from "../componentWarehouse/HudKit";

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
    <PageShell width="wide">
      <PageHeader
        back={{ label: "Back to Menu", onClick: () => navigate("/") }}
        title="Other Coaches"
        subtitle="Every coach's team is readable directly — no publishing step, and no snapshot to go stale. Use these to build a league or tournament."
        actions={
          <HudButton variant="primary" onClick={() => navigate("/build-team")}>
            Your Teams
          </HudButton>
        }
      />

      {!user ? (
        <EmptyState title="Sign in to browse other coaches' teams." />
      ) : error ? (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      ) : others.length === 0 ? (
        <EmptyState title="No other coach has a team saved to the cloud yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {others.map(({ ownerUid, team }) => (
            <Panel as="section" key={`${ownerUid}:${team.id}`} className="p-4">
              <h2 className="truncate font-hud-label text-hud-xl font-bold uppercase tracking-[0.03em] text-hud-bone">
                {team.name}
              </h2>
              <p className="font-hud-body text-hud-sm text-hud-dim">
                {team.rosterName}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip>Coach {team.coachName || "Unnamed"}</Chip>
                <Chip tone="gold">{getTeamMode(team)}</Chip>
                <Chip>{team.players.length} players</Chip>
                <Chip>
                  Record {team.wins}-{team.draws}-{team.losses}
                </Chip>
              </div>
              <details className="mt-4 border-t border-white/10 pt-3">
                <summary className="hud-label cursor-pointer hover:text-hud-gold">
                  View roster
                </summary>
                <ol className="mt-2 space-y-1 font-hud-body text-hud-sm text-hud-bone">
                  {team.players.map((player) => (
                    <li key={player.id}>
                      <span className="tabular-nums text-hud-mute">
                        #{player.number}
                      </span>{" "}
                      {player.playerName} —{" "}
                      <span className="text-hud-dim">
                        {player.positionName}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  );
}
