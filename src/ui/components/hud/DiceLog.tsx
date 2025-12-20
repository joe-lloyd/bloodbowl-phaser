import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";

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

  useEventBus(eventBus, GameEventNames.DiceRoll, (data) => {
    const newEntry: RollEntry = {
      id: Date.now() + Math.random(),
      ...data,
      timestamp: Date.now(),
    };

    setLogs((prev) => {
      // Add new entry at the START (top) of the array
      const updated = [newEntry, ...prev];
      // Keep only the most recent 50 entries
      if (updated.length > 50) return updated.slice(0, 50);
      return updated;
    });
  });

  // Formatting helper
  const formatValue = (roll: RollEntry) => {
    if (Array.isArray(roll.value)) {
      return `[${roll.value.join(", ")}]`;
    }
    return `${roll.value}`;
  };

  // Color helper
  const getTeamColorClass = (teamId?: string) => {
    if (!teamId) return "bg-gray-700 border-gray-500";
    // Simple toggle for now, ideally get from Team Data
    if (teamId.includes("team1")) return "bg-red-900/80 border-red-500"; // Team 1 Red
    if (teamId.includes("team2")) return "bg-blue-900/80 border-blue-500"; // Team 2 Blue
    return "bg-gray-700 border-gray-500";
  };

  return (
    <div className="absolute bottom-4 left-4 w-[17%] h-1/2 flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between bg-black/80 px-3 py-1 border-t-2 border-x-2 border-bb-gold rounded-t-md z-10">
        <span className="font-heading text-bb-gold text-lg">DICE LOG</span>
        <span className="text-xs text-gray-400">Recent Rolls</span>
      </div>

      {/* Log List Container with Fade Mask */}
      <div className="relative flex-1 overflow-hidden border-2 border-bb-gold rounded-b-md bg-black/60">
        {/* Scrollable Content - Scrollbar Hidden */}
        <div className="absolute inset-0 overflow-y-auto no-scrollbar p-2 pb-12">
          {logs.length === 0 && (
            <div className="text-gray-500 text-sm italic text-center p-2">
              No rolls yet...
            </div>
          )}

          {logs.map((log) => (
            <div
              key={log.id}
              className={`
                                relative rounded border-l-4 shadow-sm animate-push-down overflow-hidden
                                ${getTeamColorClass(log.teamId)}
                            `}
            >
              <div className="p-2">
                {/* Header Row: Type & Dice */}
                <div className="flex justify-between items-center text-xs text-gray-300 mb-1">
                  <span className="font-bold uppercase tracking-wide text-bb-parchment">
                    {log.rollType}
                  </span>
                  <span className="font-mono bg-black/40 px-1 rounded text-gray-400">
                    {log.diceType}
                  </span>
                </div>

                {/* Result Row */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-white">
                    {log.description}
                  </span>

                  {/* Pass/Fail Badge */}
                  {log.passed !== undefined && (
                    <span
                      className={`
                                            ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded
                                            ${
                                              log.passed
                                                ? "bg-green-600 text-green-100"
                                                : "bg-red-600 text-red-100"
                                            }
                                        `}
                    >
                      {log.passed ? "PASS" : "FAIL"}
                    </span>
                  )}
                </div>

                {/* Value Row */}
                <div className="text-xs text-right mt-1 font-mono text-bb-gold">
                  {formatValue(log)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Fade Mask at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-10"></div>
      </div>

      {/* Inline Styles for hiding scrollbar and custom animation */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes pushDown {
          0% {
            opacity: 0;
            max-height: 0;
            margin-bottom: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            max-height: 100px;
            margin-bottom: 0.5rem;
            transform: translateY(0);
          }
        }
        .animate-push-down {
          animation: pushDown 0.4s ease-out forwards;
          margin-bottom: 0.5rem; /* Ensure final state matches animation end */
        }
      `}</style>
    </div>
  );
};
