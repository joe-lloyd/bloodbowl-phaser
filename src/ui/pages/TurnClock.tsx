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
  nextTurnDeadline,
} from "../../firebase/lobby";
import { OnlineMatch } from "../../network/OnlineMatch";
import {
  DEFENDER_DECISION_SECONDS,
  defaultAnswer,
} from "../../network/decisionTimeouts";
import { AuthUser } from "../../firebase/auth";

interface Props {
  code: string;
  lobby: LobbyDoc;
  match: OnlineMatch;
  eventBus: EventBus;
  user: AuthUser;
  /** The other coach has dropped: the clock and all input stop. */
  opponentAway?: boolean;
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
export function TurnClock({
  code,
  lobby,
  match,
  eventBus,
  user,
  opponentAway = false,
}: Props) {
  const timer = lobby.timer;
  // Both browsers run the engine; the coach whose turn it is keeps the clock
  const myTurn = () =>
    ServiceContainer.isInitialized() &&
    ServiceContainer.getInstance().gameService.getActiveTeamId() ===
      match.myTeamId;
  const turnSeconds = lobby.settings.turnSeconds;
  const [now, setNow] = useState(Date.now());
  const endedForRef = useRef<number | null>(null);

  // The main clock stops while the other coach is disconnected, and while
  // the coach whose turn it is NOT owns a decision (an uphill block's dice,
  // Stand Firm, …). That coach gets a short clock of their own instead.
  const activeTeamId = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getActiveTeamId()
    : null;
  const decidingTeamId = match.decidingTeamId();
  const otherSideDeciding =
    currentPhase() === GamePhase.PLAY &&
    decidingTeamId != null &&
    decidingTeamId !== activeTeamId;
  const freezeReason: "away" | "deciding" | null = opponentAway
    ? "away"
    : otherSideDeciding
      ? "deciding"
      : null;
  const freezeRef = useRef<{
    reason: "away" | "deciding";
    /** Turn time left when the clock stopped */
    remaining: number | null;
  } | null>(null);
  const decisionRef = useRef<{ key: string; since: number } | null>(null);
  const answeredRef = useRef<string | null>(null);
  useEffect(() => {
    const frozen = freezeRef.current;
    if (freezeReason && !frozen) {
      freezeRef.current = {
        reason: freezeReason,
        remaining: timer?.deadline != null ? timer.deadline - Date.now() : null,
      };
    } else if (!freezeReason && frozen) {
      freezeRef.current = null;
      // Resume with the time that was left. The coach who saw the other
      // drop writes it after an absence; the active coach after a decision.
      if (frozen.remaining != null && (frozen.reason === "away" || myTurn())) {
        void setTurnDeadline(code, Date.now() + Math.max(0, frozen.remaining));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freezeReason]);

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

  // Freeze input for both players while paused or while one is away
  useEffect(() => {
    match.setClockPaused(!!timer?.pausedBy || opponentAway);
  }, [match, timer?.pausedBy, opponentAway]);

  // The new active coach (re)sets the deadline at the start of every turn. turnSeconds
  // <= 0 is the "no time limit" sentinel (nextTurnDeadline returns null),
  // so the clock UI and expiry enforcement both no-op below.
  useEffect(() => {
    const onTurn = () => {
      if (!myTurn()) return;
      void setTurnDeadline(code, nextTurnDeadline(turnSeconds, Date.now()));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on(GameEventNames.TurnStarted as any, onTurn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => eventBus.off(GameEventNames.TurnStarted as any, onTurn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, turnSeconds, eventBus]);

  /** The deciding coach's own screen answers once their short clock ends. */
  const answerIfOutOfTime = () => {
    const pending = match.pendingDecision();
    if (freezeRef.current?.reason !== "deciding" || !pending) {
      decisionRef.current = null;
      return;
    }
    const key = JSON.stringify(pending);
    if (decisionRef.current?.key !== key) {
      decisionRef.current = { key, since: Date.now() };
    }
    if (match.decidingTeamId() !== match.myTeamId) return;
    const limit = DEFENDER_DECISION_SECONDS[pending.type] * 1000;
    if (Date.now() - decisionRef.current.since < limit) return;
    if (answeredRef.current === key) return;
    answeredRef.current = key;
    const answer = defaultAnswer(pending);
    if (answer) void match.run(answer);
  };

  // Tick, and the active coach ends their own turn on expiry
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      answerIfOutOfTime();
      if (freezeRef.current) return; // stopped: nobody's turn runs out
      if (!myTurn() || !timer?.deadline || timer.pausedBy) return;
      if (Date.now() <= timer.deadline) return;
      if (currentPhase() !== GamePhase.PLAY) return;
      if (match.pendingDecision()) return; // don't cut off a mid-block decision
      if (endedForRef.current === timer.deadline) return; // end once per turn
      endedForRef.current = timer.deadline;
      // An end-turn command like any other: the other side replays it.
      // The next TurnStarted rewrites the deadline.
      ServiceContainer.getInstance().gameService.endTurn();
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.deadline, timer?.pausedBy, match]);

  // Auto-resume when my own timeout bank runs dry
  const bankDry = pausedByMe && bankLeft <= 0;
  useEffect(() => {
    if (bankDry) doResume();
  }, [bankDry, doResume]);

  if (!timer || timer.deadline == null || currentPhase() !== GamePhase.PLAY) {
    return null;
  }

  const frozen = freezeRef.current;
  if (frozen) {
    const pending = match.pendingDecision();
    const decision = decisionRef.current;
    const left =
      frozen.reason === "deciding" && pending && decision
        ? DEFENDER_DECISION_SECONDS[pending.type] * 1000 -
          (now - decision.since)
        : 0;
    const who =
      decidingTeamId === match.myTeamId
        ? "You have"
        : `${match.opponentName} has`;
    return (
      <div
        data-testid="turn-clock-stopped"
        className="absolute top-16 left-1/2 -translate-x-1/2 z-[92] pointer-events-auto
          flex flex-col items-center gap-1 bg-slate-900/85 border border-bb-gold
          rounded-lg px-4 py-2 shadow-xl"
      >
        <div className="font-heading text-2xl leading-none text-blue-300">
          ⏸ {fmt(frozen.remaining ?? 0)}
        </div>
        <div className="text-xs font-body text-gray-300">
          {frozen.reason === "away"
            ? `${match.opponentName} disconnected: game paused`
            : `${who} ${fmt(left)} to decide (${pending?.type.replace(/-/g, " ")})`}
        </div>
      </div>
    );
  }

  const pauserName = timer.pausedBy
    ? (match.coachName(timer.pausedBy) ?? "Opponent")
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
