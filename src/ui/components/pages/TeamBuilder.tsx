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
import { Title } from '../componentWarehouse/Titles';

interface TeamBuilderProps {
    eventBus: EventBus;
    teamId?: string;
}

const TEAM_COLORS = [
    0xff0000, // Red
    0x0000ff, // Blue
    0x00ff00, // Green
    0xffff00, // Yellow
    0xff00ff, // Magenta
    0x00ffff, // Cyan
    0xff8800, // Orange
    0x8800ff, // Purple
    0xffffff, // White
    0x888888, // Grey
];

export function TeamBuilder({ eventBus, teamId }: TeamBuilderProps) {
    const [team, setTeam] = useState<Team | null>(null);
    const [selectedRace, setSelectedRace] = useState<RosterName>(RosterName.AMAZON);
    const [selectedColor, setSelectedColor] = useState<number>(0xff0000);
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
            <MinHeightContainer className="bg-blood-bowl-parchment">
                <Parchment $intensity="low" />
                <ContentContainer>
                    <div>Loading...</div>
                </ContentContainer>
            </MinHeightContainer>
        );
    }

    const roster = getRosterByRosterName(selectedRace);
    const canSave = team.players.length >= 7;

    return (
        <MinHeightContainer className="bg-blood-bowl-parchment">
            <Parchment $intensity="low" />

            <ContentContainer>
                <div className="text-center mb-8">
                    <Title>TEAM BUILDER</Title>
                </div>

                <div className="grid grid-cols-2 gap-10 mb-10 lg:grid-cols-1">
                    {/* Left Column */}
                    <div>
                        {/* Race Selection */}
                        <div className="bg-white/90 rounded-lg p-6 shadow-md">
                            <h3 className="text-blood-bowl-primary text-xl mb-4 border-b-2 border-blood-bowl-primary pb-2 uppercase">
                                Select Race
                            </h3>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
                                {getAvailableRosterNames().map(race => (
                                    <button
                                        key={race}
                                        className={`px-3 py-2 text-white border-none cursor-pointer rounded text-sm transition-colors hover:bg-blood-bowl-primary-dark ${selectedRace === race
                                                ? 'bg-blood-bowl-primary-dark border-2 border-blood-bowl-gold'
                                                : 'bg-blood-bowl-primary'
                                            }`}
                                        onClick={() => handleRaceChange(race)}
                                    >
                                        {race}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Color Selection */}
                        <div className="bg-white/90 rounded-lg p-6 shadow-md mt-5">
                            <h3 className="text-blood-bowl-primary text-xl mb-4 border-b-2 border-blood-bowl-primary pb-2 uppercase">
                                Team Color
                            </h3>
                            <div className="flex gap-2 flex-wrap">
                                {TEAM_COLORS.map(color => (
                                    <button
                                        key={color}
                                        className={`w-10 h-10 rounded-full cursor-pointer transition-all hover:scale-110 hover:shadow-lg ${selectedColor === color
                                                ? 'border-4 border-blood-bowl-primary'
                                                : 'border-2 border-gray-300'
                                            }`}
                                        style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                                        onClick={() => handleColorChange(color)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Available Players */}
                        <div className="bg-white/90 rounded-lg p-6 shadow-md mt-5">
                            <h3 className="text-blood-bowl-primary text-xl mb-4 border-b-2 border-blood-bowl-primary pb-2 uppercase">
                                Available Players
                            </h3>
                            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto">
                                {roster.playerTemplates.map(template => (
                                    <div
                                        key={template.positionName}
                                        className="bg-gray-50 border border-gray-200 rounded p-3 flex justify-between items-center gap-2.5 transition-colors hover:bg-blood-bowl-light-blue"
                                    >
                                        <div className="flex-1">
                                            <div className="font-bold text-blood-bowl-primary mb-1">
                                                {template.positionName}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                Cost: {formatGold(template.cost)}
                                            </div>
                                            <div className="text-sm text-gray-800 font-mono">
                                                MA{template.stats.MA} ST{template.stats.ST} AG{template.stats.AG}+ PA{template.stats.PA}+ AV{template.stats.AV}+
                                            </div>
                                        </div>
                                        <Button
                                            className="!m-0 !px-4 !py-2"
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
                        <div className="bg-white/90 rounded-lg p-6 shadow-md">
                            <h3 className="text-blood-bowl-primary text-xl mb-4 border-b-2 border-blood-bowl-primary pb-2 uppercase">
                                Team Info
                            </h3>
                            <input
                                type="text"
                                className="w-full p-3 text-lg border-2 border-blood-bowl-primary rounded mb-4 font-bold text-blood-bowl-primary focus:outline-none focus:border-blood-bowl-primary-dark focus:shadow-[0_0_0_3px_rgba(29,56,96,0.1)]"
                                value={team.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="Team Name"
                            />
                            <div className="p-2.5 my-1 bg-blood-bowl-light-blue rounded font-bold text-blood-bowl-primary flex justify-between items-center">
                                <span>Treasury:</span>
                                <span>{formatGold(team.treasury)}</span>
                            </div>
                            <div className="p-2.5 my-1 bg-gray-50 rounded text-gray-800 flex justify-between items-center">
                                <span>Team Value:</span>
                                <span>{formatGold(calculateTeamValue(team))}</span>
                            </div>
                            <div className="p-2.5 my-1 bg-gray-50 rounded text-gray-800 flex justify-between items-center">
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
                        <div className="bg-white/90 rounded-lg p-6 shadow-md mt-5">
                            <h3 className="text-blood-bowl-primary text-xl mb-4 border-b-2 border-blood-bowl-primary pb-2 uppercase">
                                Current Roster ({team.players.length}/16)
                            </h3>
                            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto">
                                {team.players.length === 0 ? (
                                    <div className="text-gray-500 text-center py-10 italic">No players hired yet</div>
                                ) : (
                                    team.players.map(player => (
                                        <div
                                            key={player.id}
                                            className="bg-gray-50 border border-gray-200 rounded p-3 flex justify-between items-center gap-2.5 transition-colors hover:bg-blood-bowl-light-blue"
                                        >
                                            <div className="flex-1">
                                                <div className="font-bold text-blood-bowl-primary mb-1">
                                                    #{player.number} {player.positionName}
                                                </div>
                                                <div className="text-sm text-gray-800 font-mono">
                                                    MA{player.stats.MA} ST{player.stats.ST} AG{player.stats.AG}+ PA{player.stats.PA}+ AV{player.stats.AV}+
                                                </div>
                                            </div>
                                            <DangerButton
                                                className="!m-0 !px-4 !py-2"
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
