import React, { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import {
  getActiveOnlineMatch,
  ChatMessage,
} from "../../../network/OnlineMatch";

interface DiceLogProps {
  eventBus: EventBus;
}

interface RollEntry {
  id: string;
  rollType: string;
  diceType: string;
  teamId?: string;
  value: number | number[] | string | string[];
  total: number;
  description: string;
  resultState?: "none" | "success" | "failure" | "fumble";
  timestamp: number;
}

type Tab = "dice" | "chat";

export const DiceLog: React.FC<DiceLogProps> = ({ eventBus }) => {
  const [logs, setLogs] = useState<RollEntry[]>([]);
  const counterRef = React.useRef(0);
  const match = getActiveOnlineMatch();
  const [tab, setTab] = useState<Tab>("dice");
  const [chat, setChat] = useState<ChatMessage[]>(() =>
    match ? match.chatHistory() : []
  );
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const tabRef = React.useRef<Tab>("dice");
  tabRef.current = tab;

  const pushEntry = (entry: Omit<RollEntry, "id" | "timestamp">) => {
    const timestamp = Date.now();
    counterRef.current += 1;
    const newEntry: RollEntry = {
      id: `${timestamp}-${counterRef.current}`,
      ...entry,
      timestamp,
    };
    setLogs((prev) => {
      // Add new entry at the START (top) of the array
      const updated = [newEntry, ...prev];
      // Keep only the most recent 50 entries
      if (updated.length > 50) return updated.slice(0, 50);
      return updated;
    });
  };

  useEventBus(eventBus, GameEventNames.DiceRoll, (data) => pushEntry(data));

  // Skill activity: triggers and reroll usage read like rolls in the log
  useEventBus(eventBus, GameEventNames.SkillTriggered, (data) => {
    pushEntry({
      rollType: "Skill",
      diceType: "★",
      value: data.skill,
      total: 0,
      description: data.effect,
      resultState: "none",
    });
  });
  useEventBus(eventBus, GameEventNames.RerollUsed, (data) => {
    pushEntry({
      rollType: "Re-roll",
      diceType: data.source === "team" ? "team" : "skill",
      value: data.skill ?? "Team Re-roll",
      total: data.after,
      description: `${data.skill ?? "Team re-roll"} on the ${data.rollKind}: ${data.before} → ${data.after}`,
      resultState: "none",
    });
  });

  // Online chat: always receive incoming messages (regardless of the active
  // tab). While the player isn't looking at chat, badge the tab AND pop a
  // toast so the message is noticed from anywhere in the HUD.
  useEffect(() => {
    if (!match) return;
    return match.onChatMessage((message) => {
      setChat((prev) => [...prev, message]);
      if (!message.fromSelf && tabRef.current !== "chat") {
        setUnread((count) => count + 1);
        eventBus.emit(
          GameEventNames.UI_Notification,
          `💬 ${message.senderName}: ${message.text}`
        );
      }
    });
  }, [match, eventBus]);

  const openTab = (next: Tab) => {
    setTab(next);
    if (next === "chat") setUnread(0);
  };

  const sendDraft = () => {
    if (!match || !draft.trim()) return;
    match.sendChat(draft);
    setDraft("");
  };

  // Color helper for team borders
  const getTeamColorClass = (teamId?: string) => {
    if (!teamId || typeof teamId !== "string")
      return "bg-gray-700 border-gray-500";
    // Simple toggle for now, ideally get from Team Data
    if (teamId.includes("team1")) return "bg-red-900/80 border-red-500"; // Team 1 Red
    if (teamId.includes("team2")) return "bg-blue-900/80 border-blue-500"; // Team 2 Blue
    return "bg-gray-700 border-gray-500";
  };

  return (
    <div className="w-full h-full max-h-[34vh] flex flex-col pointer-events-auto">
      {/* Header / Tabs */}
      <div className="flex items-center justify-between bg-black/80 px-3 py-1 border-t-2 border-x-2 border-bb-gold rounded-t-md z-10">
        {match ? (
          <div className="flex gap-3">
            <button
              onClick={() => openTab("dice")}
              className={`font-heading text-lg ${
                tab === "dice" ? "text-bb-gold" : "text-gray-500"
              }`}
            >
              DICE LOG
            </button>
            <button
              onClick={() => openTab("chat")}
              className={`relative font-heading text-lg ${
                tab === "chat" ? "text-bb-gold" : "text-gray-500"
              }`}
            >
              CHAT
              {unread > 0 && (
                <span className="absolute -top-1 -right-4 bg-red-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                  {unread}
                </span>
              )}
            </button>
          </div>
        ) : (
          <span className="font-heading text-bb-gold text-lg">DICE LOG</span>
        )}
        <span className="text-xs text-gray-400">
          {tab === "chat" ? match?.opponentName : "Recent Rolls"}
        </span>
      </div>

      {/* Panel body */}
      <div className="relative flex-1 overflow-hidden border-2 border-bb-gold rounded-b-md bg-black/60 flex flex-col">
        {tab === "dice" ? (
          <>
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
                                ${
                                  log.resultState === "success"
                                    ? "!border-green-500 !bg-green-900/20"
                                    : log.resultState === "failure"
                                      ? "!border-red-500 !bg-red-900/20"
                                      : log.resultState === "fumble"
                                        ? "!border-orange-500 !bg-orange-900/20"
                                        : "!border-gray-500 !bg-gray-900/20"
                                }
                            `}
                >
                  <div className="p-1.5">
                    {/* Header Row: Type & Dice + Value */}
                    <div className="flex justify-between items-center text-[11px] text-gray-300 mb-0.5">
                      <span className="font-bold uppercase tracking-wide text-bb-parchment">
                        {log.rollType}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-black/40 px-1 rounded text-gray-400">
                          {log.diceType}
                        </span>
                        <span className="font-black text-white bg-black/60 px-1.5 rounded border border-white/20">
                          {Array.isArray(log.value)
                            ? `[${log.value.join(", ")}]`
                            : log.value}
                        </span>
                      </div>
                    </div>

                    {/* Result Row - Full Width Description */}
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-medium text-white/90 leading-snug">
                        {log.description}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Fade Mask at Bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-10"></div>
          </>
        ) : (
          <>
            {/* Chat history (newest at bottom) */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 flex flex-col justify-end gap-1">
              {chat.length === 0 && (
                <div className="text-gray-500 text-sm italic text-center p-2">
                  Say hello…
                </div>
              )}
              {chat.map((message, index) => (
                <div
                  key={`${message.ts}-${index}`}
                  className={`max-w-[85%] rounded px-2 py-1 text-sm ${
                    message.fromSelf
                      ? "self-end bg-blue-900/70 text-white"
                      : "self-start bg-gray-700/80 text-white"
                  }`}
                >
                  {!message.fromSelf && (
                    <span className="block text-[10px] text-bb-gold font-bold">
                      {message.senderName}
                    </span>
                  )}
                  {message.text}
                </div>
              ))}
            </div>
            {/* Composer */}
            <div className="flex border-t border-bb-gold/50">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendDraft();
                  e.stopPropagation();
                }}
                placeholder="Message…"
                className="flex-1 bg-black/60 text-white text-sm px-2 py-1.5 outline-none"
              />
              <button
                onClick={sendDraft}
                className="px-3 text-bb-gold font-heading text-sm"
              >
                SEND
              </button>
            </div>
          </>
        )}
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
            max-height: 250px;
            margin-bottom: 0.3rem;
            transform: translateY(0);
          }
        }
        .animate-push-down {
          animation: pushDown 0.4s ease-out forwards;
          margin-bottom: 0.3rem; /* Ensure final state matches animation end */
        }
      `}</style>
    </div>
  );
};
