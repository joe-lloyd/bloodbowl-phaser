import React, { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';

interface TurnoverOverlayProps {
    eventBus: EventBus;
}

export const TurnoverOverlay: React.FC<TurnoverOverlayProps> = ({ eventBus }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const handleTurnover = (data: { teamId: string; reason: string }) => {
            setMessage(data.reason || "TURNOVER");
            setIsVisible(true);

            // Hide after animation (approx 2.5s)
            setTimeout(() => {
                setIsVisible(false);
            }, 2500);
        };

        eventBus.on('ui:turnover', handleTurnover);

        return () => {
            eventBus.off('ui:turnover', handleTurnover);
        };
    }, [eventBus]);

    if (!isVisible) return null;

    return (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="flex flex-col items-center animate-zoom-in-out">
                {/* Main Text */}
                <h1 className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 border-red-900 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] tracking-tighter transform -rotate-6 uppercase"
                    style={{ WebkitTextStroke: '3px white' }}>
                    TURNOVER
                </h1>

                {/* Reason Subtext */}
                <div className="mt-4 bg-black/80 px-8 py-2 border-2 border-red-600 rounded-lg transform rotate-2">
                    <span className="text-2xl font-bold text-white uppercase tracking-widest animate-pulse">
                        {message}
                    </span>
                </div>
            </div>
        </div>
    );
};
