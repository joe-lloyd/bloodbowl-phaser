import { createPortal } from "react-dom";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { EventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";
import {
  type LobbyDoc,
  type TimerState,
  setTurnDeadline,
  pauseClock,
  resumeClock,
  computeResume,
  nextTurnDeadline,
} from "../../firebase/lobby";
import { type OnlineMatch } from "../../network/OnlineMatch";
import {
  DEFENDER_DECISION_SECONDS,
  defaultAnswer,
} from "../../network/decisionTimeouts";
import { type AuthUser } from "../../firebase/auth";
import { type PendingDecision } from "../../headless/protocol";
import { possessive } from "../../game/managers/TurnManager";

interface Props {
  code: string;
  lobby: LobbyDoc;
  match: OnlineMatch;
  eventBus: EventBus;
  user: AuthUser;

  opponentAway?: boolean;

  awaySince?: number | null;

  awayIsMe?: boolean;

  offline?: boolean;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`;
};

export const secondsLeftText = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${String(seconds)} ${seconds === 1 ? "second" : "seconds"} left`;
};

const TIME_UP_GRACE_MS = 1000;

const RESUME_WAIT_MS = 5000;

const turnKey = (): string | null => {
  if (!ServiceContainer.isInitialized()) return null;
  const { turn } = ServiceContainer.getInstance().gameService.getState();
  return `${turn.teamId}:${String(turn.isHalf2 ? 2 : 1)}:${String(turn.turnNumber)}`;
};

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
  useEffect(() => {
    setStripSlot(document.querySelector("#match-strip-clock"));
  }, []);
  const present = (content: ReactNode) =>
    stripSlot ? createPortal(content, stripSlot) : content;
  const timer = lobby.timer;

  const myTurn = () =>
    ServiceContainer.isInitialized() &&
    ServiceContainer.getInstance().gameService.getActiveTeamId() ===
      match.myTeamId;

  const deadlineIsThisTurn = deadlineIsFor(timer, turnKey);
  const turnSeconds = lobby.settings.turnSeconds;
  const clockEnabled = turnSeconds > 0;
  const [now, setNow] = useState(Date.now());
  const endedForRef = useRef<number | null>(null);

  const decidingTeamId = match.decidingTeamId();
  const freezeRef = useRef<Freeze | null>(null);
  const freezeReason = freezeReasonFor({
    opponentAway,
    offline,
    frozen: freezeRef.current,
    otherSideDeciding: otherSideIsDeciding(decidingTeamId),
  });

  const offlineRef = useRef(offline);
  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);
  const resumeRef = useRef<{
    remaining: number;

    at: number;

    staleDeadline: number | null;
  } | null>(null);

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
      const stoppedAt =
        freezeReason === "away" && awaySince != null
          ? Math.min(awaySince, Date.now())
          : Date.now();
      freezeRef.current = {
        reason: freezeReason,
        awayIsMe,
        remaining: timeLeftAtStop({
          clockEnabled,
          deadlineIsThisTurn,
          turnSeconds,
          deadline: timer?.deadline,
          stoppedAt,
        }),
      };
    } else if (!freezeReason && frozen) {
      freezeRef.current = null;

      resumeRef.current =
        frozen.remaining == null
          ? null
          : {
              remaining: frozen.remaining,
              at: Date.now(),
              staleDeadline: timer?.deadline ?? null,
            };

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
  }, [freezeReason]);

  const { myBank, pausedByMe, bankLeft } = timeoutBank(timer, user.uid, now);

  const doResume = useCallback(() => {
    if (!timer) return;
    const { remainingBankMs, newDeadline } = computeResume(
      timer,
      user.uid,
      Date.now()
    );
    void resumeClock({ code: code, uid: user.uid, remainingBankMs: remainingBankMs, newDeadline: newDeadline });
  }, [code, user.uid, timer]);

  useEffect(() => {
    match.setClockPaused(
      opponentAway || offline
        ? "opponent-away"
        : timer?.pausedBy
          ? "timeout"
          : null
    );
  }, [match, timer?.pausedBy, opponentAway, offline]);

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
    return () => {
      eventBus.off(GameEventNames.TurnStarted, onTurn);
    };
  }, [code, turnSeconds, eventBus]);

  const answerOnce = (pending: PendingDecision, key: string) => {
    if (answeredRef.current === key) return;
    answeredRef.current = key;
    const answer = defaultAnswer(pending);
    if (!answer) return;
    const settle = () => {
      if (answeredRef.current === key) answeredRef.current = null;
    };
    void match.run(answer).then(settle).catch(settle);
  };

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
    answerOnce(pending, `${String(decisionRef.current.since)}:${key}`);
  };

  useEffect(() => {
    if (!clockEnabled) return;
    const id = setInterval(() => {
      setNow(Date.now());
      answerIfOutOfTime();
      if (freezeRef.current) return;
      if (resuming(Date.now())) return;

      if (offlineRef.current) return;
      if (!myTurn() || !timer?.deadline || timer.pausedBy) return;
      if (timer.turn == null || timer.turn !== turnKey()) return;
      if (Date.now() <= timer.deadline) return;
      if (currentPhase() !== GamePhase.PLAY) return;

      const pending = match.pendingDecision();
      if (pending) {
        if (match.decidingTeamId() !== match.myTeamId) return;
        answerOnce(
          pending,
          `${String(timer.deadline)}:${JSON.stringify(pending)}`
        );
        return;
      }
      if (endedForRef.current === timer.deadline) return;
      endedForRef.current = timer.deadline;

      ServiceContainer.getInstance().gameService.endTurn();
    }, 500);
    return () => {
      clearInterval(id);
    };
  }, [clockEnabled, timer?.deadline, timer?.pausedBy, match]);

  const turnoverThisTurn = useRef(false);
  useEffect(() => {
    const onTurnover = () => {
      turnoverThisTurn.current = true;
    };
    const onTurnEnded = ({ teamId }: { teamId: string }) => {
      const turnover = turnoverThisTurn.current;
      turnoverThisTurn.current = false;
      if (!clockEnabled || turnover || !timer?.deadline || timer.pausedBy)
        return;
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
  }, [clockEnabled, eventBus, timer?.deadline, timer?.turn, timer?.pausedBy]);

  const bankDry = pausedByMe && bankLeft <= 0;
  useEffect(() => {
    if (bankDry) doResume();
  }, [bankDry, doResume]);

  const shown = shownTimer(clockEnabled, timer);
  if (!shown) return null;

  const frozen = freezeRef.current;
  if (frozen) {
    return present(
      <StoppedClock
        frozen={frozen}
        pending={match.pendingDecision()}
        decision={decisionRef.current}
        now={now}
        decidingIsMe={decidingTeamId === match.myTeamId}
        opponentName={match.opponentName}
        inStrip={stripSlot !== null}
      />
    );
  }

  return present(
    <RunningClock
      timer={shown}
      remaining={turnTimeLeft({
        turnSeconds,
        deadlineIsThisTurn,
        resume: resuming(now),
        timer: shown,
        now,
      })}
      deadlineIsThisTurn={deadlineIsThisTurn}
      inStrip={stripSlot !== null}
      coachName={(uid) => match.coachName(uid)}
      pausedByMe={pausedByMe}
      bankLeft={bankLeft}
      myBank={myBank}
      onResume={doResume}
      onPause={() => void pauseClock(code, user.uid)}
    />
  );
}

