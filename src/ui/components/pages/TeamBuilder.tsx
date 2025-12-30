import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Team,
  RosterName,
  createTeam,
  addPlayerToTeam,
  calculateTeamValue,
} from "../../../types/Team";
import { createPlayer } from "../../../types/Player";
import {
  getRosterByRosterName,
  getAvailableRosterNames,
} from "../../../data/RosterTemplates";
import * as TeamManager from "../../../game/managers/TeamManager";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button } from "../componentWarehouse/Button";
import { Title } from "../componentWarehouse/Titles";
import { AvailableHires } from "../TeamBuilder/AvailableHires";
import { TeamRoster } from "../TeamBuilder/TeamRoster";

// interface TeamBuilderProps {}

const TEAM_COLORS = [
  0x8e1b1b, // Blood Red
  0x1e3a5f, // Ink Blue
  0x556b2f, // Pitch Green
  0xd6b25e, // Gold
  0x2a1f1a, // Text Dark
  0xb32020, // Deep Crimson
  0xe8ddc4, // Warm Paper
  0x6b5e54, // Muted Text
  0xffffff, // White
  0x000000, // Black
];

export function TeamBuilder() {
  const [team, setTeam] = useState<Team | null>(null);
  const [selectedRace, setSelectedRace] = useState<RosterName>(
    RosterName.AMAZON
  );
  const [selectedColor, setSelectedColor] = useState<number>(0x8e1b1b);
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();

  useEffect(() => {
    // Load existing team or create new one
    if (teamId) {
      const teams = TeamManager.loadTeams();
      const existingTeam = teams.find((t) => t.id === teamId);
      if (existingTeam) {
        setTeam(existingTeam);
        setSelectedRace(existingTeam.rosterName);
        setSelectedColor(existingTeam.colors.primary);
        return;
      }
    }

    // Create new team
    const newTeam = createTeam(
      "New Team",
      selectedRace,
      { primary: selectedColor, secondary: 0xffffff },
      50000
    );
    setTeam(newTeam);
  }, [teamId]);

  const handleRaceChange = (race: RosterName) => {
    if (!team || team.players.length > 0) {
      if (team && team.players.length > 0) {
        if (!confirm("Changing race will clear your roster. Continue?")) return;
      }
    }

    setSelectedRace(race);
    const newTeam = createTeam(
      team?.name || "New Team",
      race,
      { primary: selectedColor, secondary: 0xffffff },
      team?.treasury || 50000
    );
    setTeam(newTeam);
  };

  const handleColorChange = (color: number) => {
    setSelectedColor(color);
    if (team) {
      setTeam({
        ...team,
        colors: { ...team.colors, primary: color },
      });
    }
  };

  const handleNameChange = (name: string) => {
    if (team) {
      setTeam({ ...team, name });
    }
  };

  const handleHirePlayer = (positionName: string) => {
    if (!team) return;

    // Check for max roster size first
    if (team.players.length >= 11) {
      alert("Roster full (max 11 players)! Fire someone to make room.");
      return;
    }

    const roster = getRosterByRosterName(selectedRace);
    const template = roster.playerTemplates.find(
      (p) => p.positionName === positionName
    );

    if (!template) return;
    if (team.treasury < template.cost) {
      alert("Not enough gold!");
      return;
    }

    // Find the first available number between 1 and 11
    const usedNumbers = new Set(team.players.map((p) => p.number));
    let playerNumber = 1;
    while (usedNumbers.has(playerNumber) && playerNumber <= 11) {
      playerNumber++;
    }

    const player = createPlayer(template, team.id, playerNumber);

    if (addPlayerToTeam(team, player)) {
      setTeam({ ...team });
    }
  };

  const handleFirePlayer = (playerId: string) => {
    if (!team) return;

    const player = team.players.find((p) => p.id === playerId);
    if (!player) return;

    team.players = team.players.filter((p) => p.id !== playerId);
    team.treasury += Math.floor(player.cost); // Full refund
    setTeam({ ...team });
  };

  const handleReorderPlayers = (sourceSlot: number, targetSlot: number) => {
    if (!team) return;

    // Deep copy players for safe state mutation
    const newPlayers = team.players.map((p) => ({ ...p }));
    const sourcePlayer = newPlayers.find((p) => p.number === sourceSlot);
    const targetPlayer = newPlayers.find((p) => p.number === targetSlot);

    if (sourcePlayer) {
      sourcePlayer.number = targetSlot;
      // Swap if target exists
      if (targetPlayer) {
        targetPlayer.number = sourceSlot;
      }

      setTeam({
        ...team,
        players: newPlayers,
      });
    }
  };

  const handleBuyReroll = () => {
    if (!team) return;

    const roster = getRosterByRosterName(team.rosterName);
    const cost = roster.rerollCost;

    if (team.treasury >= cost) {
      team.treasury -= cost;
      team.rerolls++;
      setTeam({ ...team });
    }
  };

  const handleSave = () => {
    if (!team || team.players.length < 7) {
      alert("You need at least 7 players to save the team!");
      return;
    }

    const teams = TeamManager.loadTeams();
    const existingIndex = teams.findIndex((t) => t.id === team.id);

    if (existingIndex >= 0) {
      teams[existingIndex] = team;
    } else {
      teams.push(team);
    }

    TeamManager.saveTeams(teams);
    navigate("/build-team");
  };

  const handleBack = () => {
    navigate("/build-team");
  };

  // Handlers for Meta fields
  const handleStatChange = (field: keyof Team, value: number) => {
    if (!team) return;
    // Basic clamp to 0
    const newVal = Math.max(0, value);

    // Special logic for Rerolls (cost money) - disabled here to use the main handler, or simplified
    // We'll stick to displaying them here for editing "league stats" if needed,
    // but for draft, only Rerolls affect Treasury usually.
    // For now, let's allow editing these fields directly as "Team Meta"

    setTeam({
      ...team,
      [field]: newVal,
    });
  };

  const handleApothecaryToggle = () => {
    if (!team) return;
    if (!team.apothecary && team.treasury >= 50000) {
      team.treasury -= 50000;
      team.apothecary = true;
    } else if (team.apothecary) {
      team.treasury += 50000;
      team.apothecary = false;
    }
    setTeam({ ...team });
  };

  const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

  if (!team) {
    return (
      <MinHeightContainer className="bg-bb-parchment">
        <Parchment $intensity="low" />
        <ContentContainer>
          <div className="font-heading text-xl text-bb-text-dark">
            Loading...
          </div>
        </ContentContainer>
      </MinHeightContainer>
    );
  }

  const roster = getRosterByRosterName(selectedRace);
  const canSave = team.players.length >= 7;

  return (
    <MinHeightContainer className="bg-bb-parchment !justify-start pb-12 mb-26">
      <Parchment $intensity="low" />

      <ContentContainer className="!px-4 !pb-26">
        <div className="text-center mb-8">
          <Title>TEAM BUILDER</Title>
        </div>

        {/* 2 Column Layout - Hires & Team Sheet */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-26">
          {/* LEFT COLUMN: Available Hires (35%) */}
          <div className="col-span-12 space-y-6">
            <AvailableHires
              roster={roster}
              treasury={team.treasury}
              onHirePlayer={handleHirePlayer}
            />
          </div>

          {/* RIGHT COLUMN: Current Team Sheet (65%) */}
          <div className="col-span-12 space-y-6">
            {/* BLUE SECTION: Current Team */}
            <div className="bg-[#e0f0ff] rounded-lg p-2 border-[3px] border-[#1d3860] shadow-lg">
              {/* Team Header / Base Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 mb-4 border-b-2 border-[#1d3860] bg-[#e0f0ff]">
                {/* Row 1 */}
                <div className="flex flex-col gap-1">
                  <label className="text-[#1d3860] font-bold text-xs uppercase">
                    Team Name
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md"
                    value={team.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter Team Name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[#1d3860] font-bold text-xs uppercase">
                    Roster
                  </label>
                  <select
                    className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md cursor-pointer"
                    value={selectedRace}
                    onChange={(e) =>
                      handleRaceChange(e.target.value as RosterName)
                    }
                  >
                    {getAvailableRosterNames().map((race) => (
                      <option key={race} value={race}>
                        {race}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 2: Coach & Treasury Controls */}
                <div className="flex flex-col gap-1">
                  <label className="text-[#1d3860] font-bold text-xs uppercase">
                    Coach
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md"
                    value={team.coachName || ""}
                    onChange={(e) =>
                      setTeam({ ...team, coachName: e.target.value })
                    }
                    placeholder="Coach Name"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[#1d3860] font-bold text-xs uppercase">
                    Starting Treasury
                  </label>
                  <input
                    type="number"
                    step="10000"
                    className={`w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md ${
                      team.players.length > 0
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    value={team.startingTreasury}
                    disabled={team.players.length > 0}
                    onChange={(e) => {
                      const newVal = parseInt(e.target.value) || 0;
                      setTeam({
                        ...team,
                        startingTreasury: newVal,
                        treasury: newVal, // synchronise current treasury as long as we are in drafting mode and no players bought
                      });
                    }}
                  />
                </div>

                {/* Row 3: Colors & Current Treasury display */}
                <div className="flex flex-col gap-1">
                  <label className="text-[#1d3860] font-bold text-xs uppercase">
                    Team Colors
                  </label>
                  <div className="flex gap-2 flex-wrap bg-white p-2 border-2 border-[#1d3860] min-h-[42px]">
                    {TEAM_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`
                                                    w-5 h-5 rounded-full cursor-pointer transition-all hover:scale-110
                                                    ${
                                                      selectedColor === color
                                                        ? "border-2 border-bb-gold shadow-md scale-110"
                                                        : "border border-gray-400"
                                                    }
                                                `}
                        style={{
                          backgroundColor: `#${color
                            .toString(16)
                            .padStart(6, "0")}`,
                        }}
                        onClick={() => handleColorChange(color)}
                        title={`#${color.toString(16).padStart(6, "0")}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[#1d3860] font-bold text-xs uppercase">
                    Current Gold
                  </label>
                  <div className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] flex justify-between items-center">
                    <span>{formatGold(team.treasury)}</span>
                    <span className="text-xs text-gray-500 font-body">
                      TV: {formatGold(calculateTeamValue(team))}
                    </span>
                  </div>
                </div>
              </div>

              <TeamRoster
                team={team}
                onFirePlayer={handleFirePlayer}
                onReorderPlayers={handleReorderPlayers}
              />

              {/* Team Meta Controls (Blue Theme) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-4 p-4 border-t-2 border-[#1d3860] bg-[#e6f4ff]">
                {/* Re-Rolls */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[#1d3860] uppercase">
                    Re-Rolls ({formatGold(roster.rerollCost)})
                  </span>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                    <span className="font-bold text-[#1d3860]">
                      {team.rerolls}
                    </span>
                    <Button
                      className="!m-0 !px-2 !py-0 !h-5 !text-[10px] !bg-[#1d3860] !text-white"
                      onClick={handleBuyReroll}
                      disabled={team.treasury < roster.rerollCost}
                    >
                      +
                    </Button>
                  </div>
                </div>
                {/* Apothecary */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[#1d3860] uppercase">
                    Apothecary (50k)
                  </span>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860] h-[38px]">
                    <span className="text-xs text-[#1d3860]">
                      {team.apothecary ? "Yes" : "No"}
                    </span>
                    <input
                      type="checkbox"
                      checked={team.apothecary}
                      onChange={handleApothecaryToggle}
                      disabled={!team.apothecary && team.treasury < 50000}
                      className="h-4 w-4 accent-[#1d3860]"
                    />
                  </div>
                </div>
                {/* Dedicated Fans */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[#1d3860] uppercase">
                    Dedicated Fans
                  </span>
                  <input
                    type="number"
                    value={team.dedicatedFans}
                    onChange={(e) =>
                      handleStatChange(
                        "dedicatedFans",
                        parseInt(e.target.value)
                      )
                    }
                    className="w-full p-2 text-right text-xs font-bold text-[#1d3860] border border-[#1d3860] rounded focus:outline-none"
                  />
                </div>
                {/* Asst Coaches */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[#1d3860] uppercase">
                    Asst. Coaches (10k)
                  </span>
                  <input
                    type="number"
                    value={team.coaches}
                    onChange={(e) =>
                      handleStatChange("coaches", parseInt(e.target.value))
                    }
                    className="w-full p-2 text-right text-xs font-bold text-[#1d3860] border border-[#1d3860] rounded focus:outline-none"
                  />
                </div>
                {/* Cheerleaders */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[#1d3860] uppercase">
                    Cheerleaders (10k)
                  </span>
                  <input
                    type="number"
                    value={team.cheerleaders}
                    onChange={(e) =>
                      handleStatChange("cheerleaders", parseInt(e.target.value))
                    }
                    className="w-full p-2 text-right text-xs font-bold text-[#1d3860] border border-[#1d3860] rounded focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="fixed bottom-0 left-0 w-full p-4 bg-bb-warm-paper border-t border-bb-gold shadow-lg flex justify-between items-center z-50">
          <Button
            onClick={handleBack}
            className="!bg-bb-parchment !text-bb-text-dark border-bb-text-dark"
          >
            Cancel
          </Button>
          <div className="text-xl font-heading font-bold text-bb-blood-red">
            {team.players.length}/11 Players | TV:{" "}
            {formatGold(calculateTeamValue(team))}
          </div>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="text-xl px-8 shadow-lg"
          >
            Save Team {!canSave && `(${7 - team.players.length} more needed)`}
          </Button>
        </div>

        {/* Spacer for fixed footer */}
        <div className="h-40"></div>
      </ContentContainer>
    </MinHeightContainer>
  );
}
