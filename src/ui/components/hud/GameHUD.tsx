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
    const [notifications, setNotifications] = useState<{ id: number, text: string }[]>([]);
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

                // Show end turn button if in Play phase
                setShowEndTurn(state.phase === GamePhase.PLAY);
            }
        } catch (e) {
            console.warn("GameService not ready yet");
        }
    }, []);

    // Listeners
    useEventBus(eventBus, 'turnStarted', (data) => {
        const container = ServiceContainer.getInstance();
        const activeTeam = container.gameService.getTeam(data.teamId);

        if (activeTeam) {
            setTurnData(prev => ({
                ...prev,
                turnNumber: data.turnNumber,
                activeTeamName: activeTeam.name,
                isTeam1Active: data.teamId === container.gameService.getActiveTeamId()
            }));
            addNotification(`Turn ${data.turnNumber}: ${activeTeam.name}`);
        }
    });

    useEventBus(eventBus, 'phaseChanged', (data) => {
        setShowEndTurn(data.phase === GamePhase.PLAY);

        // Refresh state on phase change
        const container = ServiceContainer.getInstance();
        const state = container.gameService.getState();
        const activeTeam = container.gameService.getTeam(state.activeTeamId || '');
        if (activeTeam) {
            setTurnData(prev => ({
                ...prev,
                activeTeamName: activeTeam.name,
                isTeam1Active: state.activeTeamId === 'team1' || state.activeTeamId === container.gameService.getTeam('team1')?.id,
                phase: data.phase
            }));
        }
    });

    useEventBus(eventBus, 'ui:showSetupControls', (data: any) => {
        if (data.activeTeam) {
            setTurnData(prev => ({
                ...prev,
                activeTeamName: data.activeTeam.name,
                isTeam1Active: true // Simplified
            }));
        }
    });

    useEventBus(eventBus, 'ui:notification', (msg) => {
        addNotification(msg);
    });

    // Helper to add notification
    const addNotification = (text: string) => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, text }]);

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

            {/* Dice Log (Bottom Left) */}
            <DiceLog eventBus={eventBus} />

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
