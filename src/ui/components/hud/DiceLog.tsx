import React, { useState, useEffect, useRef } from 'react';
import { EventBus } from '../../../services/EventBus';
import { useEventBus } from '../../hooks/useEventBus';

interface DiceLogProps {
    eventBus: EventBus;
}

interface RollEntry {
    id: number;
    rollType: string;
    diceType: string;
    teamId?: string;
    value: number | number[];
    total: number;
    description: string;
    passed?: boolean;
    timestamp: number;
}

export const DiceLog: React.FC<DiceLogProps> = ({ eventBus }) => {
    const [logs, setLogs] = useState<RollEntry[]>([]);
    const endRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of log
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEventBus(eventBus, 'diceRoll', (data) => {
        const newEntry: RollEntry = {
            id: Date.now() + Math.random(),
            ...data,
            timestamp: Date.now()
        };

        setLogs(prev => {
            const updated = [...prev, newEntry];
            if (updated.length > 50) return updated.slice(updated.length - 50);
            return updated;
        });
    });

    // Formatting helper
    const formatValue = (roll: RollEntry) => {
        if (Array.isArray(roll.value)) {
            return `[${roll.value.join(', ')}] = ${roll.total}`;
        }
        return `${roll.value}`;
    };

    // Color helper
    const getTeamColorClass = (teamId?: string) => {
        if (!teamId) return 'bg-gray-700 border-gray-500';
        // Simple toggle for now, ideally get from Team Data
        if (teamId.includes('team1')) return 'bg-red-900/80 border-red-500'; // Team 1 Red
        if (teamId.includes('team2')) return 'bg-blue-900/80 border-blue-500'; // Team 2 Blue
        return 'bg-gray-700 border-gray-500';
    };

    return (
        <div className="absolute bottom-4 left-4 w-80 max-h-64 flex flex-col pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between bg-black/80 px-3 py-1 border-t-2 border-x-2 border-bb-gold rounded-t-md">
                <span className="font-heading text-bb-gold text-lg">DICE LOG</span>
                <span className="text-xs text-gray-400">Recent Rolls</span>
            </div>

            {/* Log List */}
            <div className="flex-1 overflow-y-auto bg-black/60 border-2 border-bb-gold p-2 space-y-2 rounded-b-md scrollbar-thin scrollbar-thumb-bb-gold scrollbar-track-transparent">
                {logs.length === 0 && (
                    <div className="text-gray-500 text-sm italic text-center p-2">No rolls yet...</div>
                )}

                {logs.map(log => (
                    <div
                        key={log.id}
                        className={`
                            relative p-2 rounded border-l-4 shadow-sm animate-fade-in
                            ${getTeamColorClass(log.teamId)}
                        `}
                    >
                        {/* Header Row: Type & Dice */}
                        <div className="flex justify-between items-center text-xs text-gray-300 mb-1">
                            <span className="font-bold uppercase tracking-wide text-bb-parchment">{log.rollType}</span>
                            <span className="font-mono bg-black/40 px-1 rounded text-gray-400">{log.diceType}</span>
                        </div>

                        {/* Result Row */}
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-white">{log.description}</span>

                            {/* Pass/Fail Badge */}
                            {log.passed !== undefined && (
                                <span className={`
                                    ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded
                                    ${log.passed ? 'bg-green-600 text-green-100' : 'bg-red-600 text-red-100'}
                                `}>
                                    {log.passed ? 'PASS' : 'FAIL'}
                                </span>
                            )}
                        </div>

                        {/* Value Row (if simple description didn't cover it) */}
                        <div className="text-xs text-right mt-1 font-mono text-bb-gold">
                            Roll: {formatValue(log)}
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};
