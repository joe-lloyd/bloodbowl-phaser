import React, { useState, useEffect } from 'react';
import { IEventBus } from '../../../services/EventBus';
import { useEventBus } from '../../hooks/useEventBus';

interface ConfirmationModalProps {
    eventBus: IEventBus;
}

interface ConfirmationData {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    actionId: string; // To verify which action we are confirming
    risky?: boolean; // If true, show warning colors
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ eventBus }) => {
    const [data, setData] = useState<ConfirmationData | null>(null);

    useEventBus(eventBus, 'ui:requestConfirmation', (payload: any) => {
        setData(payload);
    });

    const handleConfirm = () => {
        if (!data) return;
        eventBus.emit('ui:confirmationResult', {
            confirmed: true,
            actionId: data.actionId
        });
        setData(null);
    };

    const handleCancel = () => {
        if (!data) return;
        eventBus.emit('ui:confirmationResult', {
            confirmed: false,
            actionId: data.actionId
        });
        setData(null);
    };

    if (!data) return null;

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
            <div className={`
                w-96 p-6 rounded-lg shadow-xl border-2 
                ${data.risky ? 'bg-slate-900 border-red-500' : 'bg-slate-800 border-yellow-400'}
                animate-in fade-in zoom-in duration-200
            `}>
                <h3 className={`text-xl font-bold mb-4 ${data.risky ? 'text-red-400' : 'text-yellow-400'}`}>
                    {data.title}
                </h3>

                <div className="text-gray-200 mb-6 whitespace-pre-line font-medium leading-relaxed">
                    {data.message}
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold transition-colors border border-slate-500"
                    >
                        {data.cancelLabel || 'Cancel'}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`
                            px-4 py-2 rounded font-bold shadow-lg transition-transform hover:scale-105
                            ${data.risky
                                ? 'bg-red-600 hover:bg-red-500 text-white border border-red-400'
                                : 'bg-green-600 hover:bg-green-500 text-white border border-green-400'}
                        `}
                    >
                        {data.confirmLabel || 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};