type FreezeReason = "away" | "deciding";

interface Freeze {
  reason: FreezeReason;

  awayIsMe: boolean;

  remaining: number | null;
}

type ShownTimer = TimerState & { deadline: number };

function deadlineIsFor(
  timer: TimerState | null | undefined,
  turnKey: () => string | null
): boolean {
  return timer?.turn != null && timer.turn === turnKey();
}

function otherSideIsDeciding(decidingTeamId: string | null): boolean {
  const activeTeamId = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getActiveTeamId()
    : null;
  return (
    currentPhase() === GamePhase.PLAY &&
    decidingTeamId != null &&
    decidingTeamId !== activeTeamId
  );
}

function freezeReasonFor({
  opponentAway,
  offline,
  frozen,
  otherSideDeciding,
}: {
  opponentAway: boolean;
  offline: boolean;
  frozen: Freeze | null;
  otherSideDeciding: boolean;
}): FreezeReason | null {
  if (opponentAway || (offline && frozen?.reason === "away")) return "away";
  return otherSideDeciding ? "deciding" : null;
}

function timeLeftAtStop({
  clockEnabled,
  deadlineIsThisTurn,
  turnSeconds,
  deadline,
  stoppedAt,
}: {
  clockEnabled: boolean;
  deadlineIsThisTurn: boolean;
  turnSeconds: number;
  deadline: number | null | undefined;
  stoppedAt: number;
}): number | null {
  if (!clockEnabled) return null;
  if (!deadlineIsThisTurn) return turnSeconds * 1000;
  return deadline == null
    ? null
    : Math.min(turnSeconds * 1000, deadline - stoppedAt);
}

function timeoutBank(
  timer: TimerState | null | undefined,
  uid: string,
  now: number
) {
  const myBank = timer?.banks?.[uid] ?? 0;
  const pausedByMe = timer?.pausedBy === uid;
  const bankLeft = pausedByMe
    ? Math.max(0, myBank - (now - (timer?.pausedAt ?? now)))
    : myBank;
  return { myBank, pausedByMe, bankLeft };
}

function shownTimer(
  clockEnabled: boolean,
  timer: TimerState | null | undefined
): ShownTimer | null {
  if (!clockEnabled || timer?.deadline == null) return null;
  if (currentPhase() !== GamePhase.PLAY) return null;
  return { ...timer, deadline: timer.deadline };
}

