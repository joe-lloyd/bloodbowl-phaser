import { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventEmit } from '../../hooks/useEventBus';
import { Team } from '../../../types/Team';
import { loadTeams, deleteTeam } from '../../../managers/TeamManager';
import Parchment from '../componentWarehouse/Parchment';
import ContentContainer from '../componentWarehouse/ContentContainer';
import MinHeightContainer from '../componentWarehouse/MinHeightContainer';
import { Button, DangerButton } from '../componentWarehouse/Button';
import { Title } from '../componentWarehouse/Titles';

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
        <MinHeightContainer className="bg-blood-bowl-parchment">
            <Parchment $intensity="low" />

            <ContentContainer>
                <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
                    <Title>TEAM MANAGEMENT</Title>
                    <Button onClick={handleCreateTeam}>
                        + Create New Team
                    </Button>
                </div>

                {teams.length === 0 ? (
                    <p className="text-gray-600 text-center italic py-10">No teams created yet</p>
                ) : (
                    <div className="flex flex-col gap-4 mb-8">
                        {teams.map((team) => (
                            <div
                                key={team.id}
                                className="bg-white/90 rounded-lg p-6 shadow-md flex justify-between items-center gap-8 transition-all hover:-translate-y-0.5 hover:shadow-lg md:flex-col md:items-start"
                            >
                                <div className="flex-1">
                                    <div className="text-xl font-bold text-blood-bowl-primary mb-2">
                                        {team.name} ({team.rosterName})
                                    </div>
                                    <div className="text-gray-600 text-sm">
                                        {team.rosterName} • {team.players.length} players • {formatGold(team.treasury)} treasury
                                    </div>
                                </div>

                                <div className="flex gap-2.5 shrink-0 md:w-full">
                                    <Button onClick={() => handleEditTeam(team.id)}>
                                        Edit
                                    </Button>
                                    <DangerButton onClick={() => handleDeleteTeam(team.id)}>
                                        Delete
                                    </DangerButton>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-5">
                    <Button onClick={handleBack}>
                        ← Back to Menu
                    </Button>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
