import React, { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames, LogEntryCategory } from "../../../types/events";
import {
  getActiveOnlineMatch,
  ChatMessage,
} from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  classifyDiceRowNature,
  classifyEntryNature,
  resolveDisplayColor,
  LOG_COLOR_CLASSES,
} from "./diceLogColor";

interface DiceLogProps {
  eventBus: EventBus;
}

/** A raw dice roll, rendered with its own value/description header. */
interface DiceRow {
  kind: "dice";
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

/** A durable log entry: a headline naming the result plus what it means. */
interface EntryRow {
  kind: "entry";
  id: string;
  category: LogEntryCategory;
  headline: string;
  detail?: string;
  roll?: number | number[];
  teamId?: string;
  timestamp: number;
}

type LogRow = DiceRow | EntryRow;

type Tab = "dice" | "chat";

const FONT_SCALE_STORAGE_KEY = "bb-dice-log-font-scale";
const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 2;
const FONT_SCALE_STEP = 0.125;
const FONT_SCALE_DEFAULT = 1;

/** Read the last font scale the player chose, falling back to the default
 *  when nothing's stored yet or storage isn't available (e.g. in tests). */
function loadFontScale(): number {
  try {
    const raw = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    const parsed = raw ? parseFloat(raw) : NaN;
    if (!Number.isFinite(parsed)) return FONT_SCALE_DEFAULT;
    return clampFontScale(parsed);
  } catch {
    return FONT_SCALE_DEFAULT;
  }
}

function saveFontScale(scale: number): void {
  try {
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // Storage unavailable — the scale just won't survive a reload.
  }
}

function clampFontScale(scale: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale));
}

const CATEGORY_LABELS: Record<LogEntryCategory, string> = {
  weather: "Weather",
  kickoff: "Kickoff",
  skill: "Skill",
  reroll: "Re-roll",
  score: "Score",
  drive: "Drive",
  action: "Action",
  info: "Info",
};

/** Resolve a player's team, when the game service is up, for attribution. */
function teamIdForPlayer(playerId: string): string | undefined {
  if (!ServiceContainer.isInitialized()) return undefined;
  try {
    return ServiceContainer.getInstance().gameService.getPlayerById(playerId)
      ?.teamId;
  } catch {
    return undefined;
  }
}

