import React, { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventBus } from '../../hooks/useEventBus';
import { Team } from '../../../types/Team';
import { Button, DangerButton } from '../componentWarehouse/Button';
import { Title } from '../componentWarehouse/Titles';

interface CoinFlipProps {
    eventBus: EventBus;
}

export const CoinFlipOverlay: React.FC<CoinFlipProps> = ({ eventBus }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState<'START' | 'FLIPPING' | 'RESULT'>('START');
    const [teams, setTeams] = useState<{ team1: Team, team2: Team } | null>(null);
    const [winner, setWinner] = useState<Team | null>(null);
    const [rotation, setRotation] = useState(0);

    // Listen for start request
    useEventBus(eventBus, 'ui:startCoinFlip', (data) => {
        setTeams({ team1: data.team1, team2: data.team2 });
        setIsVisible(true);
        setStep('START');
        setRotation(0);
    });

    // Initial check for active coin flip (Race condition fix)
    useEffect(() => {
        const checkState = () => {
            eventBus.emit('ui:requestCoinFlipState');
        };
        // Small delay to ensure GameScene is ready
        const timer = setTimeout(checkState, 100);
        return () => clearTimeout(timer);
    }, [eventBus]);

    const handleFlip = () => {
        setStep('FLIPPING');

        // Simple animation logic
        let currentRotation = 0;
        const interval = setInterval(() => {
            currentRotation += 72;
            setRotation(currentRotation);
        }, 50);

        setTimeout(() => {
            clearInterval(interval);
            if (!teams) return;

            // Determine winner
            const isTeam1 = Math.random() < 0.5;
            const winningTeam = isTeam1 ? teams.team1 : teams.team2;
            setWinner(winningTeam);
            setStep('RESULT');
            setRotation(0);
        }, 1500);
    };

    const handleChoice = (choice: 'kick' | 'receive') => {
        if (!teams || !winner) return;

        const loser = winner.id === teams.team1.id ? teams.team2 : teams.team1;
        const kickingTeam = choice === 'kick' ? winner : loser;
        const receivingTeam = choice === 'receive' ? winner : loser;

        eventBus.emit('ui:coinFlipComplete', { kickingTeam, receivingTeam });
        setIsVisible(false);
    };

    if (!isVisible || !teams) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 pointer-events-auto">
            <div className="bg-bb-parchment p-8 rounded-lg border-4 border-bb-gold shadow-2xl text-center max-w-lg w-full">
                <Title className="mb-8">COIN TOSS</Title>

                {step === 'START' && (
                    <div className="space-y-6">
                        <p className="text-xl font-heading text-bb-blood-red">
                            Who will kick off?
                        </p>
                        <div className="flex justify-center gap-8 text-bb-text-dark font-bold">
                            <span>{teams.team1.name}</span>
                            <span>VS</span>
                            <span>{teams.team2.name}</span>
                        </div>
                        <Button className="w-full text-xl py-3" onClick={handleFlip}>
                            FLIP COIN
                        </Button>
                    </div>
                )}

                {step === 'FLIPPING' && (
                    <div className="py-12 flex justify-center">
                        <div
                            className="text-6xl select-none transition-transform"
                            style={{ transform: `rotateY(${rotation}deg)` }}
                        >
                            🪙
                        </div>
                    </div>
                )}

                {step === 'RESULT' && winner && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-2xl font-heading text-bb-ink-blue mb-4">
                            {winner.name} Wins!
                        </div>
                        <p className="text-bb-muted-text mb-6">
                            Choose to Kick or Receive
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <Button onClick={() => handleChoice('kick')}>
                                KICK
                            </Button>
                            <DangerButton onClick={() => handleChoice('receive')}>
                                RECEIVE
                            </DangerButton>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
