import React, { useEffect, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames, type LogEntryCategory } from "../../../types/events";
import {
  getActiveOnlineMatch,
  type ChatMessage,
} from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  classifyDiceRowNature,
  classifyEntryNature,
  resolveDisplayColor,
  LOG_COLOR_CLASSES,
} from "./diceLogColor";
import {
  DieFace,
  HudButton,
  HudTabs,
  hudTabId,
  Panel,
  PanelHeader,
} from "../componentWarehouse/HudKit";
import { DiceWatch } from "../../../game/presentation/diceWatch";
import type { RerollSource } from "../../../types/decisions";
import {
  appendBallRoll,
  ballMovementText,
  type BallMovement,
} from "./ballMovementLog";

interface DiceLogProps {
  eventBus: EventBus;
}

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

type BallRow = BallMovement & { id: string; timestamp: number };
type LogRow = DiceRow | EntryRow | BallRow;

type Tab = "dice" | "chat";

const FONT_SCALE_STORAGE_KEY = "bb-dice-log-font-scale";
const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 2;
const FONT_SCALE_STEP = 0.125;
const FONT_SCALE_DEFAULT = 1;

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
    return;
  }
}

function clampFontScale(scale: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale));
}

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

function rerollHeadline(source: RerollSource, skill?: string): string {
  switch (source) {
    case "skill":
      return skill ?? "Skill Re-roll";
    case "team":
      return "Team Re-roll";
    case "pro":
      return "Pro";
    case "veteran":
      return "Veteran";
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

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

  const perspectiveTeamId = match?.myTeamId ?? null;

  const chatMatch = match && match.kind !== "computer" ? match : null;
  const [tab, setTab] = useState<Tab>("dice");
  const [fontScale, setFontScale] = useState<number>(() => loadFontScale());
  const [chat, setChat] = useState<ChatMessage[]>(() =>
    chatMatch ? chatMatch.chatHistory() : []
  );
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const tabRef = React.useRef<Tab>("dice");
  React.useLayoutEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const tabsId = React.useId();

  const followChat = React.useRef(true);
  const onChatScroll = () => {
    const list = chatScrollRef.current;
    if (list)
      followChat.current =
        list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  };
  useEffect(() => {
    followChat.current = true;
  }, [tab]);
  useEffect(() => {
    const list = chatScrollRef.current;
    if (list && followChat.current) list.scrollTop = list.scrollHeight;
  }, [chat, tab]);

  const watch = DiceWatch.shared(eventBus);
  const updateLogs = (change: (prev: LogRow[]) => LogRow[]) => {
    queueMicrotask(() => {
      void watch.landed().then(() => {
        setLogs(change);
      });
    });
  };

  const pushRow = (row: LogRow) => {
    updateLogs((prev) => {
      const updated = [row, ...prev];

      if (updated.length > 50) return updated.slice(0, 50);
      return updated;
    });
  };

  const nextId = () => {
    counterRef.current += 1;
    return `${String(Date.now())}-${String(counterRef.current)}`;
  };

  const pushEntry = (entry: Omit<DiceRow, "id" | "timestamp" | "kind">) => {
    pushRow({ kind: "dice", id: nextId(), timestamp: Date.now(), ...entry });
  };

  const pushLogEntry = (entry: Omit<EntryRow, "id" | "timestamp" | "kind">) => {
    pushRow({ kind: "entry", id: nextId(), timestamp: Date.now(), ...entry });
  };

  useEventBus(eventBus, GameEventNames.DiceRoll, (data) => {
    if (!appendBallRoll(null, data)) {
      pushEntry(data);
      return;
    }
    const id = nextId();
    updateLogs((previous) => {
      const head = previous[0];
      const movement = appendBallRoll(
        head?.kind === "ball" ? head : null,
        data
      );
      if (!movement) return previous;
      const row: BallRow = {
        ...movement,
        id: head?.kind === "ball" ? head.id : id,
        timestamp: Date.now(),
      };
      return [row, ...previous.slice(head?.kind === "ball" ? 1 : 0)].slice(
        0,
        50
      );
    });
  });
  const locateBall = (
    destination: { x: number; y: number },
    squares?: number
  ) => {
    updateLogs((previous) => {
      const head = previous[0];
      if (head?.kind !== "ball") return previous;
      return [
        { ...head, destination, squares: squares ?? head.squares },
        ...previous.slice(1),
      ];
    });
  };
  useEventBus(eventBus, GameEventNames.BallPlaced, (data) => {
    locateBall(data);
  });
  useEventBus(eventBus, GameEventNames.BallScattered, (data) => {
    locateBall(data.to);
  });
  useEventBus(eventBus, GameEventNames.BallThrownIn, (data) => {
    locateBall(data.to, data.distance);
  });
  useEventBus(eventBus, GameEventNames.BallKicked, (data) => {
    locateBall({ x: data.finalX, y: data.finalY }, data.distance);
  });
  useEventBus(eventBus, GameEventNames.PassAttempted, (data) => {
    locateBall(data.finalPosition);
  });
  useEventBus(eventBus, GameEventNames.PassFumbled, (data) => {
    locateBall(data.bouncePosition);
  });
  useEventBus(eventBus, GameEventNames.UI_GameLog, (description) => {
    pushLogEntry({ category: "kickoff", headline: description });
  });

  useEventBus(eventBus, GameEventNames.UI_LogEntry, (data) => {
    pushLogEntry({
      category: data.category,
      headline: data.headline,
      ...(data.detail === undefined ? {} : { detail: data.detail }),
      ...(data.roll === undefined ? {} : { roll: data.roll }),
      ...(data.teamId === undefined ? {} : { teamId: data.teamId }),
    });
  });

  useEventBus(eventBus, GameEventNames.UI_Notification, (text) => {
    if (/^Ball (lands in empty square|hits player|Out of Bounds)/i.test(text))
      return;
    pushLogEntry({ category: "info", headline: text });
  });

  useEventBus(eventBus, GameEventNames.SkillTriggered, (data) => {
    const teamId = teamIdForPlayer(data.playerId);
    pushLogEntry({
      category: "skill",
      headline: data.skill,
      detail: data.effect,
      ...(teamId === undefined ? {} : { teamId }),
    });
  });
  useEventBus(eventBus, GameEventNames.RerollUsed, (data) => {
    const teamId = teamIdForPlayer(data.playerId);
    const roll = (dice: number | number[] | string[]) =>
      Array.isArray(dice) ? dice.join(", ") : String(dice);
    pushLogEntry({
      category: "reroll",
      headline: rerollHeadline(data.source, data.skill),
      detail: `${data.rollKind}: ${roll(data.before)} → ${roll(data.after)}`,
      ...(teamId === undefined ? {} : { teamId }),
    });
  });

  useEffect(() => {
    if (!chatMatch) return;
    return chatMatch.onChatMessage((message) => {
      setChat((prev) => [...prev, message]);
      if (!message.fromSelf && tabRef.current !== "chat") {
        setUnread((count) => count + 1);
        eventBus.emit(
          GameEventNames.UI_Notification,
          `💬 ${message.senderName}: ${message.text}`
        );
      }
    });
  }, [chatMatch, eventBus]);

  const openTab = (next: Tab) => {
    setTab(next);
    if (next === "chat") setUnread(0);
  };

  const sendDraft = () => {
    if (!chatMatch || !draft.trim()) return;
    chatMatch.sendChat(draft);
    setDraft("");
  };

  const adjustFontScale = (delta: number) => {
    setFontScale((prev) => {
      const next = clampFontScale(Math.round((prev + delta) * 1000) / 1000);
      saveFontScale(next);
      return next;
    });
  };

  const getTeamColorClass = (teamId?: string) => {
    if (!teamId || typeof teamId !== "string")
      return "bg-white/[0.03] border-hud-edge";

    if (teamId.includes("team1"))
      return "bg-white/[0.03] border-hud-blood-hot/70";
    if (teamId.includes("team2")) return "bg-white/[0.03] border-hud-info/70";
    return "bg-white/[0.03] border-hud-edge";
  };

  const sizeControl = tab === "dice" && (
    <div className="flex items-center gap-1" title="Dice Log text size">
      <HudButton
        size="xs"
        variant="ghost"
        onClick={() => {
          adjustFontScale(-FONT_SCALE_STEP);
        }}
        disabled={fontScale <= FONT_SCALE_MIN}
        aria-label="Decrease Dice Log text size"
      >
        A-
      </HudButton>
      <span className="w-9 text-center font-hud-label text-hud-sm font-bold tabular-nums text-hud-dim">
        {Math.round(fontScale * 100)}%
      </span>
      <HudButton
        size="xs"
        variant="ghost"
        onClick={() => {
          adjustFontScale(FONT_SCALE_STEP);
        }}
        disabled={fontScale >= FONT_SCALE_MAX}
        aria-label="Increase Dice Log text size"
      >
        A+
      </HudButton>
    </div>
  );

  return (
    <Panel
      data-testid="dice-log"
      className="w-full h-full flex flex-col pointer-events-auto"
    >
      <PanelHeader
        className="z-10"
        title={
          chatMatch ? (
            <HudTabs
              label="Dice log view"
              idBase={tabsId}
              value={tab}
              onChange={openTab}
              tabs={[
                { id: "dice", label: "Dice" },
                { id: "chat", label: "Chat", count: unread },
              ]}
            />
          ) : (
            "Dice log"
          )
        }
        controls={sizeControl || undefined}
      />

      <div
        className="relative flex flex-1 flex-col overflow-hidden"
        {...(chatMatch && {
          role: "tabpanel",
          id: `${tabsId}-panel`,
          "aria-labelledby": hudTabId(tabsId, tab),
        })}
      >
        {tab === "dice" ? (
          <>
            <div
              className="absolute inset-0 overflow-y-auto no-scrollbar p-2 pb-10"
              style={{ fontSize: `${String(fontScale)}rem` }}
            >
              {logs.length === 0 && (
                <div className="p-3 text-center font-hud-body text-[0.875em] italic text-hud-mute">
                  No rolls yet...
                </div>
              )}

              {logs.map((log) => {
                if (log.kind === "ball")
                  return (
                    <details
                      key={log.id}
                      data-testid="ball-movement-log"
                      className="rounded-hud border-l-[3px] border-hud-info/70 bg-white/[0.03] px-2.5 py-2 text-hud-bone"
                    >
                      <summary className="cursor-pointer font-hud-body text-[0.8125em] font-semibold">
                        {ballMovementText(log)}
                      </summary>
                      <ul className="mt-2 space-y-1 text-[0.75em] text-hud-dim">
                        {log.rolls.map((roll, index) => (
                          <li key={index}>
                            {roll.description} · {roll.diceType}
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
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
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-hud-label text-[0.75em] font-bold uppercase tracking-[0.08em] text-hud-dim">
                              {log.rollType}
                            </span>
                            <span className="shrink-0 font-hud-label text-[0.6875em] font-bold text-hud-mute">
                              {log.diceType}
                            </span>
                          </div>

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

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-10 bg-gradient-to-t from-hud-slab to-transparent"></div>
          </>
        ) : (
          <>
            <div
              ref={chatScrollRef}
              onScroll={onChatScroll}
              className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto no-scrollbar p-2"
            >
              <div aria-hidden className="flex-1" />
              {chat.length === 0 && (
                <div className="p-2 text-center text-hud-sm italic text-hud-mute">
                  Say hello…
                </div>
              )}
              {chat.map((message, index) => (
                <div
                  key={`${String(message.ts)}-${String(index)}`}
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

            <div className="flex gap-1.5 border-t border-hud-gold/20 p-1.5">
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
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
