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
import { DieFace, HudButton, Panel } from "../componentWarehouse/HudKit";

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

/** A single number reads as a die; a list or a block face as a small tag. */
function valueFaceClass(value: DiceRow["value"]): string {
  return typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value))
    ? "text-[0.9375em]"
    : "!h-auto max-w-[40%] whitespace-normal break-words py-0.5 text-center font-hud-label !text-[0.6875em] font-bold leading-tight";
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
      const next = clampFontScale(Math.round((prev + delta) * 1000) / 1000);
      saveFontScale(next);
      return next;
    });
  };

  // Color helper for team borders
  const getTeamColorClass = (teamId?: string) => {
    if (!teamId || typeof teamId !== "string")
      return "bg-white/[0.03] border-hud-edge";
    // Simple toggle for now, ideally get from Team Data
    if (teamId.includes("team1"))
      return "bg-white/[0.03] border-hud-blood-hot/70"; // Team 1 Red
    if (teamId.includes("team2")) return "bg-white/[0.03] border-hud-info/70"; // Team 2 Blue
    return "bg-white/[0.03] border-hud-edge";
  };

  const tabClass = (active: boolean) =>
    `relative font-hud-display text-hud-lg uppercase tracking-[0.04em] transition-colors ${
      active ? "text-hud-bone" : "text-hud-mute hover:text-hud-dim"
    }`;
  const sizeButton =
    "flex h-7 w-7 items-center justify-center rounded-hud border border-white/15 font-hud-label text-[12px] font-bold leading-none text-hud-dim transition-colors hover:border-hud-gold/60 hover:text-hud-gold disabled:cursor-not-allowed disabled:border-white/5 disabled:text-hud-mute/50";

  return (
    <Panel className="w-full h-full max-h-[34vh] flex flex-col pointer-events-auto">
      {/* Header / Tabs */}
      <div className="z-10 flex min-h-[40px] items-center justify-between gap-2 border-b border-hud-gold/20 px-3 py-1.5">
        {match ? (
          <div className="flex gap-4">
            <button
              onClick={() => openTab("dice")}
              className={tabClass(tab === "dice")}
            >
              DICE LOG
            </button>
            <button
              onClick={() => openTab("chat")}
              className={tabClass(tab === "chat")}
            >
              CHAT
              {unread > 0 && (
                <span className="absolute -right-4 -top-1 rounded-full bg-hud-blood px-1.5 py-0.5 font-hud-label text-[10px] font-bold leading-none text-white">
                  {unread}
                </span>
              )}
            </button>
          </div>
        ) : (
          <span className="font-hud-display text-hud-lg uppercase tracking-[0.04em] text-hud-bone">
            DICE LOG
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className="hud-label truncate">
            {tab === "chat" ? match?.opponentName : "Recent Rolls"}
          </span>
          {tab === "dice" && (
            <div className="flex items-center gap-1" title="Dice Log text size">
              <button
                type="button"
                onClick={() => adjustFontScale(-FONT_SCALE_STEP)}
                disabled={fontScale <= FONT_SCALE_MIN}
                className={sizeButton}
                aria-label="Decrease Dice Log text size"
              >
                A-
              </button>
              <span className="w-8 text-center font-hud-label text-[11px] text-hud-dim">
                {Math.round(fontScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => adjustFontScale(FONT_SCALE_STEP)}
                disabled={fontScale >= FONT_SCALE_MAX}
                className={sizeButton}
                aria-label="Increase Dice Log text size"
              >
                A+
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Panel body */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {tab === "dice" ? (
          <>
            {/* Scrollable Content - Scrollbar Hidden */}
            <div
              className="absolute inset-0 overflow-y-auto no-scrollbar p-2 pb-10"
              style={{ fontSize: `${fontScale}rem` }}
            >
              {logs.length === 0 && (
                <div className="p-3 text-center font-hud-body text-[0.875em] italic text-hud-mute">
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
                      ? "!border-hud-edge !bg-white/[0.03]"
                      : LOG_COLOR_CLASSES[color];
                  return (
                    <div
                      key={log.id}
                      className={`relative overflow-hidden rounded-hud border-l-[3px] animate-push-down ${getTeamColorClass(log.teamId)} ${colorClass}`}
                    >
                      <div className="flex items-center gap-2 py-1.5 pl-2.5 pr-1.5">
                        <div className="min-w-0 flex-1">
                          {/* Header Row: roll type and dice */}
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-hud-label text-[0.75em] font-bold uppercase tracking-[0.08em] text-hud-dim">
                              {log.rollType}
                            </span>
                            <span className="shrink-0 font-mono text-[0.625em] text-hud-mute">
                              {log.diceType}
                            </span>
                          </div>
                          {/* Result Row - Full Width Description */}
                          <span className="block font-hud-body text-[0.8125em] font-medium leading-snug text-hud-bone">
                            {log.description}
                          </span>
                        </div>
                        <DieFace className={valueFaceClass(log.value)}>
                          {Array.isArray(log.value)
                            ? `[${log.value.join(", ")}]`
                            : log.value}
                        </DieFace>
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
                    className={`relative overflow-hidden rounded-hud border-l-[3px] animate-push-down ${getTeamColorClass(log.teamId)} ${colorClass}`}
                  >
                    <div className="flex items-center gap-2 py-1.5 pl-2.5 pr-1.5">
                      <div className="flex min-w-0 flex-1 flex-col items-start">
                        <span className="font-hud-label text-[0.75em] font-bold uppercase tracking-[0.08em] text-hud-dim">
                          {CATEGORY_LABELS[log.category]}
                        </span>
                        <span className="font-hud-body text-[0.8125em] font-semibold leading-snug text-hud-bone">
                          {log.headline}
                        </span>
                        {log.detail && (
                          <span className="font-hud-body text-[0.8125em] leading-snug text-hud-bone/75">
                            {log.detail}
                          </span>
                        )}
                      </div>
                      {log.roll !== undefined && (
                        <DieFace className={valueFaceClass(log.roll)}>
                          {Array.isArray(log.roll)
                            ? `[${log.roll.join(", ")}]`
                            : log.roll}
                        </DieFace>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fade Mask at Bottom */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-10 bg-gradient-to-t from-hud-slab to-transparent"></div>
          </>
        ) : (
          <>
            {/* Chat history (newest at bottom) */}
            <div className="flex flex-1 flex-col justify-end gap-1 overflow-y-auto no-scrollbar p-2">
              {chat.length === 0 && (
                <div className="p-2 text-center text-hud-sm italic text-hud-mute">
                  Say hello…
                </div>
              )}
              {chat.map((message, index) => (
                <div
                  key={`${message.ts}-${index}`}
                  className={`max-w-[85%] rounded-hud px-2.5 py-1.5 font-hud-body text-hud-sm text-hud-bone ${
                    message.fromSelf
                      ? "self-end border border-hud-gold/30 bg-hud-gold/15"
                      : "self-start border border-white/10 bg-hud-raise"
                  }`}
                >
                  {!message.fromSelf && (
                    <span className="hud-label block text-hud-2xs text-hud-gold">
                      {message.senderName}
                    </span>
                  )}
                  {message.text}
                </div>
              ))}
            </div>
            {/* Composer */}
            <div className="flex gap-1.5 border-t border-hud-gold/20 p-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendDraft();
                  e.stopPropagation();
                }}
                placeholder="Message…"
                className="hud-field flex-1 !min-h-[32px]"
              />
              <HudButton size="sm" variant="gold" onClick={sendDraft}>
                SEND
              </HudButton>
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
    </Panel>
  );
};
