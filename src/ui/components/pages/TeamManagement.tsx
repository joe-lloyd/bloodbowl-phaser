import { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventEmit } from '../../hooks/useEventBus';
import { Team, calculateTeamValue } from '../../../types/Team';
import { loadTeams, deleteTeam } from '../../../game/managers/TeamManager';
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
            setTeams(loadTeams());
        }
    };

    const handleBack = () => {
        emit('ui:sceneChange', { scene: 'MenuScene' });
    };

    const formatGold = (amount: number): string => {
        return `${(amount / 1000).toFixed(0)}k`;
    };

    const numToHex = (num: number): string => {
        return '#' + num.toString(16).padStart(6, '0');
    };

    return (
        <MinHeightContainer className="!justify-start">
            <Parchment $intensity="low" />

            <ContentContainer className="">
                <div className="flex justify-between items-center mb-10 flex-wrap gap-6">
                    <div>
                        <Title>TEAM MANAGEMENT</Title>
                        <p className="text-bb-muted-text font-body mt-2">Manage your roster and prepare for the next match.</p>
                    </div>
                    <Button onClick={handleCreateTeam} className="px-10 py-5 text-2xl shadow-lg hover:shadow-xl">
                        + Create New Team
                    </Button>
                </div>

                {teams.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-bb-divider rounded-xl bg-white/20">
                        <p className="text-bb-muted-text text-center italic text-2xl font-body mb-6">No teams found in the archives.</p>
                        <Button onClick={handleCreateTeam}>Draft First Team</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                        {teams.map((team) => (
                            <div
                                key={team.id}
                                className="
                                    relative overflow-hidden 
                                    bg-bb-ink-blue rounded-xl 
                                    border-2 border-bb-dark-gold
                                    shadow-lg transition-all duration-200 
                                    hover:shadow-2xl hover:scale-[1.01]
                                    flex flex-col
                                "
                            >
                                {/* Team Color Strip */}
                                <div className="h-4 w-full border-b-2 border-bb-dark-gold" style={{ backgroundColor: numToHex(team.colors.primary) }} />

                                <div className="p-8 flex-1 flex flex-col">
                                    <div className="mb-8">
                                        <div className="font-heading font-bold text-sm uppercase text-bb-dark-gold tracking-widest mb-2 border-b border-bb-dark-gold/30 pb-2 inline-block">
                                            {team.rosterName}
                                        </div>
                                        <h3 className="font-heading text-4xl font-bold text-bb-parchment leading-tight drop-shadow-md">
                                            {team.name}
                                        </h3>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-8 bg-black/20 p-6 rounded-lg border border-bb-dark-gold/30">
                                        <div>
                                            <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">Team Value</span>
                                            <span className="font-heading text-2xl text-bb-parchment">{formatGold(calculateTeamValue(team))}</span>
                                        </div>
                                        <div>
                                            <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">Treasury</span>
                                            <span className="font-heading text-2xl text-white">{formatGold(team.treasury)}</span>
                                        </div>
                                        <div>
                                            <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">Roster</span>
                                            <span className="font-heading text-2xl text-white">{team.players.length}/11</span>
                                        </div>
                                        <div>
                                            <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">Record</span>
                                            <span className="font-heading text-2xl text-white">{team.wins}-{team.draws}-{team.losses}</span>
                                        </div>
                                    </div>

                                    {/* Spacer to push buttons down */}
                                    <div className="flex-1"></div>

                                    {/* Actions */}
                                    <div className="flex gap-4 mt-2">
                                        <Button onClick={() => handleEditTeam(team.id)} className="flex-1 py-4 text-xl">
                                            Manage Team
                                        </Button>
                                        <DangerButton onClick={() => handleDeleteTeam(team.id)} className="px-6">
                                            🗑️
                                        </DangerButton>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-8 border-t-2 border-bb-divider pt-8">
                    <Button onClick={handleBack} className="!bg-bb-warm-paper !text-bb-ink-blue border-bb-ink-blue hover:!bg-bb-ink-blue hover:!text-white">
                        ← Back to Menu
                    </Button>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
