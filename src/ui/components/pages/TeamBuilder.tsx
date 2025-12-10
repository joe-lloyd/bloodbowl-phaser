import { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventEmit } from '../../hooks/useEventBus';
import {
    Team,
    RosterName,
    createTeam,
    addPlayerToTeam,
    calculateTeamValue,
} from '../../../types/Team';
import { createPlayer } from '../../../types/Player';
import { getRosterByRosterName, getAvailableRosterNames } from '../../../data/RosterTemplates';
import * as TeamManager from '../../../managers/TeamManager';
import Parchment from '../componentWarehouse/Parchment';
import ContentContainer from '../componentWarehouse/ContentContainer';
import MinHeightContainer from '../componentWarehouse/MinHeightContainer';
import { Button, DangerButton } from '../componentWarehouse/Button';
import { Title, SectionTitle } from '../componentWarehouse/Titles';
import { BloodBowlTable, TableRow, TableCell, CustomTableCell } from '../componentWarehouse/BloodBowlTable';

interface TeamBuilderProps {
    eventBus: EventBus;
    teamId?: string;
}

const TEAM_COLORS = [
    0x8E1B1B, // Blood Red
    0x1E3A5F, // Ink Blue
    0x556B2F, // Pitch Green
    0xD6B25E, // Gold
    0x2A1F1A, // Text Dark
    0xB32020, // Deep Crimson
    0xE8DDC4, // Warm Paper
    0x6B5E54, // Muted Text
    0xFFFFFF, // White
    0x000000, // Black
];

