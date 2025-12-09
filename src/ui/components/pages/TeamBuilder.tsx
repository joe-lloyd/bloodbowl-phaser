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

        const roster = getRosterByRosterName(selectedRace);
        const template = roster.playerTemplates.find(p => p.positionName === positionName);

        if (!template) return;
        if (team.treasury < template.cost) {
            alert('Not enough gold!');
            return;
        }

        const playerNumber = team.players.length + 1;
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

                {/* 3 Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-24">

                    {/* LEFT COLUMN: Controls (20%) */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Race Selection */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
                            <SectionTitle>Select Race</SectionTitle>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2"> {/* Smaller buttons */}
                                {getAvailableRosterNames().map(race => (
                                    <button
                                        key={race}
                                        className={`
                                            px-2 py-2 text-bb-parchment border-none cursor-pointer rounded text-[10px] font-heading uppercase
                                            transition-bb hover:bg-bb-blood-red hover:-translate-y-0.5
                                            ${selectedRace === race
                                                ? 'bg-bb-blood-red border-2 border-bb-gold shadow-md'
                                                : 'bg-bb-ink-blue'
                                            }
                                        `}
                                        onClick={() => handleRaceChange(race)}
                                    >
                                        {race}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Color Selection */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
                            <SectionTitle>Team Color</SectionTitle>
                            <div className="flex gap-2 flex-wrap">
                                {TEAM_COLORS.map(color => (
                                    <button
                                        key={color}
                                        className={`
                                            w-8 h-8 rounded-full cursor-pointer transition-all hover:scale-110 hover:shadow-lg
                                            ${selectedColor === color
                                                ? 'border-4 border-bb-gold shadow-md'
                                                : 'border-2 border-bb-divider'
                                            }
                                        `}
                                        style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                                        onClick={() => handleColorChange(color)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Basic Info */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
                            <SectionTitle>Team Details</SectionTitle>
                            <input
                                type="text"
                                className="
                                    w-full p-3 text-lg font-heading font-bold text-bb-blood-red
                                    bg-bb-parchment border-2 border-bb-divider rounded mb-4 
                                    focus:outline-none focus:border-bb-gold focus:shadow-md
                                    placeholder-bb-muted-text
                                "
                                value={team.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="Team Name"
                            />
                            {/* Stats Summary Panel */}
                            <div className="space-y-2">
                                <div className="p-2 bg-bb-ink-blue text-bb-parchment rounded font-bold font-heading flex justify-between items-center text-sm">
                                    <span>Treasury</span>
                                    <span>{formatGold(team.treasury)}</span>
                                </div>
                                <div className="p-2 bg-bb-parchment rounded text-bb-text-dark font-body border border-bb-divider flex justify-between items-center text-sm">
                                    <span>Team Value</span>
                                    <span className="font-bold">{formatGold(calculateTeamValue(team))}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MIDDLE COLUMN: Available Hires (35%) */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-bb-warm-paper rounded-lg p-4 shadow-parchment-light border border-bb-divider">
                            <BloodBowlTable
                                title="AVAILABLE HIRES"
                                headers={["Pos", "MA", "ST", "AG", "PA", "AV", "Skills", "Cost", "Action"]} /* Added Skills Header */
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
                                        <TableCell className="text-[10px] italic max-w-[120px]" title={template.skills.map(s => s.type).join(', ')}>
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


                    {/* RIGHT COLUMN: Current Team (45%) */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* BLUE SECTION: Current Team */}
                        <div className="bg-[#e0f0ff] rounded-lg p-2 border-[3px] border-[#1d3860] shadow-lg">
                            <BloodBowlTable
                                title={team.name.toUpperCase()}
                                headers={["#", "Name", "Pos", "Stats", "Skills", "Cost", ""]}
                                variant="blue"
                            >
                                {team.players.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center italic text-bb-muted-text py-8">
                                            No players hired.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    team.players.sort((a, b) => a.number - b.number).map(player => (
                                        <TableRow key={player.id}>
                                            <CustomTableCell className="text-xs">#{player.number}</CustomTableCell>
                                            <TableCell className="text-xs font-bold text-[#1d3860]">{player.playerName}</TableCell>
                                            <TableCell className="text-xs">{player.positionName}</TableCell>
                                            <TableCell className="text-[10px] font-mono whitespace-nowrap">
                                                {player.stats.MA} {player.stats.ST} {player.stats.AG}+ {player.stats.PA}+ {player.stats.AV}+
                                            </TableCell>
                                            <TableCell className="text-[10px] italic max-w-[100px] truncate" title={player.skills.map(s => s.type).join(', ')}>
                                                {player.skills.map(s => s.type).join(', ')}
                                            </TableCell>
                                            <TableCell className="text-xs">{formatGold(player.cost)}</TableCell>
                                            <TableCell>
                                                <button
                                                    className="text-red-600 hover:text-red-800 font-bold px-2"
                                                    onClick={() => handleFirePlayer(player.id)}
                                                    title="Fire Player"
                                                >
                                                    X
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </BloodBowlTable>

                            {/* Team Meta Controls (Blue Theme) */}
                            <div className="grid grid-cols-2 gap-4 mt-4 p-4 border-t-2 border-[#1d3860]">
                                {/* Re-Rolls */}
                                <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                                    <span className="text-xs font-bold text-[#1d3860]">Re-Rolls ({formatGold(roster.rerollCost)})</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-[#1d3860]">{team.rerolls}</span>
                                        <Button className="!m-0 !px-2 !py-0 !h-5 !text-[10px] !bg-[#1d3860] !text-white" onClick={handleBuyReroll} disabled={team.treasury < roster.rerollCost}>+</Button>
                                    </div>
                                </div>
                                {/* Apothecary */}
                                <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                                    <span className="text-xs font-bold text-[#1d3860]">Apothecary (50k)</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={team.apothecary}
                                            onChange={handleApothecaryToggle}
                                            disabled={!team.apothecary && team.treasury < 50000}
                                            className="h-4 w-4"
                                        />
                                    </div>
                                </div>
                                {/* Dedicated Fans (Free for now/Input) */}
                                <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                                    <span className="text-xs font-bold text-[#1d3860]">Dedicated Fans</span>
                                    <input
                                        type="number"
                                        value={team.dedicatedFans}
                                        onChange={(e) => handleStatChange('dedicatedFans', parseInt(e.target.value))}
                                        className="w-12 text-right text-xs border border-gray-300 rounded"
                                    />
                                </div>
                                {/* Assistant Coaches */}
                                <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                                    <span className="text-xs font-bold text-[#1d3860]">Asst. Coaches (10k)</span>
                                    <input
                                        type="number"
                                        value={team.coaches}
                                        onChange={(e) => handleStatChange('coaches', parseInt(e.target.value))}
                                        className="w-12 text-right text-xs border border-gray-300 rounded"
                                    />
                                </div>
                                {/* Cheerleaders */}
                                <div className="flex justify-between items-center bg-white p-2 rounded border border-[#1d3860]">
                                    <span className="text-xs font-bold text-[#1d3860]">Cheerleaders (10k)</span>
                                    <input
                                        type="number"
                                        value={team.cheerleaders}
                                        onChange={(e) => handleStatChange('cheerleaders', parseInt(e.target.value))}
                                        className="w-12 text-right text-xs border border-gray-300 rounded"
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
        </MinHeightContainer>
    );
}
