import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Team, calculateTeamValue } from "../../../types/Team";
import {
  loadTeams,
  deleteTeam,
  seedAllRosterTeams,
  deleteAllSeedTeams,
} from "../../../game/managers/TeamManager";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button, DangerButton } from "../componentWarehouse/Button";
import { Title } from "../componentWarehouse/Titles";

// Dynamic asset loading
const assetFiles = import.meta.glob("../../../data/assets/**/*.{png,jpg,gif}", {
  eager: true,
  query: "?url",
  import: "default",
});

// interface TeamManagementProps {
//   eventBus: EventBus;
// }

/**
 * Get player sprite image URL from assets
 */
function getPlayerSpriteUrl(
  rosterName: string,
  positionName: string
): string | null {
  // Normalize roster and position names
  const rosterKey = rosterName.toLowerCase().replace(/\s+/g, "-");
  const posKey = positionName.toLowerCase().replace(/\s+/g, "-");

  // Try to find matching asset
  for (const path in assetFiles) {
    const url = assetFiles[path];
    const parts = path.split("/");
    const filename = parts.pop();
    const folder = parts.pop();

    if (folder && filename) {
      const folderNorm = folder.toLowerCase().replace(/\s+/g, "-");
      const nameIdx = filename.lastIndexOf(".");
      const name = nameIdx !== -1 ? filename.substring(0, nameIdx) : filename;
      const nameNorm = name.toLowerCase().replace(/\s+/g, "-");

      // Check if folder matches roster and filename matches position
      if (folderNorm === rosterKey && nameNorm === posKey) {
        return url as string;
      }
    }
  }

  return null;
}

/**
 * Team Management Component
 * Lists all teams with create/edit/delete functionality
 */
export function TeamManagement() {
  const [teams, setTeams] = useState<Team[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setTeams(loadTeams());
  }, []);

  const handleCreateTeam = () => {
    navigate("/build-team/new-team");
  };

  const handleEditTeam = (teamId: string) => {
    navigate(`/build-team/${teamId}`);
  };

  const handleDeleteTeam = (teamId: string) => {
    if (confirm("Are you sure you want to delete this team?")) {
      deleteTeam(teamId);
      setTeams(loadTeams());
    }
  };

  const handleSeedTeams = () => {
    if (
      confirm("This will create sample teams for all roster types. Continue?")
    ) {
      seedAllRosterTeams();
      setTeams(loadTeams());
    }
  };

  const handleDeleteSeedTeams = () => {
    if (
      confirm(
        "This will delete all seed teams (ending with ' Sample'). Continue?"
      )
    ) {
      deleteAllSeedTeams();
      setTeams(loadTeams());
    }
  };

  const handleBack = () => {
    navigate("/");
  };

  const formatGold = (amount: number): string => {
    return `${(amount / 1000).toFixed(0)}k`;
  };

  const numToHex = (num: number): string => {
    return "#" + num.toString(16).padStart(6, "0");
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
                    <div className="font-heading font-bold text-sm uppercase text-bb-dark-gold tracking-widest mb-2 border-b border-bb-dark-gold/30 pb-2 inline-block">
                      {team.rosterName}
                    </div>
                    <h3 className="font-heading text-4xl font-bold text-bb-parchment leading-tight drop-shadow-md">
                      {team.name}
                    </h3>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-8 bg-black/20 p-6 rounded-lg border border-bb-dark-gold/30">
                    <div>
                      <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
                        Team Value
                      </span>
                      <span className="font-heading text-2xl text-bb-parchment">
                        {formatGold(calculateTeamValue(team))}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
                        Treasury
                      </span>
                      <span className="font-heading text-2xl text-white">
                        {formatGold(team.treasury)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
                        Roster
                      </span>
                      <span className="font-heading text-2xl text-white">
                        {team.players.length}/11
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
                        Record
                      </span>
                      <span className="font-heading text-2xl text-white">
                        {team.wins}-{team.draws}-{team.losses}
                      </span>
                    </div>
                  </div>

                  {/* Team Photo - First 7 Players */}
                  <div className="mb-6 bg-gradient-to-b from-black/40 to-black/20 p-4 rounded-lg border border-bb-dark-gold/20">
                    <div className="text-xs uppercase font-bold text-bb-dark-gold mb-3 tracking-wider text-center">
                      Starting Lineup
                    </div>
                    <div className="flex justify-center gap-3 flex-wrap">
                      {team.players.slice(0, 7).map((player) => {
                        const spriteUrl = getPlayerSpriteUrl(
                          team.rosterName,
                          player.positionName
                        );

                        return (
                          <div
                            key={player.id}
                            className="flex flex-col items-center group"
                            title={`#${player.number} ${player.playerName} - ${player.positionName}`}
                          >
                            {/* Player Sprite or Icon */}
                            <div className="relative w-14 h-14 flex items-center justify-center transition-all group-hover:scale-110">
                              {spriteUrl ? (
                                <>
                                  {/* Player Sprite Image */}
                                  <img
                                    src={spriteUrl}
                                    alt={player.positionName}
                                    className="w-full h-full object-contain drop-shadow-lg"
                                  />
                                  {/* Player Number Badge */}
                                  <div
                                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-bb-dark-gold flex items-center justify-center text-[10px] font-bold shadow-md"
                                    style={{
                                      backgroundColor: numToHex(
                                        team.colors.primary
                                      ),
                                      color: numToHex(team.colors.secondary),
                                    }}
                                  >
                                    {player.number}
                                  </div>
                                </>
                              ) : (
                                /* Fallback: Number Badge */
                                <div
                                  className="w-12 h-12 rounded-full border-2 border-bb-dark-gold/50 flex items-center justify-center text-lg font-bold shadow-md"
                                  style={{
                                    backgroundColor: numToHex(
                                      team.colors.primary
                                    ),
                                    color: numToHex(team.colors.secondary),
                                  }}
                                >
                                  {player.number}
                                </div>
                              )}
                            </div>
                            {/* Position Label */}
                            <div className="text-[9px] text-bb-dark-gold/70 mt-1 text-center font-bold uppercase tracking-tight max-w-[56px] truncate">
                              {player.positionName.split(" ")[0]}
                            </div>
                          </div>
                        );
                      })}
                      {team.players.length < 7 && (
                        <div className="flex items-center justify-center text-bb-dark-gold/30 text-xs italic px-2">
                          +{7 - team.players.length} more needed
                        </div>
                      )}
                    </div>
                  </div>

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