export function TeamBuilder({ eventBus, teamId }: TeamBuilderProps) {
    const [team, setTeam] = useState<Team | null>(null);
    const [selectedRace, setSelectedRace] = useState<RosterName>(RosterName.AMAZON);
    const [selectedColor, setSelectedColor] = useState<number>(0x8E1B1B);
    const emit = useEventEmit(eventBus);

    useEffect(() => {
        // Load existing team or create new one
        if (teamId) {
            const teams = TeamManager.loadTeams();
            const existingTeam = teams.find(t => t.id === teamId);
            if (existingTeam) {
                setTeam(existingTeam);
                setSelectedRace(existingTeam.rosterName);
                setSelectedColor(existingTeam.colors.primary);
                return;
            }
        }

        // Create new team
        const newTeam = createTeam(
            'New Team',
            selectedRace,
            { primary: selectedColor, secondary: 0xffffff },
            50000
        );
        setTeam(newTeam);
    }, [teamId]);

    const handleRaceChange = (race: RosterName) => {
        if (!team || team.players.length > 0) {
            if (team && team.players.length > 0) {
                if (!confirm('Changing race will clear your roster. Continue?')) return;
            }
        }

        setSelectedRace(race);
        const newTeam = createTeam(
            team?.name || 'New Team',
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
            alert('Roster full (max 11 players)! Fire someone to make room.');
            return;
        }

        const roster = getRosterByRosterName(selectedRace);
        const template = roster.playerTemplates.find(p => p.positionName === positionName);

        if (!template) return;
        if (team.treasury < template.cost) {
            alert('Not enough gold!');
            return;
        }

        // Find the first available number between 1 and 11
        const usedNumbers = new Set(team.players.map(p => p.number));
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

        const player = team.players.find(p => p.id === playerId);
        if (!player) return;

        team.players = team.players.filter(p => p.id !== playerId);
        team.treasury += Math.floor(player.cost); // Full refund
        setTeam({ ...team });
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
            alert('You need at least 7 players to save the team!');
            return;
        }

        const teams = TeamManager.loadTeams();
        const existingIndex = teams.findIndex(t => t.id === team.id);

        if (existingIndex >= 0) {
            teams[existingIndex] = team;
        } else {
            teams.push(team);
        }

        TeamManager.saveTeams(teams);
        emit('ui:sceneChange', { scene: 'TeamManagementScene' });
    };

    const handleBack = () => {
        emit('ui:sceneChange', { scene: 'TeamManagementScene' });
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
            [field]: newVal
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
                    <div className="font-heading text-xl text-bb-text-dark">Loading...</div>
                </ContentContainer>
            </MinHeightContainer>
        );
    }

    const roster = getRosterByRosterName(selectedRace);
    const canSave = team.players.length >= 7;

    return (
        <MinHeightContainer className="bg-bb-parchment !justify-start pt-8 pb-12">
            <Parchment $intensity="low" />

            <ContentContainer className="!px-4">
                <div className="text-center mb-8">
                    <Title>TEAM BUILDER</Title>
                </div>

                {/* 2 Column Layout - Hires & Team Sheet */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-24">

                    {/* LEFT COLUMN: Available Hires (35%) */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-bb-warm-paper rounded-lg p-4 shadow-parchment-light border border-bb-divider">
                            <BloodBowlTable
                                title="AVAILABLE HIRES"
                                headers={["Pos", "MA", "ST", "AG", "PA", "AV", "Skills", "Cost", "Action"]}
                                variant="red"
                            >
                                {roster.playerTemplates.map(template => (
                                    <TableRow key={`hire-${template.positionName}`}>
                                        <CustomTableCell className="text-xs">{template.positionName}</CustomTableCell>
                                        <TableCell className="text-xs text-center">{template.stats.MA}</TableCell>
                                        <TableCell className="text-xs text-center">{template.stats.ST}</TableCell>
                                        <TableCell className="text-xs text-center">{template.stats.AG}+</TableCell>
                                        <TableCell className="text-xs text-center">{template.stats.PA}+</TableCell>
                                        <TableCell className="text-xs text-center">{template.stats.AV}+</TableCell>
                                        <TableCell className="text-[10px] italic max-w-[120px] truncate" title={template.skills.map(s => s.type).join(', ')}>
                                            {template.skills.map(s => s.type).join(', ')}
                                        </TableCell>
                                        <TableCell className="font-bold text-xs">{formatGold(template.cost)}</TableCell>
                                        <TableCell>
                                            <Button
                                                className="!m-0 !px-2 !py-1 !text-[10px] w-full"
                                                onClick={() => handleHirePlayer(template.positionName)}
                                                disabled={team.treasury < template.cost}
                                            >
                                                HIRE
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </BloodBowlTable>
                        </div>
                    </div>


                    {/* RIGHT COLUMN: Current Team Sheet (65%) */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* BLUE SECTION: Current Team */}
                        <div className="bg-[#e0f0ff] rounded-lg p-2 border-[3px] border-[#1d3860] shadow-lg">

                            {/* Team Header / Base Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 mb-4 border-b-2 border-[#1d3860] bg-[#e0f0ff]">
                                {/* Row 1 */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[#1d3860] font-bold text-xs uppercase">Team Name</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md"
                                        value={team.name}
                                        onChange={(e) => handleNameChange(e.target.value)}
                                        placeholder="Enter Team Name"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[#1d3860] font-bold text-xs uppercase">Roster</label>
                                    <select
                                        className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md cursor-pointer"
                                        value={selectedRace}
                                        onChange={(e) => handleRaceChange(e.target.value as RosterName)}
                                    >
                                        {getAvailableRosterNames().map(race => (
                                            <option key={race} value={race}>{race}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Row 2: Coach & Treasury Controls */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[#1d3860] font-bold text-xs uppercase">Coach</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md"
                                        value={team.coachName || ''}
                                        onChange={(e) => setTeam({ ...team, coachName: e.target.value })}
                                        placeholder="Coach Name"
                                    />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-[#1d3860] font-bold text-xs uppercase">Starting Treasury</label>
                                    <input
                                        type="number"
                                        step="10000"
                                        className={`w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] focus:outline-none focus:shadow-md ${team.players.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        value={team.startingTreasury}
                                        disabled={team.players.length > 0}
                                        onChange={(e) => {
                                            const newVal = parseInt(e.target.value) || 0;
                                            setTeam({
                                                ...team,
                                                startingTreasury: newVal,
                                                treasury: newVal // synchronise current treasury as long as we are in drafting mode and no players bought
                                            });
                                        }}
                                    />
                                </div>

                                {/* Row 3: Colors & Current Treasury display */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[#1d3860] font-bold text-xs uppercase">Team Colors</label>
                                    <div className="flex gap-2 flex-wrap bg-white p-2 border-2 border-[#1d3860] min-h-[42px]">
                                        {TEAM_COLORS.map(color => (
                                            <button
                                                key={color}
                                                className={`
                                                    w-5 h-5 rounded-full cursor-pointer transition-all hover:scale-110
                                                    ${selectedColor === color
                                                        ? 'border-2 border-bb-gold shadow-md scale-110'
                                                        : 'border border-gray-400'
                                                    }
                                                `}
                                                style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                                                onClick={() => handleColorChange(color)}
                                                title={`#${color.toString(16).padStart(6, '0')}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[#1d3860] font-bold text-xs uppercase">Current Gold</label>
                                    <div className="w-full p-2 text-sm font-heading font-bold text-[#1d3860] bg-white border-2 border-[#1d3860] flex justify-between items-center">
                                        <span>{formatGold(team.treasury)}</span>
                                        <span className="text-xs text-gray-500 font-body">TV: {formatGold(calculateTeamValue(team))}</span>
                                    </div>
                                </div>
                            </div>

                            <BloodBowlTable
                                title={team.name.toUpperCase()}
                                headers={[
                                    { label: "#", width: "5%" },
                                    { label: "Name", width: "25%" },
                                    { label: "Pos", width: "15%" },
                                    { label: "Stats", width: "15%" },
                                    { label: "Skills", width: "25%" },
                                    { label: "Cost", width: "12%" },
                                    { label: "", width: "8%" } // Actions
                                ]}
                                variant="blue"
                            >
                                {Array.from({ length: 11 }).map((_, index) => {
                                    const slotNumber = index + 1;
                                    const player = team.players.find(p => p.number === slotNumber);

                                    return (
                                        <TableRow
                                            key={slotNumber}
                                            className={`h-12 ${player ? "cursor-move" : ""}`}
                                            draggable={!!player}
                                            onDragStart={(e) => {
                                                if (player) {
                                                    e.dataTransfer.setData('text/plain', slotNumber.toString());
                                                    e.dataTransfer.effectAllowed = 'move';
                                                }
                                            }}
                                            onDragEnter={(e) => e.preventDefault()}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = 'move';
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const sourceSlotString = e.dataTransfer.getData('text/plain');
                                                const sourceSlot = parseInt(sourceSlotString);

                                                if (isNaN(sourceSlot) || sourceSlot === slotNumber) return;

                                                // Deep copy players for safe state mutation
                                                const newPlayers = team.players.map(p => ({ ...p }));
                                                const sourcePlayer = newPlayers.find(p => p.number === sourceSlot);
                                                const targetPlayer = newPlayers.find(p => p.number === slotNumber);

                                                if (sourcePlayer) {
                                                    sourcePlayer.number = slotNumber;
                                                    // Swap if target exists
                                                    if (targetPlayer) {
                                                        targetPlayer.number = sourceSlot;
                                                    }

                                                    setTeam({
                                                        ...team,
                                                        players: newPlayers
                                                    });
                                                }
                                            }}
                                        >
                                            <CustomTableCell className="text-xs text-center text-[#1d3860]/50 select-none">
                                                {slotNumber}
                                            </CustomTableCell>

                                            {player ? (
                                                <>
                                                    <TableCell className="text-xs font-bold text-[#1d3860]">{player.playerName}</TableCell>
                                                    <TableCell className="text-xs">{player.positionName}</TableCell>
                                                    <TableCell className="text-[10px] font-mono whitespace-nowrap">
                                                        {player.stats.MA} {player.stats.ST} {player.stats.AG}+ {player.stats.PA}+ {player.stats.AV}+
                                                    </TableCell>
                                                    <TableCell className="text-[10px] italic max-w-[200px] truncate" title={player.skills.map(s => s.type).join(', ')}>
                                                        {player.skills.map(s => s.type).join(', ')}
                                                    </TableCell>
                                                    <TableCell className="text-xs">{formatGold(player.cost)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <span
                                                                className="text-[#1d3860] text-lg font-bold cursor-grab hover:text-bb-gold px-1 select-none"
                                                                title="Drag to Reorder"
                                                            >
                                                                ≡
                                                            </span>
                                                            <button
                                                                className="text-red-600 hover:text-red-800 font-bold px-1"
                                                                onClick={() => handleFirePlayer(player.id)}
                                                                title="Fire Player"
                                                            >
                                                                X
                                                            </button>
                                                        </div>
                                                    </TableCell>
                                                </>
                                            ) : (
                                                <TableCell colSpan={6} className="text-center italic text-[#1d3860]/30 text-xs py-3">
                                                    Empty Slot
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </BloodBowlTable>

                            {/* Team Meta Controls (Blue Theme) */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-4 p-4 border-t-2 border-[#1d3860] bg-[#e6f4ff]">
                                {/* Re-Rolls */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-[#1d3860] uppercase">Re-Rolls ({formatGold(roster.rerollCost)})</span>
                                    <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                                        <span className="font-bold text-[#1d3860]">{team.rerolls}</span>
                                        <Button className="!m-0 !px-2 !py-0 !h-5 !text-[10px] !bg-[#1d3860] !text-white" onClick={handleBuyReroll} disabled={team.treasury < roster.rerollCost}>+</Button>
                                    </div>
                                </div>
                                {/* Apothecary */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-[#1d3860] uppercase">Apothecary (50k)</span>
                                    <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860] h-[38px]">
                                        <span className="text-xs text-[#1d3860]">{team.apothecary ? 'Yes' : 'No'}</span>
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
                                    <span className="text-[10px] font-bold text-[#1d3860] uppercase">Dedicated Fans</span>
                                    <input
                                        type="number"
                                        value={team.dedicatedFans}
                                        onChange={(e) => handleStatChange('dedicatedFans', parseInt(e.target.value))}
                                        className="w-full p-2 text-right text-xs font-bold text-[#1d3860] border border-[#1d3860] rounded focus:outline-none"
                                    />
                                </div>
                                {/* Asst Coaches */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-[#1d3860] uppercase">Asst. Coaches (10k)</span>
                                    <input
                                        type="number"
                                        value={team.coaches}
                                        onChange={(e) => handleStatChange('coaches', parseInt(e.target.value))}
                                        className="w-full p-2 text-right text-xs font-bold text-[#1d3860] border border-[#1d3860] rounded focus:outline-none"
                                    />
                                </div>
                                {/* Cheerleaders */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-[#1d3860] uppercase">Cheerleaders (10k)</span>
                                    <input
                                        type="number"
                                        value={team.cheerleaders}
                                        onChange={(e) => handleStatChange('cheerleaders', parseInt(e.target.value))}
                                        className="w-full p-2 text-right text-xs font-bold text-[#1d3860] border border-[#1d3860] rounded focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="fixed bottom-0 left-0 w-full p-4 bg-bb-warm-paper border-t border-bb-gold shadow-lg flex justify-between items-center z-50">
                    <Button onClick={handleBack} className="!bg-bb-parchment !text-bb-text-dark border-bb-text-dark">
                        Cancel
                    </Button>
                    <div className="text-xl font-heading font-bold text-bb-blood-red">
                        {team.players.length}/11 Players | TV: {formatGold(calculateTeamValue(team))}
                    </div>
                    <Button onClick={handleSave} disabled={!canSave} className="text-xl px-8 shadow-lg">
                        Save Team {!canSave && `(${7 - team.players.length} more needed)`}
                    </Button>
                </div>

                {/* Spacer for fixed footer */}
                <div className="h-24"></div>
            </ContentContainer>
        </MinHeightContainer >
    );
}
