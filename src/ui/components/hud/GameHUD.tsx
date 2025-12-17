import React, { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventBus } from '../../hooks/useEventBus';
import { ServiceContainer } from '../../../services/ServiceContainer';
import { TurnIndicator } from './TurnIndicator';
import { EndTurnButton } from './EndTurnButton';
import { NotificationFeed } from './NotificationFeed';
import { GamePhase } from '../../../types/GameState';

import { CoinFlipOverlay } from './CoinFlipOverlay';
import { SetupControls } from './SetupControls';
import { ConfirmationModal } from './ConfirmationModal';

import { DiceLog } from './DiceLog';
import { PlayerInfoPanel } from './PlayerInfoPanel';
import { BlockDiceDialog } from './BlockDiceDialog';
import { FollowUpDialog } from './FollowUpDialog';
import { TurnoverOverlay } from './TurnoverOverlay';

interface GameHUDProps {
    eventBus: EventBus;
}

export const GameHUD: React.FC<GameHUDProps> = ({ eventBus }) => {
    // State
    const [turnData, setTurnData] = useState({
        turnNumber: 1,
        activeTeamName: 'Loading...',
        isTeam1Active: true,
        phase: GamePhase.SETUP // Default phase
    });
    const [notifications, setNotifications] = useState<{ id: string, text: string }[]>([]);
    const [showEndTurn, setShowEndTurn] = useState(false);

    // Initial State Load
    useEffect(() => {
        try {
            const container = ServiceContainer.getInstance();
            const state = container.gameService.getState();
            if (state) {
                const activeTeamId = state.activeTeamId || '';
                const activeTeam = container.gameService.getTeam(activeTeamId);
                const team1 = container.gameService.getTeam(state.turn.teamId) || activeTeam;

                if (activeTeam) {
                    setTurnData({
                        turnNumber: state.turn.turnNumber,
                        activeTeamName: activeTeam.name,
                        isTeam1Active: activeTeamId === (team1?.id || 'team1'), // Roughly correct for now
                        phase: state.phase
                    });
                }
            }
        } catch (e) {
            console.error('GameService not ready yet');
        }
    }, []);

    // Phase change listener
    useEventBus(eventBus, 'phaseChanged', (data) => {
        setTurnData(prev => ({ ...prev, phase: data.phase }));
    });

    // Turn started listener
    useEventBus(eventBus, 'turnStarted', (turn) => {
        const container = ServiceContainer.getInstance();
        const activeTeam = container.gameService.getTeam(turn.teamId);

        if (activeTeam) {
            setTurnData({
                turnNumber: turn.turnNumber,
                activeTeamName: activeTeam.name,
                isTeam1Active: turn.teamId === 'team1', // Simplified - assumes team IDs are 'team1' and 'team2'
                phase: container.gameService.getState().phase
            });
        }
    });

    // Show end turn button when player moves
    useEventBus(eventBus, 'playerMoved', () => {
        setShowEndTurn(true);
    });

    // Hide end turn button when turn ends
    useEventBus(eventBus, 'turnEnded', () => {
        setShowEndTurn(false);
    });

    // Kickoff started listener
    useEventBus(eventBus, 'kickoffStarted', () => {
        setTurnData(prev => ({
            ...prev,
            phase: GamePhase.KICKOFF
        }));
    });

    useEventBus(eventBus, 'ui:notification', (msg) => {
        addNotification(msg);
    });

    // Helper to add notification
    const addNotification = (text: string) => {
        const id = `${text}-${Date.now()}`;
        setNotifications(prev => {
            if (prev.some(n => n.id === id)) {
                return prev;
            }
            return [...prev, { id, text }];
        });

        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 3000);
    };

    const handleEndTurn = () => {
        const container = ServiceContainer.getInstance();
        container.gameService.endTurn();
    };

    return (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-50">
            {/* Top Bar: Turn Indicator */}
            <div className="flex justify-center w-full">
                <TurnIndicator
                    turnNumber={turnData.turnNumber}
                    activeTeamName={turnData.activeTeamName}
                    isTeam1Active={turnData.isTeam1Active}
                    phase={turnData.phase}
                />
            </div>

            {/* Overlays */}
            <CoinFlipOverlay eventBus={eventBus} />
            <SetupControls eventBus={eventBus} />
            <ConfirmationModal eventBus={eventBus} />
            <BlockDiceDialog eventBus={eventBus} />
            <FollowUpDialog eventBus={eventBus} />
            <TurnoverOverlay eventBus={eventBus} />

            {/* Dice Log (Bottom Left) */}
            <DiceLog eventBus={eventBus} />

            {/* Player Info Panel (Bottom Right) */}
            <PlayerInfoPanel eventBus={eventBus} />

            {/* Middle: Notifications Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <NotificationFeed messages={notifications} />
            </div>

            {/* Bottom Bar: End Turn Button */}
            <div className="flex justify-end w-full pb-4 pr-4 pointer-events-auto">
                {showEndTurn && (
                    <EndTurnButton onClick={handleEndTurn} />
                )}
            </div>
        </div>
    );
};
