import React from 'react';

import { GamePhase } from '../../../types/GameState';

interface TurnIndicatorProps {
    turnNumber: number;
    activeTeamName: string;
    isTeam1Active: boolean;
    phase?: GamePhase;
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({
    turnNumber,
    activeTeamName,
    isTeam1Active,
    phase
}) => {
    // If we are in KICKOFF phase, show "KICKOFF" instead of Turn Number
    const showKickoff = phase === GamePhase.KICKOFF;

    return (
        <div className="flex flex-col items-center pointer-events-none select-none">
            {/* Turn Counter Pill */}
            <div className={`
                mb-2 px-6 py-1
                ${showKickoff ? 'bg-bb-gold text-bb-ink-blue' : 'bg-bb-ink-blue text-bb-parchment'}
                border-2 border-bb-gold
                font-heading font-bold text-2xl
                shadow-chunky
            `}>
                {showKickoff ? "KICKOFF" : `TURN ${turnNumber}`}
            </div>

            {/* Active Team Banner */}
            <div className={`
                px-8 py-2
                font-heading font-bold text-3xl text-white uppercase tracking-wider
                shadow-lg
                border-y-2 border-bb-gold
                ${isTeam1Active ? 'bg-red-700' : 'bg-blue-700'} 
                /* Note: Ideally use team colors from props, but leveraging tailwind colors for now. 
                   Could replace with inline style for dynamic team colors. */
            `}
                style={/* fallback if dynamic colors needed */ {}}
            >
                {activeTeamName}
            </div>
        </div>
    );
};

