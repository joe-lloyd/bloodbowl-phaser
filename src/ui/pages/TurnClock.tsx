import { createPortal } from "react-dom";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
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
import { possessive } from "../../game/managers/TurnManager";

interface Props {
  code: string;
  lobby: LobbyDoc;
  match: OnlineMatch;
  eventBus: EventBus;
  user: AuthUser;
  /**
   * A drop both coaches treat as a disconnect: the clock and all input
   * stop. A shorter cut reads only as slow on the other side, and the
   * clock runs on.
   */
  opponentAway?: boolean;
  /**
   * When the drop began, as both coaches can tell: the absent coach's last
   * heartbeat the server holds. Both clocks stop at this moment, however
   * late each screen noticed.
   */
  awaySince?: number | null;
  /**
   * The hold is for this coach's own silence, offline or slow: the other
   * coach, who stayed online, writes the resumed deadline.
   */
  awayIsMe?: boolean;
  /** This coach's link is down: its input waits, though the clock may run. */
  offline?: boolean;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "15 seconds left", or "1 second left", for screen readers. */
export const secondsLeftText = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds} ${seconds === 1 ? "second" : "seconds"} left`;
};

/** How early a turn may end and still count as ending on the clock. */
const TIME_UP_GRACE_MS = 1000;
/** How long a resumed clock waits for its new deadline to come back. */
const RESUME_WAIT_MS = 5000;

/** Names whose time ran out: "Reikland Reavers' turn ended". */
const endedTurn = (teamId: string): string => {
  const name = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getTeam(teamId)?.name
    : undefined;
  return name ? `${possessive(name)} turn ended` : "Turn ended";
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
  awaySince = null,
  awayIsMe = false,
  offline = false,
}: Props) {
  const [stripSlot, setStripSlot] = useState<HTMLElement | null>(null);
  useEffect(
    () => setStripSlot(document.getElementById("match-strip-clock")),
    []
  );
  const present = (content: ReactNode) =>
    stripSlot ? createPortal(content, stripSlot) : content;
  const clockClass = stripSlot
    ? "flex skew-x-12 items-center gap-2 whitespace-nowrap text-hud-xs"
    : "hud-slab absolute top-[7.25rem] left-1/2 -translate-x-1/2 z-[92] pointer-events-auto flex min-w-[168px] flex-col items-center gap-0.5 px-4 py-2";
  const timer = lobby.timer;
  // Both browsers run the engine; the coach whose turn it is keeps the clock
  const myTurn = () =>
    ServiceContainer.isInitialized() &&
    ServiceContainer.getInstance().gameService.getActiveTeamId() ===
      match.myTeamId;
  /** The engine's current turn, to match against the deadline's own turn. */
  const turnKey = (): string | null => {
    if (!ServiceContainer.isInitialized()) return null;
    const { turn } = ServiceContainer.getInstance().gameService.getState();
    return `${turn.teamId}:${turn.isHalf2 ? 2 : 1}:${turn.turnNumber}`;
  };
  // Until the new active coach's deadline comes back, the one in the lobby
  // still belongs to the turn before
  const deadlineIsThisTurn = timer?.turn != null && timer.turn === turnKey();
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
  const freezeRef = useRef<{
    reason: "away" | "deciding";
    /** The hold was for this coach's own silence */
    awayIsMe: boolean;
    /** Turn time left when the clock stopped */
    remaining: number | null;
  } | null>(null);
  // A drop this coach shares with the other one stays a hold: while its
  // own link is down, its view of the other coach says nothing, and a
  // deadline written then would land late over the right one
  const freezeReason: "away" | "deciding" | null =
    opponentAway || (offline && freezeRef.current?.reason === "away")
      ? "away"
      : otherSideDeciding
        ? "deciding"
        : null;
  // The tick reads it without restarting
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const resumeRef = useRef<{
    /** Turn time left when the clock stopped */
    remaining: number;
    /** When the clock started again */
    at: number;
    /** The deadline from before the pause, still in the lobby */
    staleDeadline: number | null;
  } | null>(null);
  /** The resume still waiting on its new deadline, if any. */
  const resuming = (at: number) => {
    const resume = resumeRef.current;
    return resume &&
      resume.staleDeadline === (timer?.deadline ?? null) &&
      at - resume.at < RESUME_WAIT_MS
      ? resume
      : null;
  };
  const decisionRef = useRef<{ key: string; since: number } | null>(null);
  const answeredRef = useRef<string | null>(null);
  useEffect(() => {
    const frozen = freezeRef.current;
    if (freezeReason && !frozen) {
      // A drop stops the clock when it began, not when this screen saw it
      const stoppedAt =
        freezeReason === "away" && awaySince != null
          ? Math.min(awaySince, Date.now())
          : Date.now();
      freezeRef.current = {
        reason: freezeReason,
        awayIsMe,
        remaining: !deadlineIsThisTurn
          ? turnSeconds > 0
            ? turnSeconds * 1000
            : null
          : timer?.deadline != null
            ? Math.min(turnSeconds * 1000, timer.deadline - stoppedAt)
            : null,
      };
    } else if (!freezeReason && frozen) {
      freezeRef.current = null;
      // Until the resumed deadline comes back, the lobby still holds the
      // one from before the pause: count down from what was left instead
      resumeRef.current =
        frozen.remaining != null
          ? {
              remaining: frozen.remaining,
              at: Date.now(),
              staleDeadline: timer?.deadline ?? null,
            }
          : null;
      // Resume with the time that was left. Both screens stopped at the
      // same moment, so they agree on it, and one coach writes it. After a
      // decision that is the coach whose turn it is. After an absence it is
      // the coach who stayed online: the absent coach may have reloaded and
      // lost its freeze.
      const writes =
        !offline && (frozen.reason === "away" ? !frozen.awayIsMe : myTurn());
      if (frozen.remaining != null && writes) {
        void setTurnDeadline(
          code,
          Date.now() + Math.max(0, frozen.remaining),
          turnKey()
        );
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

  // Freeze input for both players while paused or while one is away. A
  // coach who is offline cannot reach the other side, so their input waits
  // too, even while the clock still runs on a short cut.
  useEffect(() => {
    match.setClockPaused(
      opponentAway || offline
        ? "opponent-away"
        : timer?.pausedBy
          ? "timeout"
          : null
    );
  }, [match, timer?.pausedBy, opponentAway, offline]);

  // The new active coach (re)sets the deadline at the start of every turn. turnSeconds
  // <= 0 is the "no time limit" sentinel (nextTurnDeadline returns null),
  // so the clock UI and expiry enforcement both no-op below.
  useEffect(() => {
    const onTurn = () => {
      if (!myTurn()) return;
      void setTurnDeadline(
        code,
        nextTurnDeadline(turnSeconds, Date.now()),
        turnKey()
      );
    };
    eventBus.on(GameEventNames.TurnStarted, onTurn);
    return () => eventBus.off(GameEventNames.TurnStarted, onTurn);
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
      if (resuming(Date.now())) return; // the old deadline is not this one
      // Offline, an end-turn would reach the other coach late, after they
      // may have held play and kept the time this coach had left
      if (offlineRef.current) return;
      if (!myTurn() || !timer?.deadline || timer.pausedBy) return;
      if (timer.turn == null || timer.turn !== turnKey()) return;
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

  // Both coaches say Time up when a turn ends on the clock. TurnEnded is
  // the engine event both screens see, so no message travels for it and the
  // engines are untouched. The grace covers the moment the command takes to
  // reach the other screen, and small differences between the two clocks.
  const turnoverThisTurn = useRef(false);
  useEffect(() => {
    const onTurnover = () => {
      turnoverThisTurn.current = true;
    };
    const onTurnEnded = ({ teamId }: { teamId: string }) => {
      const turnover = turnoverThisTurn.current;
      turnoverThisTurn.current = false;
      if (turnover || !timer?.deadline || timer.pausedBy) return;
      if (freezeRef.current || currentPhase() !== GamePhase.PLAY) return;
      if (timer.turn == null || timer.turn !== turnKey()) return;
      if (Date.now() < timer.deadline - TIME_UP_GRACE_MS) return;
      eventBus.emit(GameEventNames.UI_Announce, {
        kind: "time-up",
        headline: "Time up",
        subtitle: endedTurn(teamId),
      });
    };
    eventBus.on(GameEventNames.Turnover, onTurnover);
    eventBus.on(GameEventNames.TurnEnded, onTurnEnded);
    return () => {
      eventBus.off(GameEventNames.Turnover, onTurnover);
      eventBus.off(GameEventNames.TurnEnded, onTurnEnded);
    };
  }, [eventBus, timer?.deadline, timer?.turn, timer?.pausedBy]);

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
    // In the strip there is room for one short line: the disconnect
    // banner, the waiting banner and the decision dock name the rest
    const stoppedText =
      frozen.reason === "away"
        ? stripSlot
          ? "Paused"
          : frozen.awayIsMe
            ? "Your connection dropped: game paused"
            : `${match.opponentName} disconnected: game paused`
        : stripSlot
          ? `${fmt(left)} to decide`
          : `${who} ${fmt(left)} to decide (${pending?.type.replace(/-/g, " ")})`;
    return present(
      <div data-testid="turn-clock-stopped" className={clockClass}>
        <div
          className={`font-hud-display ${stripSlot ? "text-hud-base" : "text-hud-2xl"} leading-none text-hud-info`}
        >
          ⏸ {fmt(frozen.remaining ?? 0)}
        </div>
        <div className="font-hud-body text-hud-xs text-hud-dim">
          {stoppedText}
        </div>
      </div>
    );
  }

  const pauserName = timer.pausedBy
    ? (match.coachName(timer.pausedBy) ?? "Opponent")
    : null;
  const resume = resuming(now);
  // Never more than a turn's length: the coach who wrote the deadline may
  // have a clock a little ahead of this one
  const remaining = Math.min(
    turnSeconds * 1000,
    !deadlineIsThisTurn
      ? turnSeconds * 1000
      : resume
        ? resume.remaining - (now - resume.at)
        : timer.pausedBy
          ? (timer.deadline ?? now) - (timer.pausedAt ?? now)
          : timer.deadline - now
  );
  const low = remaining <= 15000 && !timer.pausedBy && deadlineIsThisTurn;

  return present(
    <div data-testid="turn-clock" className={clockClass}>
      <div
        className={`font-hud-display ${stripSlot ? "text-hud-base" : "text-hud-2xl"} leading-none tabular-nums ${
          timer.pausedBy
            ? "text-hud-info"
            : low
              ? "text-hud-bad animate-pulse"
              : "text-hud-bone"
        }`}
      >
        {timer.pausedBy
          ? "⏸ PAUSED"
          : `⏱ ${low && remaining <= 0 ? "Time up" : fmt(remaining)}`}
        {/* One countdown on screen; the red pulse is the warning. Screen
            readers hear it in words. */}
        {low && (
          <span
            data-testid="turn-clock-warning"
            role="status"
            className="sr-only"
          >
            {remaining <= 0 ? "Time up" : secondsLeftText(remaining)}
          </span>
        )}
      </div>
      {timer.pausedBy ? (
        <div
          className="font-hud-body text-hud-xs text-hud-dim"
          title={`Paused by ${pauserName}`}
        >
          {!stripSlot && <>by {pauserName}</>}
          {pausedByMe && (
            <>
              <button
                onClick={doResume}
                className="ml-2 font-hud-label font-bold uppercase tracking-[0.06em] text-hud-gold underline-offset-2 hover:underline"
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
          aria-label={`Timeout, ${fmt(myBank)} left`}
          title={`Take a timeout: ${fmt(myBank)} left in your bank`}
          className="font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em] text-hud-gold/90 hover:text-hud-gold disabled:opacity-40"
        >
          {stripSlot ? `⏸ ${fmt(myBank)}` : `⏸ Timeout (${fmt(myBank)})`}
        </button>
      )}
    </div>
  );
}
