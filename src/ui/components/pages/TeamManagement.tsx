import { useNavigate } from "react-router-dom";
import { Team } from "../../../types/Team";
import {
  deleteTeam,
  seedAllRosterTeams,
  deleteAllSeedTeams,
} from "../../../game/managers/TeamManager";
import { getTeamMode } from "../../../game/rules/teamLifecycle";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import {
  Chip,
  EmptyState,
  Eyebrow,
  HudButton,
  PageHeader,
  PageShell,
  Panel,
} from "../componentWarehouse/HudKit";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { PendingDevelopmentPanel } from "../TeamManagement/PendingDevelopmentPanel";
import {
  numToHex,
  TeamStatsOverview,
} from "../TeamManagement/TeamStatsOverview";
import { ADVANCEMENT_MODE_SHORT_LABELS } from "../TeamBuilder/AdvancementModePanel";
import { PlayerPortrait } from "../common/PlayerPortrait";

/**
 * Team Management Component
 * Lists all teams with create/edit/delete functionality
 */
/** Draft/active mode plus shared roster legality, for the team-list badge. */
function teamStatus(team: Team): { mode: "draft" | "active"; legal: boolean } {
  const mode = getTeamMode(team);
  let legal = true;
  try {
    const roster = getRosterByRosterName(team.rosterName);
    legal =
      validateRosterLegality(team, roster).length === 0 &&
      !validateInsignificant(team.players);
  } catch {
    legal = false;
  }
  return { mode, legal };
}

export function TeamManagement() {
  const [teams, reloadTeams] = useTeamLibrary();
  const navigate = useNavigate();

  const handleCreateTeam = () => {
    navigate("/build-team/new-team");
  };

  const handleEditTeam = (teamId: string) => {
    navigate(`/build-team/${teamId}`);
  };

  const handleDeleteTeam = (teamId: string) => {
    if (confirm("Are you sure you want to delete this team?")) {
      deleteTeam(teamId);
      reloadTeams();
    }
  };

  const handleSeedTeams = () => {
    if (
      confirm("This will create sample teams for all roster types. Continue?")
    ) {
      seedAllRosterTeams();
      reloadTeams();
    }
  };

  const handleDeleteSeedTeams = () => {
    if (
      confirm(
        "This will delete all development seed teams and competitions. Continue?"
      )
    ) {
      deleteAllSeedTeams();
      reloadTeams();
    }
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <PageShell>
      <PageHeader
        back={{ label: "← Back to Menu", onClick: handleBack }}
        title="TEAM MANAGEMENT"
        subtitle="Manage your roster and prepare for the next match."
        actions={
          <>
            <div className="flex items-center gap-2 border-r border-white/10 pr-3">
              <span className="hud-label text-hud-mute">Dev</span>
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
            <HudButton onClick={() => navigate("/shared-teams")}>
              Browse Other Coaches
            </HudButton>
            <HudButton variant="primary" size="lg" onClick={handleCreateTeam}>
              + Create New Team
            </HudButton>
          </>
        }
      />

      {teams.length === 0 ? (
        <EmptyState
          title="No teams found in the archives."
          action={
            <HudButton variant="primary" onClick={handleCreateTeam}>
              Draft First Team
            </HudButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
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
                    <Chip tone={status.mode === "active" ? "gold" : "neutral"}>
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
                  </div>
                  <h3 className="mt-2 break-words font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-bone">
                    {team.name}
                  </h3>
                </div>

                <div className="rounded-hud border border-white/10 bg-black/40 p-3">
                  <Eyebrow className="mb-2 text-center">
                    Starting Lineup
                  </Eyebrow>
                  <div className="grid grid-cols-7 gap-1">
                    {team.players.slice(0, 7).map((player) => (
                      <div
                        key={player.id}
                        className="flex min-w-0 flex-col items-center"
                        title={`#${player.number} ${player.playerName} - ${player.positionName}`}
                      >
                        <div className="relative">
                          <PlayerPortrait
                            rosterName={team.rosterName}
                            positionName={player.positionName}
                            colors={team.colors}
                            size={40}
                          />
                          <span
                            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-black/60 font-hud-label text-[9px] font-bold leading-none"
                            style={{
                              backgroundColor: numToHex(team.colors.primary),
                              color: numToHex(team.colors.secondary),
                            }}
                          >
                            {player.number}
                          </span>
                        </div>
                        <span className="mt-1 w-full truncate text-center font-hud-label text-hud-2xs font-bold uppercase text-hud-mute">
                          {player.positionName.split(" ")[0]}
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
                  onChange={() => reloadTeams()}
                />

                <div className="mt-auto flex gap-2">
                  <HudButton
                    variant="gold"
                    block
                    onClick={() => handleEditTeam(team.id)}
                  >
                    Manage Team
                  </HudButton>
                  <HudButton
                    variant="danger"
                    onClick={() => handleDeleteTeam(team.id)}
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
    </PageShell>
  );
}
