import { useState, useEffect } from 'react';
import { EventBus } from '../../services/EventBus';
import { useEventEmit } from '../hooks/useEventBus';
import { Team } from '../../types/Team';
import { loadTeams, deleteTeam } from '../../managers/TeamManager';
import './TeamManagement.css';

interface TeamManagementProps {
    eventBus: EventBus;
}

/**
 * Team Management Component
 * Lists all teams with create/edit/delete functionality
 */
export function TeamManagement({ eventBus }: TeamManagementProps) {
    const [teams, setTeams] = useState<Team[]>([]);
    const emit = useEventEmit(eventBus);

    useEffect(() => {
        // Load teams on mount
        setTeams(loadTeams());
    }, []);

    const handleCreateTeam = () => {
        emit('ui:sceneChange', { scene: 'TeamBuilderScene' });
    };

    const handleEditTeam = (teamId: string) => {
        emit('ui:sceneChange', { scene: 'TeamBuilderScene', data: { teamId } });
    };

    const handleDeleteTeam = (teamId: string) => {
        if (confirm('Are you sure you want to delete this team?')) {
            deleteTeam(teamId);
            setTeams(loadTeams()); // Reload teams
        }
    };

    const handleBack = () => {
        emit('ui:sceneChange', { scene: 'MenuScene' });
    };

    const formatGold = (amount: number): string => {
        return `${(amount / 1000).toFixed(0)}k`;
    };

    return (
        <div className="team-management">
            <div className="team-management__header">
                <h1 className="team-management__title">TEAM MANAGEMENT</h1>
                <button
                    className="team-management__create-btn"
                    onClick={handleCreateTeam}
                >
                    + Create New Team
                </button>
            </div>

            {teams.length === 0 ? (
                <p className="team-management__empty">No teams created yet</p>
            ) : (
                <div className="team-management__list">
                    {teams.map((team) => (
                        <div key={team.id} className="team-card">
                            <div className="team-card__info">
                                <div className="team-card__name">
                                    {team.name} ({team.rosterName})
                                </div>
                                <div className="team-card__details">
                                    {team.rosterName} • {team.players.length} players • {formatGold(team.treasury)} treasury
                                </div>
                            </div>

                            <div className="team-card__actions">
                                <button
                                    className="team-card__btn team-card__btn--edit"
                                    onClick={() => handleEditTeam(team.id)}
                                >
                                    [Edit]
                                </button>
                                <button
                                    className="team-card__btn team-card__btn--delete"
                                    onClick={() => handleDeleteTeam(team.id)}
                                >
                                    [Delete]
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button
                className="team-management__back"
                onClick={handleBack}
            >
                ← Back to Menu
            </button>
        </div>
    );
}
