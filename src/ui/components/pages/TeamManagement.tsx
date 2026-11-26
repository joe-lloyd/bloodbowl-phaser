import { useRef, useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import { useNavigate } from "react-router-dom";
import { type Team } from "../../../types/Team";
import {
  assertTeamLibraryLoaded,
  deleteTeam,
  getTeamById,
  seedAllRosterTeams,
  deleteAllSeedTeams,
} from "../../../game/managers/TeamManager";
import { getTeamMode } from "../../../game/rules/teamLifecycle";
import { legalGameTypes } from "../../../game/rules/rosterLegality";
import {
  teamGameType,
  teamGameTypeLabel,
} from "../../../game/rules/draftRules";
import {
  GAME_TYPE_LABELS,
  type GameType,
} from "../../../game/variants/gameTypes";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import {
  Chip,
  cx,
  hudChoiceClass,
  EmptyState,
  HudButton,
  PageHeader,
  PageShell,
  Panel,
} from "../componentWarehouse/HudKit";
import { ComputerTeamBrowser } from "../TeamManagement/ComputerTeamBrowser";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { PendingDevelopmentPanel } from "../TeamManagement/PendingDevelopmentPanel";
import {
  numToHex,
  TeamStatsOverview,
} from "../TeamManagement/TeamStatsOverview";
import { ADVANCEMENT_MODE_SHORT_LABELS } from "../TeamBuilder/AdvancementModePanel";
import { PlayerPortrait } from "../common/PlayerPortrait";
import { appearanceOf } from "../../../game/names/playerIdentity";

interface TeamStatus {
  mode: "draft" | "active";
  legal: boolean;
  alsoPlays: GameType[];
}

function teamStatus(team: Team): TeamStatus {
  const mode = getTeamMode(team);
  try {
    const roster = getRosterByRosterName(team.rosterName);
    const insignificantOk = !validateInsignificant(
      team.players,
      team.draftRuleset
    );
    const playable = insignificantOk ? legalGameTypes(team, roster) : [];
    const own = teamGameType(team);
    return {
      mode,
      legal: playable.includes(own),
      alsoPlays: playable.filter((gameType) => gameType !== own),
    };
  } catch {
    return { mode, legal: false, alsoPlays: [] };
  }
}

function GameTypeLine({ team, status }: { team: Team; status: TeamStatus }) {
  const labels = status.alsoPlays.map((gameType) => GAME_TYPE_LABELS[gameType]);
  return (
    <p className="mt-1 font-hud-body text-hud-sm text-hud-dim">
      {teamGameTypeLabel(team)} team
      {labels.length > 0 && `. Also legal for ${labels.join(", ")}`}
    </p>
  );
}

export function TeamManagement() {
  const [teams, reloadTeams] = useTeamLibrary();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"mine" | "computer">("mine");
  const mineTab = useRef<HTMLButtonElement>(null);
  const computerTab = useRef<HTMLButtonElement>(null);
  const visibleTeams = teams.filter((team) =>
    tab === "computer" ? team.computerCoached : !team.computerCoached
  );

  const handleCreateTeam = () => {
    navigate("/build-team/new-team");
  };

  const handleEditTeam = (teamId: string) => {
    navigate(`/build-team/${teamId}`);
  };

  const stillPlaying = (teamId: string): boolean => {
    const team = getTeamById(teamId);
    if (!team?.computerCoached || !team.activeCompetitionId) return false;
    alert(
      "This computer team is still playing in a competition. Delete it once the competition is over."
    );
    return true;
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (stillPlaying(teamId)) return;
    if (!confirm("Are you sure you want to delete this team?")) return;
    try {
      await deleteTeam(teamId);
      reloadTeams();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const runSeedAction = (question: string, action: () => void) => {
    try {
      assertTeamLibraryLoaded();
      if (!confirm(question)) return;
      action();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : String(reason));
    }
    reloadTeams();
  };

  const handleSeedTeams = () => {
    runSeedAction(
      "This will create sample teams for all roster types. Continue?",
      seedAllRosterTeams
    );
  };

  const handleDeleteSeedTeams = () => {
    runSeedAction(
      "This will delete all development seed teams and competitions. Continue?",
      deleteAllSeedTeams
    );
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <PageShell>
      <PageHeader
        back={{ label: "← Back to Menu", onClick: handleBack }}
        title="TEAMS"
        subtitle="Build a new team, or manage and progress the ones you have."
        actions={
          <>
            <HudButton onClick={() => navigate("/shared-teams")}>
              Browse Other Coaches
            </HudButton>
            <HudButton variant="primary" size="lg" onClick={handleCreateTeam}>
              + Create New Team
            </HudButton>
          </>
        }
      />

      <div role="tablist" aria-label="Team library" className="mb-6 flex gap-2">
        {(
          [
            { id: "mine", label: "My teams", ref: mineTab },
            { id: "computer", label: "Computer teams", ref: computerTab },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            ref={item.ref}
            id={`${item.id}-tab`}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            aria-controls={`${item.id}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            className={cx(
              hudChoiceClass(tab === item.id),
              "px-5 py-3 font-hud-label text-hud-base uppercase text-hud-bone"
            )}
            onClick={() => {
              setTab(item.id);
            }}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "mine"
                  : tab === "mine" || event.key === "End" ? "computer" : "mine";
              setTab(next);
              (next === "mine" ? mineTab : computerTab).current?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`${tab}-panel`}
        aria-labelledby={`${tab}-tab`}
      >
        {tab === "computer" && <ComputerTeamBrowser />}
        {tab === "computer" && visibleTeams.length > 0 && (
          <div className="mb-5 mt-10">
            <Title level="section" as="h2">
              Competition teams
            </Title>
            <p className="mt-2 text-hud-sm text-hud-dim">
              These saved copies keep their own results, injuries, and
              development.
            </p>
          </div>
        )}
        {visibleTeams.length === 0 ? (
          tab === "mine" && (
            <EmptyState
              title="No teams found in the archives."
              action={
                <HudButton variant="primary" onClick={handleCreateTeam}>
                  Draft First Team
                </HudButton>
              }
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visibleTeams.map((team) => {
              const status = teamStatus(team);
              return (
                <Panel
                  key={team.id}
                  accent={{ color: numToHex(team.colors.primary) }}
                  className="flex flex-col gap-4 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="hud-label mr-1">{team.rosterName}</span>
                      <Chip
                        tone={status.mode === "active" ? "gold" : "neutral"}
                      >
                        {status.mode}
                      </Chip>
                      {!status.legal && (
                        <Chip
                          tone="blood"
                          title="Not yet legal for play or competition entry"
                        >
                          Illegal
                        </Chip>
                      )}
                      {team.advancementMode && (
                        <Chip tone="info" title="Advancement mode">
                          {ADVANCEMENT_MODE_SHORT_LABELS[team.advancementMode]}
                        </Chip>
                      )}
                      {team.computerCoached && (
                        <Chip title="The computer coaches this team in leagues and cups">
                          Computer
                        </Chip>
                      )}
                    </div>
                    <Title level="card" as="h3" className="mt-2">
                      {team.name}
                    </Title>
                    <GameTypeLine team={team} status={status} />
                  </div>

                  <div className="rounded-hud border border-white/10 bg-black/40 p-3">
                    <div className="grid grid-cols-7 gap-1">
                      {team.players.slice(0, 7).map((player) => (
                        <div
                          key={player.id}
                          className="flex min-w-0 flex-col items-center"
                          title={`#${String(player.number)} ${player.playerName} - ${player.positionName}`}
                        >
                          <div className="relative">
                            <PlayerPortrait
                              rosterName={team.rosterName}
                              positionName={player.positionName}
                              colors={team.colors}
                              appearance={appearanceOf(player, team.rosterName)}
                              size={40}
                            />
                            <span
                              className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-black/60 font-hud-label text-hud-2xs font-bold leading-none"
                              style={{
                                backgroundColor: numToHex(team.colors.primary),
                                color: numToHex(team.colors.secondary),
                              }}
                            >
                              {player.number}
                            </span>
                          </div>
                          <span className="sr-only">
                            {player.positionName}
                          </span>
                        </div>
                      ))}
                      {team.players.length < 7 && (
                        <div className="col-span-full pt-1 text-center text-hud-sm text-hud-mute">
                          +{7 - team.players.length} more needed
                        </div>
                      )}
                    </div>
                  </div>

                  <TeamStatsOverview team={team} />

                  <PendingDevelopmentPanel
                    team={team}
                    onChange={() => {
                      reloadTeams();
                    }}
                  />

                  <div className="mt-auto flex gap-2">
                    <HudButton
                      variant="secondary"
                      block
                      onClick={() => {
                        handleEditTeam(team.id);
                      }}
                    >
                      Manage Team
                    </HudButton>
                    <HudButton
                      variant="danger"
                      onClick={() => void handleDeleteTeam(team.id)}
                      aria-label="Delete team"
                      title="Delete team"
                      className="shrink-0"
                    >
                      <span aria-hidden>✕</span>
                    </HudButton>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>
      {(import.meta.env.DEV || import.meta.env.MODE === "e2e") && (
        <details className="mt-10 text-hud-sm text-hud-mute">
          <summary className="cursor-pointer">Development fixtures</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <HudButton variant="ghost" size="sm" onClick={handleSeedTeams}>
              Seed All Rosters
            </HudButton>
            <HudButton
              variant="danger"
              size="sm"
              onClick={handleDeleteSeedTeams}
            >
              Delete Seed Teams
            </HudButton>
          </div>
        </details>
      )}
    </PageShell>
  );
}
