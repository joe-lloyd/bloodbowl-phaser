import React, { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';

interface FollowUpDialogProps {
    eventBus: EventBus;
}

export const FollowUpDialog: React.FC<FollowUpDialogProps> = ({ eventBus }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [followUpData, setFollowUpData] = useState<{
        attackerId: string;
        targetSquare: { x: number; y: number };
    } | null>(null);

    useEffect(() => {
        const onFollowUpPrompt = (data: { attackerId: string; targetSquare: { x: number; y: number } }) => {
            setFollowUpData(data);
            setIsOpen(true);
        };

        eventBus.on('ui:followUpPrompt', onFollowUpPrompt);

        return () => {
            eventBus.off('ui:followUpPrompt', onFollowUpPrompt);
        };
    }, [eventBus]);

    const handleYes = () => {
        if (followUpData) {
            eventBus.emit('ui:followUpResponse', {
                attackerId: followUpData.attackerId,
                followUp: true,
                targetSquare: followUpData.targetSquare
            });
        }
        setIsOpen(false);
        setFollowUpData(null);
    };

    const handleNo = () => {
        if (followUpData) {
            eventBus.emit('ui:followUpResponse', {
                attackerId: followUpData.attackerId,
                followUp: false
            });
        }
        setIsOpen(false);
        setFollowUpData(null);
    };

    if (!isOpen || !followUpData) return null;

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
            <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[400px] text-white shadow-2xl">
                <h2 className="text-2xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider glow-text">
                    Follow Up?
                </h2>

                <p className="text-center text-slate-300 mb-6">
                    Do you want to follow up into the defender's square?
                </p>

                <div className="flex gap-4 justify-center">
                    <button
                        onClick={handleYes}
                        className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
                    >
                        YES
                    </button>
                    <button
                        onClick={handleNo}
                        className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-all hover:scale-105 active:scale-95"
                    >
                        NO
                    </button>
                </div>
            </div>
        </div>
    );
};
