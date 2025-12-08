import { useState, useEffect } from 'react';
import { EventBus } from '../../services/EventBus';
import { useEventEmit } from '../hooks/useEventBus';
import { Team } from '../../types/Team';
import { loadTeams } from '../../managers/TeamManager';
import './TeamSelect.css';

interface TeamSelectProps {
    eventBus: EventBus;
}

/**
 * Team Selection Component
 * Select teams for Player 1 and Player 2 before starting a game
 */
export function TeamSelect({ eventBus }: TeamSelectProps) {
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeam1, setSelectedTeam1] = useState<Team | null>(null);
    const [selectedTeam2, setSelectedTeam2] = useState<Team | null>(null);
    const emit = useEventEmit(eventBus);

    useEffect(() => {
        setTeams(loadTeams());
    }, []);

    const handleSelectTeam1 = (team: Team) => {
        setSelectedTeam1(team);
    };

    const handleSelectTeam2 = (team: Team) => {
        setSelectedTeam2(team);
    };

    const handleStartGame = () => {
        if (!selectedTeam1 || !selectedTeam2 || selectedTeam1.id === selectedTeam2.id) {
            console.log('Cannot start game - invalid team selection');
            return;
        }

        console.log('Starting game with teams:', selectedTeam1.name, 'vs', selectedTeam2.name);

        // Emit event to start the game
        // The Phaser scene will handle ServiceContainer initialization
        emit('ui:startGame', {
            team1: selectedTeam1,
            team2: selectedTeam2,
        });

        console.log('Emitted ui:startGame event');
    };

    const handleBack = () => {
        emit('ui:sceneChange', { scene: 'MenuScene' });
    };

    const canStart =
        selectedTeam1 !== null &&
        selectedTeam2 !== null &&
        selectedTeam1.id !== selectedTeam2.id;

    if (teams.length < 2) {
        return (
            <div className="team-select">
                <div className="team-select__header">
                    <h1 className="team-select__title">TEAM SELECTION</h1>
                </div>

                <div className="team-select__insufficient">
                    <div className="team-select__insufficient-title">
                        You need at least 2 teams to play!
                    </div>
                    <div className="team-select__insufficient-text">
                        Go to Build Team to create teams first.
                    </div>
                </div>

                <div className="team-select__actions">
                    <button className="team-select__back" onClick={handleBack}>
                        ← Back to Menu
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="team-select">
            <div className="team-select__header">
                <h1 className="team-select__title">TEAM SELECTION</h1>
                <div className="team-select__subtitle">Friendly Sevens Match</div>
            </div>

            <div className="team-select__content">
                {/* Player 1 Selection */}
                <div className="team-select__player-section">
                    <h2 className="team-select__player-title">Player 1</h2>
                    {teams.map((team) => (
                        <button
                            key={team.id}
                            className={`team-select__team-btn ${selectedTeam1?.id === team.id ? 'team-select__team-btn--selected' : ''
                                }`}
                            onClick={() => handleSelectTeam1(team)}
                        >
                            {team.name} ({team.rosterName})
                        </button>
                    ))}
                </div>

                {/* VS */}
                <div className="team-select__vs">VS</div>

                {/* Player 2 Selection */}
                <div className="team-select__player-section">
                    <h2 className="team-select__player-title">Player 2</h2>
                    {teams.map((team) => (
                        <button
                            key={team.id}
                            className={`team-select__team-btn ${selectedTeam2?.id === team.id ? 'team-select__team-btn--selected' : ''
                                }`}
                            onClick={() => handleSelectTeam2(team)}
                        >
                            {team.name} ({team.rosterName})
                        </button>
                    ))}
                </div>
            </div>

            <div className="team-select__actions">
                <button className="team-select__back" onClick={handleBack}>
                    ← Back to Menu
                </button>

                <button
                    className="team-select__start"
                    onClick={handleStartGame}
                    disabled={!canStart}
                >
                    Start Game →
                </button>
            </div>
        </div>
    );
}
