import { useState, useEffect } from 'react';
import { EventBus } from '../../services/EventBus';
import { useEventEmit } from '../hooks/useEventBus';
import {
    Team,
    RosterName,
    createTeam,
    addPlayerToTeam,
    calculateTeamValue,
} from '../../types/Team';
import { PlayerTemplate, createPlayer } from '../../types/Player';
import { getRosterByRosterName, getAvailableRosterNames } from '../../data/RosterTemplates';
import * as TeamManager from '../../managers/TeamManager';
import './TeamBuilder.css';

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

    if (!team) return <div className="team-builder">Loading...</div>;

    const roster = getRosterByRosterName(selectedRace);
    const canSave = team.players.length >= 7;

    return (
        <div className="team-builder">
            <div className="team-builder__header">
                <h1 className="team-builder__title">TEAM BUILDER</h1>
            </div>

            <div className="team-builder__main">
                {/* Left Column */}
                <div>
                    {/* Race Selection */}
                    <div className="team-builder__section">
                        <h3 className="team-builder__section-title">SELECT RACE</h3>
                        <div className="team-builder__race-buttons">
                            {getAvailableRosterNames().map(race => (
                                <button
                                    key={race}
                                    className={`team-builder__race-btn ${selectedRace === race ? 'team-builder__race-btn--selected' : ''}`}
                                    onClick={() => handleRaceChange(race)}
                                >
                                    {race}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color Selection */}
                    <div className="team-builder__section">
                        <h3 className="team-builder__section-title">TEAM COLOR</h3>
                        <div className="team-builder__color-buttons">
                            {TEAM_COLORS.map(color => (
                                <button
                                    key={color}
                                    className={`team-builder__color-btn ${selectedColor === color ? 'team-builder__color-btn--selected' : ''}`}
                                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                                    onClick={() => handleColorChange(color)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Available Players */}
                    <div className="team-builder__section">
                        <h3 className="team-builder__section-title">AVAILABLE PLAYERS</h3>
                        <div className="team-builder__player-list">
                            {roster.playerTemplates.map(template => (
                                <div key={template.positionName} className="team-builder__player-card">
                                    <div className="team-builder__player-name">{template.positionName}</div>
                                    <div className="team-builder__player-details">
                                        Cost: {formatGold(template.cost)}
                                    </div>
                                    <div className="team-builder__player-stats">
                                        MA{template.stats.MA} ST{template.stats.ST} AG{template.stats.AG}+ PA{template.stats.PA}+ AV{template.stats.AV}+
                                    </div>
                                    <button
                                        className="team-builder__player-btn team-builder__player-btn--hire"
                                        onClick={() => handleHirePlayer(template.positionName)}
                                        disabled={team.treasury < template.cost}
                                    >
                                        HIRE
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div>
                    {/* Team Info */}
                    <div className="team-builder__section">
                        <h3 className="team-builder__section-title">TEAM INFO</h3>
                        <input
                            type="text"
                            className="team-builder__team-name"
                            value={team.name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder="Team Name"
                        />
                        <div className="team-builder__info-row team-builder__info-row--treasury">
                            Treasury: {formatGold(team.treasury)}
                        </div>
                        <div className="team-builder__info-row">
                            Team Value: {formatGold(calculateTeamValue(team))}
                        </div>
                        <div className="team-builder__info-row">
                            Rerolls: {team.rerolls} ({formatGold(roster.rerollCost)} each)
                            <button
                                className="team-builder__player-btn team-builder__player-btn--hire"
                                style={{ marginLeft: '10px', padding: '4px 8px' }}
                                onClick={handleBuyReroll}
                                disabled={team.treasury < roster.rerollCost}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Current Roster */}
                    <div className="team-builder__section">
                        <h3 className="team-builder__section-title">CURRENT ROSTER ({team.players.length}/16)</h3>
                        <div className="team-builder__player-list">
                            {team.players.length === 0 ? (
                                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                                    No players hired yet
                                </div>
                            ) : (
                                team.players.map(player => (
                                    <div key={player.id} className="team-builder__player-card">
                                        <div className="team-builder__player-name">
                                            #{player.number} {player.positionName}
                                        </div>
                                        <div className="team-builder__player-stats">
                                            MA{player.stats.MA} ST{player.stats.ST} AG{player.stats.AG}+ PA{player.stats.PA}+ AV{player.stats.AV}+
                                        </div>
                                        <button
                                            className="team-builder__player-btn team-builder__player-btn--fire"
                                            onClick={() => handleFirePlayer(player.id)}
                                        >
                                            FIRE
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="team-builder__actions">
                <button className="team-builder__back" onClick={handleBack}>
                    ← Back to Team Management
                </button>
                <button
                    className="team-builder__save"
                    onClick={handleSave}
                    disabled={!canSave}
                >
                    Save Team {!canSave && `(${7 - team.players.length} more needed)`}
                </button>
            </div>
        </div>
    );
}