function turnTimeLeft({
  turnSeconds,
  deadlineIsThisTurn,
  resume,
  timer,
  now,
}: {
  turnSeconds: number;
  deadlineIsThisTurn: boolean;
  resume: { remaining: number; at: number } | null;
  timer: ShownTimer;
  now: number;
}): number {
  const turnMs = turnSeconds * 1000;
  if (!deadlineIsThisTurn) return turnMs;
  if (resume) return Math.min(turnMs, resume.remaining - (now - resume.at));
  if (timer.pausedBy)
    return Math.min(turnMs, timer.deadline - (timer.pausedAt ?? now));
  return Math.min(turnMs, timer.deadline - now);
}

const clockClass = (inStrip: boolean) =>
  inStrip
    ? "flex skew-x-12 items-center gap-2 whitespace-nowrap text-hud-xs"
    : "hud-slab absolute top-[7.25rem] left-1/2 -translate-x-1/2 z-[92] pointer-events-auto flex min-w-[168px] flex-col items-center gap-0.5 px-4 py-2";

function StoppedClock({
  frozen,
  pending,
  decision,
  now,
  decidingIsMe,
  opponentName,
  inStrip,
}: {
  frozen: Freeze;
  pending: PendingDecision | null;
  decision: { since: number } | null;
  now: number;
  decidingIsMe: boolean;
  opponentName: string;
  inStrip: boolean;
}) {
  const left =
    frozen.reason === "deciding" && pending && decision
      ? DEFENDER_DECISION_SECONDS[pending.type] * 1000 - (now - decision.since)
      : 0;
  const who = decidingIsMe ? "You have" : `${opponentName} has`;

  const stoppedText =
    frozen.reason === "away"
      ? inStrip
        ? "Paused"
        : frozen.awayIsMe
          ? "Your connection dropped: game paused"
          : `${opponentName} disconnected: game paused`
      : inStrip
        ? `${fmt(left)} to decide`
        : `${who} ${fmt(left)} to decide (${String(pending?.type.replaceAll('-', " "))})`;
  return (
    <div data-testid="turn-clock-stopped" className={clockClass(inStrip)}>
      <div
        className={`font-hud-display ${inStrip ? "text-hud-base" : "text-hud-2xl"} leading-none text-hud-info`}
      >
        ⏸ {fmt(frozen.remaining ?? 0)}
      </div>
      <div className="font-hud-body text-hud-xs text-hud-dim">
        {stoppedText}
      </div>
    </div>
  );
}

function RunningClock({
  timer,
  remaining,
  deadlineIsThisTurn,
  inStrip,
  coachName,
  pausedByMe,
  bankLeft,
  myBank,
  onResume,
  onPause,
}: {
  timer: ShownTimer;
  remaining: number;
  deadlineIsThisTurn: boolean;
  inStrip: boolean;
  coachName: (uid: string) => string | undefined;
  pausedByMe: boolean;
  bankLeft: number;
  myBank: number;
  onResume: () => void;
  onPause: () => void;
}) {
  const low = remaining <= 15_000 && !timer.pausedBy && deadlineIsThisTurn;
  return (
    <div data-testid="turn-clock" className={clockClass(inStrip)}>
      <div
        className={`font-hud-display ${inStrip ? "text-hud-base" : "text-hud-2xl"} leading-none tabular-nums ${
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
        <PausedBy
          pauserName={coachName(timer.pausedBy) ?? "Opponent"}
          inStrip={inStrip}
          pausedByMe={pausedByMe}
          bankLeft={bankLeft}
          onResume={onResume}
        />
      ) : (
        <button
          onClick={onPause}
          disabled={myBank <= 0}
          aria-label={`Timeout, ${fmt(myBank)} left`}
          title={`Take a timeout: ${fmt(myBank)} left in your bank`}
          className="font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em] text-hud-gold/90 hover:text-hud-gold disabled:opacity-40"
        >
          {inStrip ? `⏸ ${fmt(myBank)}` : `⏸ Timeout (${fmt(myBank)})`}
        </button>
      )}
    </div>
  );
}

function PausedBy({
  pauserName,
  inStrip,
  pausedByMe,
  bankLeft,
  onResume,
}: {
  pauserName: string;
  inStrip: boolean;
  pausedByMe: boolean;
  bankLeft: number;
  onResume: () => void;
}) {
  return (
    <div
      className="font-hud-body text-hud-xs text-hud-dim"
      title={`Paused by ${pauserName}`}
    >
      {!inStrip && <>by {pauserName}</>}
      {pausedByMe && (
        <>
          <button
            onClick={onResume}
            className="ml-2 font-hud-label font-bold uppercase tracking-[0.06em] text-hud-gold underline-offset-2 hover:underline"
          >
            Resume
          </button>
          <span className="ml-2">({fmt(bankLeft)} left)</span>
        </>
      )}
    </div>
  );
}
