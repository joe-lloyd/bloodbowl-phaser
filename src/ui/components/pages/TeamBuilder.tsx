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
        <MinHeightContainer className="bg-bb-parchment">
            <Parchment $intensity="low" />

            <ContentContainer>
                <div className="text-center mb-8">
                    <Title>TEAM BUILDER</Title>
                </div>

                <div className="grid grid-cols-2 gap-10 mb-10 lg:grid-cols-1">
                    {/* Left Column */}
                    <div>
                        {/* Race Selection */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
                            <SectionTitle>Select Race</SectionTitle>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
                                {getAvailableRosterNames().map(race => (
                                    <button
                                        key={race}
                                        className={`
                                            px-3 py-2 text-bb-parchment border-none cursor-pointer rounded text-sm font-heading uppercase
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
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider mt-5">
                            <SectionTitle>Team Color</SectionTitle>
                            <div className="flex gap-2 flex-wrap">
                                {TEAM_COLORS.map(color => (
                                    <button
                                        key={color}
                                        className={`
                                            w-10 h-10 rounded-full cursor-pointer transition-all hover:scale-110 hover:shadow-lg
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

                        {/* Available Players */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider mt-5">
                            <SectionTitle>Available Players</SectionTitle>
                            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto pr-2">
                                {roster.playerTemplates.map(template => (
                                    <div
                                        key={template.positionName}
                                        className="bg-bb-parchment border border-bb-divider rounded p-3 flex justify-between items-center gap-2.5 transition-colors hover:bg-white"
                                    >
                                        <div className="flex-1">
                                            <div className="font-bold font-heading text-bb-ink-blue mb-1 uppercase">
                                                {template.positionName}
                                            </div>
                                            <div className="text-sm text-bb-muted-text font-body">
                                                Cost: {formatGold(template.cost)}
                                            </div>
                                            <div className="text-sm text-bb-text-dark font-mono font-bold mt-1">
                                                MA{template.stats.MA} ST{template.stats.ST} AG{template.stats.AG}+ PA{template.stats.PA}+ AV{template.stats.AV}+
                                            </div>
                                        </div>
                                        <Button
                                            className="!m-0 !px-4 !py-2 !text-base"
                                            onClick={() => handleHirePlayer(template.positionName)}
                                            disabled={team.treasury < template.cost}
                                        >
                                            HIRE
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div>
                        {/* Team Info */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
                            <SectionTitle>Team Info</SectionTitle>
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
                            <div className="p-3 my-1 bg-bb-ink-blue text-bb-parchment rounded font-bold font-heading flex justify-between items-center">
                                <span>Treasury:</span>
                                <span>{formatGold(team.treasury)}</span>
                            </div>
                            <div className="p-3 my-1 bg-bb-parchment rounded text-bb-text-dark font-body border border-bb-divider flex justify-between items-center">
                                <span>Team Value:</span>
                                <span className="font-bold">{formatGold(calculateTeamValue(team))}</span>
                            </div>
                            <div className="p-3 my-1 bg-bb-parchment rounded text-bb-text-dark font-body border border-bb-divider flex justify-between items-center">
                                <span>Rerolls: {team.rerolls} ({formatGold(roster.rerollCost)} each)</span>
                                <Button
                                    className="!m-0 !px-3 !py-1 !text-sm"
                                    onClick={handleBuyReroll}
                                    disabled={team.treasury < roster.rerollCost}
                                >
                                    +
                                </Button>
                            </div>
                        </div>

                        {/* Current Roster */}
                        <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider mt-5">
                            <SectionTitle>Current Roster ({team.players.length}/16)</SectionTitle>
                            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto pr-2">
                                {team.players.length === 0 ? (
                                    <div className="text-bb-muted-text text-center py-10 italic font-body">No players hired yet</div>
                                ) : (
                                    team.players.map(player => (
                                        <div
                                            key={player.id}
                                            className="bg-bb-parchment border border-bb-divider rounded p-3 flex justify-between items-center gap-2.5 transition-colors hover:bg-white"
                                        >
                                            <div className="flex-1">
                                                <div className="font-bold font-heading text-bb-ink-blue mb-1 uppercase">
                                                    #{player.number} {player.positionName}
                                                </div>
                                                <div className="text-sm text-bb-text-dark font-mono font-bold">
                                                    MA{player.stats.MA} ST{player.stats.ST} AG{player.stats.AG}+ PA{player.stats.PA}+ AV{player.stats.AV}+
                                                </div>
                                            </div>
                                            <DangerButton
                                                className="!m-0 !px-4 !py-2 !text-base"
                                                onClick={() => handleFirePlayer(player.id)}
                                            >
                                                FIRE
                                            </DangerButton>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between gap-5 mt-8 md:flex-col">
                    <Button onClick={handleBack}>
                        ← Back to Team Management
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!canSave}
                    >
                        Save Team {!canSave && `(${7 - team.players.length} more needed)`}
                    </Button>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
