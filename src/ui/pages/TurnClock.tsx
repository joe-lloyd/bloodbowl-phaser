import { useCallback, useEffect, useRef, useState } from "react";
import { EventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";
import {
  LobbyDoc,
  setTurnDeadline,
  pauseClock,
  resumeClock,
  computeResume,
} from "../../firebase/lobby";
import { OnlineMatch } from "../../network/OnlineMatch";
import { AuthUser } from "../../firebase/auth";

interface Props {
  code: string;
  lobby: LobbyDoc;
  match: OnlineMatch;
  eventBus: EventBus;
  user: AuthUser;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const currentPhase = (): GamePhase | null =>
  ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getPhase()
    : null;

/**
 * Synced turn clock. The host writes an absolute deadline at each play turn
 * start and force-ends the turn if it lapses (so nobody can stall the game
 * forever). Both clients derive the countdown from the deadline — no
 * per-second writes. A player may spend their timeout bank to pause; the
 * elapsed pause is deducted on resume and the deadline pushed out to match.
 */
export function TurnClock({ code, lobby, match, eventBus, user }: Props) {
  const timer = lobby.timer;
  const isHost = match.role === "host";
  const turnMs = lobby.settings.turnSeconds * 1000;
  const [now, setNow] = useState(Date.now());
  const endedForRef = useRef<number | null>(null);

  const myBank = timer?.banks?.[user.uid] ?? 0;
  const pausedByMe = timer?.pausedBy === user.uid;
  const bankLeft = pausedByMe
    ? Math.max(0, myBank - (now - (timer?.pausedAt ?? now)))
    : myBank;

  const doResume = useCallback(() => {
    if (!timer) return;
    const { remainingBankMs, newDeadline } = computeResume(
      timer,
      user.uid,
      Date.now()
    );
    void resumeClock(code, user.uid, remainingBankMs, newDeadline);
  }, [code, user.uid, timer]);

  // Freeze input for both players while paused
  useEffect(() => {
    match.setClockPaused(!!timer?.pausedBy);
  }, [match, timer?.pausedBy]);

  // Host: (re)set the deadline at the start of every play turn
  useEffect(() => {
    if (!isHost) return;
    const onTurn = () => void setTurnDeadline(code, Date.now() + turnMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on(GameEventNames.TurnStarted as any, onTurn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => eventBus.off(GameEventNames.TurnStarted as any, onTurn);
  }, [isHost, code, turnMs, eventBus]);

  // Tick + host enforcement of expiry
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (!isHost || !timer?.deadline || timer.pausedBy) return;
      if (Date.now() <= timer.deadline) return;
      if (currentPhase() !== GamePhase.PLAY) return;
      if (match.pendingDecision()) return; // don't cut off a mid-block decision
      if (endedForRef.current === timer.deadline) return; // end once per turn
      endedForRef.current = timer.deadline;
      // Host force-ends the active team's turn (works even if the active
      // player's client is gone). The next TurnStarted rewrites the deadline.
      ServiceContainer.getInstance().gameService.endTurn();
    }, 500);
    return () => clearInterval(id);
  }, [isHost, timer?.deadline, timer?.pausedBy, match]);

  // Auto-resume when my own timeout bank runs dry
  const bankDry = pausedByMe && bankLeft <= 0;
  useEffect(() => {
    if (bankDry) doResume();
  }, [bankDry, doResume]);

  if (!timer || timer.deadline == null || currentPhase() !== GamePhase.PLAY) {
    return null;
  }

  const pauserName = timer.pausedBy
    ? match.coachName(timer.pausedBy) ?? "Opponent"
    : null;
  const remaining = timer.pausedBy
    ? (timer.deadline ?? now) - (timer.pausedAt ?? now)
    : timer.deadline - now;
  const low = remaining < 15000 && !timer.pausedBy;

  return (
    <div
      className="absolute top-16 left-1/2 -translate-x-1/2 z-[92] pointer-events-auto
        flex flex-col items-center gap-1 bg-slate-900/85 border border-bb-gold
        rounded-lg px-4 py-2 shadow-xl"
    >
      <div
        className={`font-heading text-2xl leading-none ${
          timer.pausedBy
            ? "text-blue-300"
            : low
              ? "text-red-400 animate-pulse"
              : "text-bb-gold"
        }`}
      >
        {timer.pausedBy ? "⏸ PAUSED" : `⏱ ${fmt(remaining)}`}
      </div>
      {timer.pausedBy ? (
        <div className="text-xs font-body text-gray-300">
          by {pauserName}
          {pausedByMe && (
            <>
              <button
                onClick={doResume}
                className="ml-2 underline text-bb-gold"
              >
                Resume
              </button>
              <span className="ml-2">({fmt(bankLeft)} left)</span>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={() => void pauseClock(code, user.uid)}
          disabled={myBank <= 0}
          className="text-xs font-heading text-bb-gold/90 hover:text-bb-gold disabled:opacity-40"
        >
          ⏸ Timeout ({fmt(myBank)})
        </button>
      )}
    </div>
  );
}
