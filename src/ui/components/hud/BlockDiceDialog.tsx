import React, { useState, useEffect } from 'react';
import { EventBus } from '../../../services/EventBus';
import { BlockAnalysis } from '../../../types/Actions';

interface BlockDiceDialogProps {
    eventBus: EventBus;
}

export const BlockDiceDialog: React.FC<BlockDiceDialogProps> = ({ eventBus }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [data, setData] = useState<{
        attackerId: string;
        defenderId: string;
        analysis: BlockAnalysis;
    } | null>(null);

    const [isRolling, setIsRolling] = useState(false);
    const [results, setResults] = useState<string[] | null>(null); // e.g., ['POW', 'PUSH']

    useEffect(() => {
        const onOpen = (payload: any) => {
            setData(payload);
            setResults(null);
            setIsRolling(false);
            setIsOpen(true);
        };

        eventBus.on('ui:blockDialog', onOpen);

        return () => {
            eventBus.off('ui:blockDialog', onOpen);
        };
    }, [eventBus]);

    if (!isOpen || !data) return null;

    const { analysis } = data;
    const { diceCount, isUphill, attackerST, defenderST } = analysis;

    const handleRoll = () => {
        setIsRolling(true);
        setTimeout(() => {
            // Mock Dice Roll
            const newResults: string[] = [];

            // Dice Faces: skull, both_down, push, push, stumble, pow
            const faces = ['SKULL', 'BOTH_DOWN', 'PUSH', 'PUSH', 'STUMBLE', 'POW'];

            for (let i = 0; i < diceCount; i++) {
                const roll = Math.floor(Math.random() * 6);
                newResults.push(faces[roll]);
            }

            setResults(newResults);
            setIsRolling(false);
        }, 800);
    };

    const handleSelectResult = (result: string) => {
        // Emit result to GameService
        eventBus.emit('ui:blockResultSelected', {
            attackerId: data.attackerId,
            defenderId: data.defenderId,
            result
        });

        setIsOpen(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    // Helper to determine who chooses
    // Standard: Attacker chooses
    // Uphill: Defender chooses
    // Logic: If result is chosen by Active Player (User), we enable buttons if it's NOT Uphill.
    // If it IS Uphill, the AI (Defender) chooses... but for Hotseat, User chooses for Defender.
    // So we always allow choice for now.

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto">
            <div className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-6 w-[400px] text-white shadow-2xl">
                <h2 className="text-3xl font-black text-center text-yellow-400 mb-4 uppercase tracking-wider glow-text">
                    BLOCK!
                </h2>

                {/* Stats Comparison */}
                <div className="flex justify-between items-center mb-6 bg-slate-800 p-3 rounded">
                    <div className="text-center">
                        <div className="text-xs text-slate-400">ATTACKER</div>
                        <div className="text-2xl font-bold text-green-400">{attackerST}</div>
                    </div>
                    <div className="text-yellow-600 font-bold text-xl">VS</div>
                    <div className="text-center">
                        <div className="text-xs text-slate-400">DEFENDER</div>
                        <div className="text-2xl font-bold text-red-400">{defenderST}</div>
                    </div>
                </div>

                {/* Dice Info */}
                <div className="text-center mb-6">
                    <div className="text-lg font-bold">
                        {diceCount} DICE {isUphill ? <span className="text-red-500">(UPHILL)</span> : ""}
                    </div>
                    <div className="text-sm text-slate-400 italic">
                        {isUphill ? "Defender Chooses" : "Attacker Chooses"}
                    </div>
                </div>

                {/* Dice Results Area */}
                {results ? (
                    <div className="flex justify-center gap-4 mb-6">
                        {results.map((res, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelectResult(res)}
                                className="w-20 h-20 bg-slate-100 text-slate-900 font-bold rounded flex items-center justify-center hover:bg-yellow-400 hover:scale-110 transition-transform shadow-lg border-2 border-slate-400"
                            >
                                {res}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex justify-center mb-6 h-20 items-center">
                        {isRolling ? (
                            <span className="animate-pulse text-yellow-500 font-bold text-xl">ROLLING...</span>
                        ) : (
                            <div className="flex gap-2 opacity-50">
                                {Array.from({ length: diceCount }).map((_, i) => (
                                    <div key={i} className="w-16 h-16 bg-slate-700/50 rounded border border-slate-600"></div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-between">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300 transition-colors"
                    >
                        Cancel
                    </button>
                    {!results && (
                        <button
                            onClick={handleRoll}
                            disabled={isRolling}
                            className="px-8 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ROLL DICE
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
