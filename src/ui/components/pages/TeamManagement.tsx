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
        <MinHeightContainer className="bg-bb-parchment">
            <Parchment $intensity="low" />

            <ContentContainer>
                <div className="flex justify-between items-center mb-12 flex-wrap gap-6">
                    <Title>TEAM MANAGEMENT</Title>
                    <Button onClick={handleCreateTeam} className="text-xl">
                        + Create New Team
                    </Button>
                </div>

                {teams.length === 0 ? (
                    <p className="text-bb-muted-text text-center italic py-20 text-2xl font-body">No teams created yet</p>
                ) : (
                    <div className="flex flex-col gap-6 mb-12">
                        {teams.map((team) => (
                            <div
                                key={team.id}
                                className="
                                    bg-bb-warm-paper border border-bb-divider rounded-xl p-10 
                                    shadow-parchment-light 
                                    flex justify-between items-center gap-10 
                                    transition-bb duration-200 
                                    hover:-translate-y-1 hover:shadow-lg 
                                    md:flex-col md:items-start
                                "
                            >
                                <div className="flex-1">
                                    <div className="text-3xl font-heading font-bold text-bb-blood-red mb-3">
                                        {team.name}
                                    </div>
                                    <div className="text-bb-text-dark text-lg font-body">
                                        {team.rosterName} • {team.players.length} players • {formatGold(team.treasury)} treasury
                                    </div>
                                </div>

                                <div className="flex gap-4 shrink-0 md:w-full">
                                    <Button onClick={() => handleEditTeam(team.id)} className="!my-0">
                                        Edit Team
                                    </Button>
                                    <DangerButton onClick={() => handleDeleteTeam(team.id)} className="!my-0">
                                        Delete
                                    </DangerButton>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-8">
                    <Button onClick={handleBack}>
                        ← Back to Menu
                    </Button>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