export const DiceLog: React.FC<DiceLogProps> = ({ eventBus }) => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const counterRef = React.useRef(0);
  const match = getActiveOnlineMatch();
  // Solo/local play has no single "my team" — null tells the classifier to
  // color every good/bad roll the same way regardless of who rolled it.
  const perspectiveTeamId = match?.myTeamId ?? null;
  const [tab, setTab] = useState<Tab>("dice");
  const [fontScale, setFontScale] = useState<number>(() => loadFontScale());
  const [chat, setChat] = useState<ChatMessage[]>(() =>
    match ? match.chatHistory() : []
  );
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const tabRef = React.useRef<Tab>("dice");
  tabRef.current = tab;

  const pushRow = (row: LogRow) => {
    setLogs((prev) => {
      // Add new entry at the START (top) of the array
      const updated = [row, ...prev];
      // Keep only the most recent 50 entries
      if (updated.length > 50) return updated.slice(0, 50);
      return updated;
    });
  };

  const nextId = () => {
    counterRef.current += 1;
    return `${Date.now()}-${counterRef.current}`;
  };

  const pushEntry = (entry: Omit<DiceRow, "id" | "timestamp" | "kind">) => {
    pushRow({ kind: "dice", id: nextId(), timestamp: Date.now(), ...entry });
  };

  const pushLogEntry = (entry: Omit<EntryRow, "id" | "timestamp" | "kind">) => {
    pushRow({ kind: "entry", id: nextId(), timestamp: Date.now(), ...entry });
  };

  useEventBus(eventBus, GameEventNames.DiceRoll, (data) => pushEntry(data));
  useEventBus(eventBus, GameEventNames.UI_GameLog, (description) => {
    pushLogEntry({ category: "kickoff", headline: description });
  });

  // The durable match log: every roll outcome authored by the rule that
  // resolved it (weather, kickoff table, and anything else converted).
  useEventBus(eventBus, GameEventNames.UI_LogEntry, (data) => {
    pushLogEntry({
      category: data.category,
      headline: data.headline,
      detail: data.detail,
      roll: data.roll,
      teamId: data.teamId,
    });
  });

  // Deprecated alias: a plain string becomes a low-priority "info" entry so
  // nothing goes silent while call sites are migrated to UI_LogEntry.
  useEventBus(eventBus, GameEventNames.UI_Notification, (text) => {
    pushLogEntry({ category: "info", headline: text });
  });

  // Skill activity: triggers and reroll usage read like log entries, with
  // the effect text authored by the rule that triggered — attributed to the
  // acting player's team when the game service can resolve it.
  useEventBus(eventBus, GameEventNames.SkillTriggered, (data) => {
    pushLogEntry({
      category: "skill",
      headline: data.skill,
      detail: data.effect,
      teamId: teamIdForPlayer(data.playerId),
    });
  });
  useEventBus(eventBus, GameEventNames.RerollUsed, (data) => {
    pushLogEntry({
      category: "reroll",
      headline: data.skill ?? "Team Re-roll",
      detail: `${data.rollKind}: ${data.before} → ${data.after}`,
      teamId: teamIdForPlayer(data.playerId),
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

  const adjustFontScale = (delta: number) => {
    setFontScale((prev) => {
      const next = clampFontScale(
        Math.round((prev + delta) * 1000) / 1000
      );
      saveFontScale(next);
      return next;
    });
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {tab === "chat" ? match?.opponentName : "Recent Rolls"}
          </span>
          {tab === "dice" && (
            <div
              className="flex items-center gap-1"
              title="Dice Log text size"
            >
              <button
                type="button"
                onClick={() => adjustFontScale(-FONT_SCALE_STEP)}
                disabled={fontScale <= FONT_SCALE_MIN}
                className="w-5 h-5 leading-none text-xs font-bold text-gray-300 hover:text-bb-gold disabled:text-gray-700 disabled:cursor-not-allowed border border-gray-600 rounded"
                aria-label="Decrease Dice Log text size"
              >
                A-
              </button>
              <span className="text-[10px] text-gray-400 w-8 text-center">
                {Math.round(fontScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => adjustFontScale(FONT_SCALE_STEP)}
                disabled={fontScale >= FONT_SCALE_MAX}
                className="w-5 h-5 leading-none text-xs font-bold text-gray-300 hover:text-bb-gold disabled:text-gray-700 disabled:cursor-not-allowed border border-gray-600 rounded"
                aria-label="Increase Dice Log text size"
              >
                A+
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Panel body */}
      <div className="relative flex-1 overflow-hidden border-2 border-bb-gold rounded-b-md bg-black/60 flex flex-col">
        {tab === "dice" ? (
          <>
            {/* Scrollable Content - Scrollbar Hidden */}
            <div
              className="absolute inset-0 overflow-y-auto no-scrollbar p-2 pb-12"
              style={{ fontSize: `${fontScale}rem` }}
            >
              {logs.length === 0 && (
                <div className="text-gray-500 text-[0.875em] italic text-center p-2">
                  No rolls yet...
                </div>
              )}

              {logs.map((log) => {
                if (log.kind === "dice") {
                  const nature = classifyDiceRowNature(log);
                  const color = resolveDisplayColor(
                    nature,
                    log.teamId,
                    perspectiveTeamId
                  );
                  const colorClass =
                    color === "unknown"
                      ? "!border-gray-500 !bg-gray-900/20"
                      : LOG_COLOR_CLASSES[color];
                  return (
                    <div
                      key={log.id}
                      className={`
                                relative rounded border-l-4 shadow-sm animate-push-down overflow-hidden
                                ${getTeamColorClass(log.teamId)}
                                ${colorClass}
                            `}
                    >
                      <div className="p-1.5">
                        {/* Header Row: Type & Dice + Value */}
                        <div className="flex justify-between items-center text-[0.6875em] text-gray-300 mb-0.5">
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
                          <span className="text-[0.75em] font-medium text-white/90 leading-snug">
                            {log.description}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Outcome entry: a durable record of a roll and what it meant —
                // headline names the result, detail states its effect on play.
                const nature = classifyEntryNature(log.category);
                const color = resolveDisplayColor(
                  nature,
                  log.teamId,
                  perspectiveTeamId
                );
                const colorClass =
                  color === "unknown" ? "" : LOG_COLOR_CLASSES[color];
                return (
                  <div
                    key={log.id}
                    className={`
                                relative rounded border-l-4 shadow-sm animate-push-down overflow-hidden
                                ${getTeamColorClass(log.teamId)}
                                ${colorClass}
                            `}
                  >
                    <div className="p-1.5">
                      <div className="flex justify-between items-center text-[0.6875em] text-gray-300 mb-0.5">
                        <span className="font-bold uppercase tracking-wide text-bb-parchment">
                          {CATEGORY_LABELS[log.category]}
                        </span>
                        {log.roll !== undefined && (
                          <span className="font-black text-white bg-black/60 px-1.5 rounded border border-white/20">
                            {Array.isArray(log.roll)
                              ? `[${log.roll.join(", ")}]`
                              : log.roll}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-[0.75em] font-bold text-white leading-snug">
                          {log.headline}
                        </span>
                        {log.detail && (
                          <span className="text-[0.75em] font-medium text-white/80 leading-snug">
                            {log.detail}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
