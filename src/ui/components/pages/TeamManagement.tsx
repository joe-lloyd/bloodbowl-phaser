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
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import {
  Button,
  DangerButton,
  SecondaryButton,
} from "../componentWarehouse/Button";
import { Title } from "../componentWarehouse/Titles";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { PendingDevelopmentPanel } from "../TeamManagement/PendingDevelopmentPanel";
import { numToHex, TeamStatsOverview } from "../TeamManagement/TeamStatsOverview";
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
    <MinHeightContainer className="!justify-start">
      <Parchment $intensity="low" />

      <ContentContainer className="">
        <div className="flex justify-between items-center mb-10 flex-wrap gap-6">
          <div>
            <Title>TEAM MANAGEMENT</Title>
            <p className="text-bb-muted-text font-body mt-2">
              Manage your roster and prepare for the next match.
            </p>
          </div>
          <div className="flex gap-4 flex-wrap">
            <SecondaryButton
              onClick={() => navigate("/shared-teams")}
              className="px-6 py-5 text-lg"
            >
              Browse Other Coaches
            </SecondaryButton>
            <Button
              onClick={handleCreateTeam}
              className="px-10 py-5 text-2xl shadow-lg hover:shadow-xl"
            >
              + Create New Team
            </Button>
            <Button
              onClick={handleSeedTeams}
              className="px-6 py-5 text-lg bg-bb-dark-gold hover:bg-bb-gold border-bb-gold shadow-lg hover:shadow-xl"
            >
              🌱 Seed All Rosters
            </Button>
            <DangerButton
              onClick={handleDeleteSeedTeams}
              className="px-6 py-5 text-lg shadow-lg hover:shadow-xl"
            >
              🗑️ Delete Seed Teams
            </DangerButton>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-bb-divider rounded-xl bg-white/20">
            <p className="text-bb-muted-text text-center italic text-2xl font-body mb-6">
              No teams found in the archives.
            </p>
            <Button onClick={handleCreateTeam}>Draft First Team</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {teams.map((team) => (
              <div
                key={team.id}
                className="relative overflow-hidden bg-bb-ink-blue rounded-xl border-2 border-bb-dark-gold shadow-lg transition-all duration-200 hover:shadow-2xl hover:scale-[1.01] flex flex-col"
              >
                {/* Team Color Strip */}
                <div
                  className="h-4 w-full border-b-2 border-bb-dark-gold"
                  style={{ backgroundColor: numToHex(team.colors.primary) }}
                />

                <div className="p-8 flex-1 flex flex-col">
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-heading font-bold text-sm uppercase text-bb-dark-gold tracking-widest border-b border-bb-dark-gold/30 pb-2 inline-block">
                        {team.rosterName}
                      </span>
                      {(() => {
                        const status = teamStatus(team);
                        return (
                          <>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                                status.mode === "active"
                                  ? "bg-bb-gold text-bb-ink-blue"
                                  : "bg-white/20 text-bb-parchment"
                              }`}
                            >
                              {status.mode}
                            </span>
                            {!status.legal && (
                              <span
                                className="rounded bg-bb-blood-red px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                                title="Not yet legal for play or competition entry"
                              >
                                Illegal
                              </span>
                            )}
                            {team.advancementMode && (
                              <span
                                className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-bb-gold border border-bb-gold/50"
                                title="Advancement mode"
                              >
                                {ADVANCEMENT_MODE_SHORT_LABELS[team.advancementMode]}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <h3 className="font-heading text-4xl font-bold text-bb-parchment leading-tight drop-shadow-md">
                      {team.name}
                    </h3>
                  </div>

                  {/* Team Photo - First 7 Players */}
                  <div className="mb-6 bg-gradient-to-b from-black/40 to-black/20 p-4 rounded-lg border border-bb-dark-gold/20">
                    <div className="text-xs uppercase font-bold text-bb-dark-gold mb-3 tracking-wider text-center">
                      Starting Lineup
                    </div>
                    <div className="flex justify-center gap-3 flex-wrap">
                      {team.players.slice(0, 7).map((player) => (
                        <div
                          key={player.id}
                          className="flex flex-col items-center group"
                          title={`#${player.number} ${player.playerName} - ${player.positionName}`}
                        >
                          <div className="relative transition-all group-hover:scale-110">
                            <PlayerPortrait
                              rosterName={team.rosterName}
                              positionName={player.positionName}
                              colors={team.colors}
                              size={64}
                            />
                            <div
                              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-bb-dark-gold flex items-center justify-center text-[10px] font-bold shadow-md"
                              style={{
                                backgroundColor: numToHex(team.colors.primary),
                                color: numToHex(team.colors.secondary),
                              }}
                            >
                              {player.number}
                            </div>
                          </div>
                          <div className="text-[9px] text-bb-dark-gold/70 mt-1 text-center font-bold uppercase tracking-tight max-w-[64px] truncate">
                            {player.positionName.split(" ")[0]}
                          </div>
                        </div>
                      ))}
                      {team.players.length < 7 && (
                        <div className="flex items-center justify-center text-bb-dark-gold/30 text-xs italic px-2">
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

                  {/* Spacer to push buttons down */}
                  <div className="flex-1"></div>

                  {/* Actions */}
                  <div className="flex gap-4 mt-2">
                    <Button
                      onClick={() => handleEditTeam(team.id)}
                      className="flex-1 py-4 text-xl"
                    >
                      Manage Team
                    </Button>
                    <DangerButton
                      onClick={() => handleDeleteTeam(team.id)}
                      className="px-6"
                    >
                      🗑️
                    </DangerButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border-t-2 border-bb-divider pt-8">
          <Button
            onClick={handleBack}
            className="!bg-bb-warm-paper !text-bb-ink-blue border-bb-ink-blue hover:!bg-bb-ink-blue hover:!text-white"
          >
            ← Back to Menu
          </Button>
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}
