import { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventEmit } from '../../hooks/useEventBus';
import { Team } from '../../../types/Team';
import { loadTeams } from '../../../managers/TeamManager';
import Parchment from '../componentWarehouse/Parchment';
import ContentContainer from '../componentWarehouse/ContentContainer';
import MinHeightContainer from '../componentWarehouse/MinHeightContainer';
import { Button } from '../componentWarehouse/Button';
import { Title } from '../componentWarehouse/Titles';

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
            <MinHeightContainer className="bg-blood-bowl-parchment">
                <Parchment $intensity="low" />

                <ContentContainer>
                    <div className="text-center mb-8">
                        <Title>TEAM SELECTION</Title>
                    </div>

                    <div className="text-center py-10 bg-white/90 rounded-lg my-5">
                        <h3 className="text-blood-bowl-danger text-xl mb-4">
                            You need at least 2 teams to play!
                        </h3>
                        <p className="text-gray-600">
                            Go to Build Team to create teams first.
                        </p>
                    </div>

                    <div className="flex justify-between gap-5 mt-8 md:flex-col">
                        <Button onClick={handleBack}>
                            ← Back to Menu
                        </Button>
                    </div>
                </ContentContainer>
            </MinHeightContainer>
        );
    }

    return (
        <MinHeightContainer className="bg-blood-bowl-parchment">
            <Parchment $intensity="low" />

            <ContentContainer>
                <div className="text-center mb-8">
                    <Title>TEAM SELECTION</Title>
                    <div className="inline-block bg-blood-bowl-gold text-blood-bowl-primary px-4 py-2 rounded font-bold mt-2.5">
                        Friendly Sevens Match
                    </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] gap-10 items-start my-10 lg:grid-cols-1 lg:gap-8">
                    {/* Player 1 Selection */}
                    <div className="bg-white/90 rounded-lg p-6 shadow-md">
                        <h2 className="text-blood-bowl-primary text-2xl mb-5 text-center border-b-2 border-blood-bowl-primary pb-2.5">
                            Player 1
                        </h2>
                        {teams.map((team) => (
                            <button
                                key={team.id}
                                className={`w-full p-4 my-2.5 text-white border-none cursor-pointer rounded transition-all text-left text-base hover:bg-blood-bowl-primary-dark hover:translate-x-1 active:bg-blood-bowl-primary ${selectedTeam1?.id === team.id
                                        ? 'bg-blood-bowl-primary-dark border-4 border-blood-bowl-gold'
                                        : 'bg-blood-bowl-primary'
                                    }`}
                                onClick={() => handleSelectTeam1(team)}
                            >
                                {team.name} ({team.rosterName})
                            </button>
                        ))}
                    </div>

                    {/* VS */}
                    <div className="text-5xl font-bold text-blood-bowl-danger text-center self-center p-5 bg-white/90 rounded-full w-20 h-20 flex items-center justify-center shadow-lg lg:w-full lg:h-auto lg:rounded-lg">
                        VS
                    </div>

                    {/* Player 2 Selection */}
                    <div className="bg-white/90 rounded-lg p-6 shadow-md">
                        <h2 className="text-blood-bowl-primary text-2xl mb-5 text-center border-b-2 border-blood-bowl-primary pb-2.5">
                            Player 2
                        </h2>
                        {teams.map((team) => (
                            <button
                                key={team.id}
                                className={`w-full p-4 my-2.5 text-white border-none cursor-pointer rounded transition-all text-left text-base hover:bg-blood-bowl-primary-dark hover:translate-x-1 active:bg-blood-bowl-primary ${selectedTeam2?.id === team.id
                                        ? 'bg-blood-bowl-primary-dark border-4 border-blood-bowl-gold'
                                        : 'bg-blood-bowl-primary'
                                    }`}
                                onClick={() => handleSelectTeam2(team)}
                            >
                                {team.name} ({team.rosterName})
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between gap-5 mt-8 md:flex-col">
                    <Button onClick={handleBack}>
                        ← Back to Menu
                    </Button>

                    <Button
                        onClick={handleStartGame}
                        disabled={!canStart}
                    >
                        Start Game →
                    </Button>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
