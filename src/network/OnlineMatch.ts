/**
 * OnlineMatch - boots an online match in the browser for either role.
 *
 * Host: plays natively on the real engine. A HeadlessGame is attached to the
 * same services purely to (a) execute the guest's protocol commands and
 * (b) track pending decisions; an event broadcaster pushes the host's own
 * play to the guest as {events, snapshot} bundles. The host's decision
 * replies (block die, push direction, follow-up, touchback) route through
 * the protocol too, so decision state stays consistent for both coaches.
 *
 * Guest: the UI drives a NetworkedGameService — reads from a passive local
 * replica, mutations over the wire. Incoming bundles re-emit the host's
 * events on the local bus (animations, dialogs, dice log) and then apply
 * the authoritative snapshot to the replica.
 */

import { IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { IGameService } from "../services/interfaces/IGameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  CommandResponse,
  EmittedEvent,
  HeadlessCommand,
  PendingDecision,
} from "../headless/protocol";
import {
  applySnapshotToTeams,
  deserializeGameState,
  GameSnapshot,
} from "../headless/serialization";
import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { Team } from "../types/Team";
import { BlockResult } from "../services/BlockResolutionService";
import { HostSession } from "./HostSession";
import { GuestSession } from "./GuestSession";
import { FirestoreTransport } from "./FirestoreTransport";
import { Transport } from "./transport";
import { NetworkedGameService } from "./NetworkedGameService";
import { decisionOwner } from "./OwnershipGate";
import { PROTOCOL_VERSION } from "./envelope";
import { LobbyDoc, persistSnapshot } from "../firebase/lobby";
import { AuthUser } from "../firebase/auth";

export interface ChatMessage {
  text: string;
  senderName: string;
  fromSelf: boolean;
  ts: number;
}

export type ProgressionCommand = Extract<
  HeadlessCommand,
  { type: "award-mvp" | "assign-awarded-touchdown" }
>;

export interface OnlineMatch {
  role: "host" | "guest";
  code: string;
  myTeamId: string;
  opponentName: string;
  /** Coach display name controlling the given team (privacy-safe, not Google) */
  coachName(teamId: string): string | undefined;
  teams: { team1: Team; team2: Team };
  seed: number;
  /** May this player act right now (their turn, or their pending decision)? */
  mayAct(): boolean;
  /** Human label for the waiting overlay when mayAct() is false */
  waitingLabel(): string;
  pendingDecision(): PendingDecision | null;
  sendChat(text: string): void;
  onChatMessage(listener: (message: ChatMessage) => void): () => void;
  chatHistory(): ChatMessage[];
  /** Version-mismatch or transport error the UI should surface */
  onFatalError(listener: (message: string) => void): () => void;
  /** Persist the current authoritative state so the match can resume later
   *  (host only; a no-op for the guest, which holds no engine). */
  saveState(): void;
  /** Freeze/unfreeze all input while the turn clock is paused. */
  setClockPaused(paused: boolean): void;
  /** Run a post-match choice on the authoritative host engine. */
  runProgressionCommand(command: ProgressionCommand): Promise<CommandResponse>;
  close(): void;
}

/** The match the current page is playing, if any (UI gating hooks). */
let activeMatch: OnlineMatch | null = null;
export function getActiveOnlineMatch(): OnlineMatch | null {
  return activeMatch;
}
export function setActiveOnlineMatch(match: OnlineMatch | null): void {
  activeMatch = match;
}

/**
 * UI-intent events: emitted by dialogs/menus and consumed by phase handlers,
 * which then mutate the engine. They must never cross the wire — replaying
 * one on the other machine would trigger its handlers and loop a command
 * back. Engine→UI prompts (UI_SelectPushDirection, UI_FollowUpPrompt, …)
 * are NOT in this set: the guest needs those to render decision dialogs.
 *
 * UI_LogEntry and UI_Announce are engine-emitted outcomes (the host resolves
 * weather/kickoff/turn flow and describes what happened), not intents — like
 * UI_Notification and DiceRoll they belong OUTSIDE this set so they broadcast
 * normally and a guest's log/announcer matches the host's.
 */
const UI_INTENT_EVENTS = new Set<string>([
  GameEventNames.UI_RollBlockDice,
  GameEventNames.UI_BlockResultSelected,
  GameEventNames.UI_FollowUpResponse,
  GameEventNames.UI_RerollResponse,
  GameEventNames.UI_ReactionResponse,
  GameEventNames.UI_InterceptionResponse,
  GameEventNames.UI_ApothecaryResponse,
  GameEventNames.UI_ConfirmationResult,
  GameEventNames.UI_CoinFlipComplete,
  GameEventNames.UI_SetupAction,
  GameEventNames.UI_ActionSelected,
  GameEventNames.UI_CancelAction,
  GameEventNames.UI_EndActivation,
  GameEventNames.UI_StepSelected,
  GameEventNames.UI_StartCoinFlip,
  GameEventNames.UI_KickoffEventSelectPlayer,
  GameEventNames.UI_KickoffEventMovePlayer,
  GameEventNames.UI_KickoffEventPlacePlayer,
  GameEventNames.UI_KickoffEventDeclareAction,
  GameEventNames.UI_KickoffEventConfirm,
  GameEventNames.UI_KickoffEventSkip,
  // Skipping the end-of-drive beat is a local viewing choice; replaying it
  // would cut the other coach's sequence short mid-animation.
  GameEventNames.UI_SkipDriveSequence,
  // Presentation acknowledgements are local to each client's animation.
  GameEventNames.UI_PresentationAcknowledged,
]);

/** Buffers native host events and flushes them as one broadcast bundle. */
class EventBroadcaster {
  private buffer: EmittedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private readonly unsubscribes: (() => void)[] = [];

  constructor(
    eventBus: IEventBus,
    private readonly flush: (events: EmittedEvent[]) => void,
    private readonly debounceMs = 150
  ) {
    Object.values(GameEventNames).forEach((name) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (data: any) => this.record(name, data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventBus.on(name as any, handler);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.unsubscribes.push(() => eventBus.off(name as any, handler));
    });
  }

  /** While paused, events are NOT recorded: they already travel inside the
   *  command response of whatever execute() is running. */
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }

  private record(name: string, data: unknown): void {
    if (this.paused || UI_INTENT_EVENTS.has(name)) return;
    this.buffer.push({ name, data });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const events = this.buffer;
      this.buffer = [];
      this.timer = null;
      if (events.length > 0) this.flush(events);
    }, this.debounceMs);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
  }
}

interface CreateMatchOptions {
  lobby: LobbyDoc;
  user: AuthUser;
  eventBus: IEventBus;
  /** Override for tests (defaults to FirestoreTransport on the lobby code) */
  transport?: Transport;
}

export function createOnlineMatch(options: CreateMatchOptions): OnlineMatch {
  const { lobby, user, eventBus } = options;
  const isHost = user.uid === lobby.hostUid;
  const hostPlayer = lobby.players[lobby.hostUid];
  const guestPlayer = lobby.guestUid ? lobby.players[lobby.guestUid] : null;
  if (!hostPlayer?.team || !guestPlayer?.team || lobby.seed == null) {
    throw new Error("lobby-not-ready");
  }

  // Same construction order on both machines: team1 = host's team
  const team1 = hostPlayer.team;
  const team2 = guestPlayer.team;
  const seed = lobby.seed;
  // A resumed match carries the last authoritative state; a fresh one starts
  // at SETUP/INTRO. Player placements ride on the team objects.
  const savedSnapshot = lobby.snapshot ?? null;
  const myTeamId = isHost ? team1.id : team2.id;
  const opponentName = isHost
    ? guestPlayer.displayName
    : hostPlayer.displayName;
  // Coach names (privacy-safe) keyed by the team each controls
  const coachNames: Record<string, string> = {
    [team1.id]: hostPlayer.displayName,
    [team2.id]: guestPlayer.displayName,
  };
  const myName = isHost ? hostPlayer.displayName : guestPlayer.displayName;
  // While the turn clock is paused, all input is frozen for both players.
  let clockPaused = false;

  const transport =
    options.transport ?? new FirestoreTransport(lobby.code, user.uid);

  // Shared bits
  const chatLog: ChatMessage[] = [];
  const chatListeners = new Set<(message: ChatMessage) => void>();
  const errorListeners = new Set<(message: string) => void>();
  const pushChat = (message: ChatMessage) => {
    chatLog.push(message);
    chatListeners.forEach((listener) => listener(message));
  };
  const fatal = (message: string) =>
    errorListeners.forEach((listener) => listener(message));
  const checkHello = (payload: { protocolVersion: number }) => {
    if (payload.protocolVersion !== PROTOCOL_VERSION) {
      fatal(
        `Incompatible game versions (you: ${PROTOCOL_VERSION}, opponent: ${payload.protocolVersion}). Both players must update.`
      );
    }
  };

  const teamName = (teamId: string) =>
    (teamId === team1.id ? team1 : team2).name;

  if (isHost) {
    return createHostMatch();
  }
  return createGuestMatch();

  // ===== Host =====

  function createHostMatch(): OnlineMatch {
    // A resumed match rebuilds the exact saved state; a fresh one boots into
    // SETUP/INTRO like local play (GameScene.init) so the orchestrator runs
    // the opening sequence. Without an initial state the engine would default
    // to SANDBOX_IDLE and nothing would start.
    let initialState;
    if (savedSnapshot) {
      applySnapshotToTeams(savedSnapshot, [team1, team2]);
      initialState = deserializeGameState(savedSnapshot);
    } else {
      initialState = GameService.createInitialState(
        team1,
        team2,
        GamePhase.SETUP,
        SubPhase.INTRO
      );
    }
    const container = ServiceContainer.initialize(
      eventBus,
      team1,
      team2,
      initialState,
      seed,
      undefined,
      lobby.settings.progressionEnabled ?? false
    );
    const native = container.gameService as GameService;
    const game = new HeadlessGame({
      ctx: {
        eventBus,
        gameService: native,
        rng: container.rngService,
        team1,
        team2,
        seed,
        matchStats: container.matchStats,
      },
      autoStartOnReady: false,
    });

    // Persist the authoritative snapshot so the match survives a reload /
    // "save for later". Throttled to keep Firestore writes cheap; flushed
    // explicitly on saveState()/close.
    let lastPersist = 0;
    const persistNow = () => {
      lastPersist = Date.now();
      void persistSnapshot(lobby.code, game.snapshot()).catch((error) =>
        console.warn("[Online] snapshot persist failed:", error)
      );
    };

    const broadcaster = new EventBroadcaster(eventBus, (events) => {
      void session.broadcastEvents(events);
      if (Date.now() - lastPersist > 15_000) persistNow();
    });

    const session = new HostSession({
      transport,
      game,
      hostTeamId: team1.id,
      guestTeamId: team2.id,
      selfId: user.uid,
      onChat: (payload) =>
        pushChat({
          text: payload.text,
          senderName: payload.senderName,
          fromSelf: false,
          ts: Date.now(),
        }),
      onGuestApplied: () => {
        // Render the guest's setup placements on the host's board (the scene
        // doesn't render PlayerPlaced for the opponent). Play renders via
        // the engine's own events, so limit this to setup.
        if (native.getPhase() === GamePhase.SETUP) {
          eventBus.emit(GameEventNames.UI_SyncBoard);
        }
      },
      onHello: (payload) => {
        checkHello(payload);
        // The guest just (re)connected: push the authoritative snapshot so
        // it catches up to the host's exact state — covers initial sync and
        // a guest that reloaded mid-match.
        void session.sendResync();
      },
      // The guest's command response already carries these events
      onGuestExecuteStart: () => broadcaster.pause(),
      onGuestExecuteEnd: () => broadcaster.resume(),
    });
    void session.sendHello();

    /** Host decision replies go through the protocol so pending-decision
     *  state stays consistent; the broadcast inside executeLocal already
     *  delivers the events, so the broadcaster pauses meanwhile. */
    const executeOnHost = async (
      command: HeadlessCommand
    ): Promise<CommandResponse> => {
      broadcaster.pause();
      try {
        const response = await session.executeLocal(command);
        if (!response.ok) {
          console.warn(
            `[Online] host ${command.type} rejected: ${response.reason}`
          );
        }
        return response;
      } finally {
        broadcaster.resume();
      }
    };
    const executeAsHost = (command: HeadlessCommand) => {
      void executeOnHost(command);
    };

    let swallowNextFinish: string | null = null;
    const overrides: Partial<IGameService> = {
      resolveBlock: (_a: string, _d: string, result: BlockResult) => {
        const pending = game.pendingDecision();
        if (pending?.type !== "block-dice") return;
        const wanted = JSON.stringify(result);
        const index = pending.options.findIndex(
          (option) => JSON.stringify(option) === wanted
        );
        executeAsHost({
          type: "choose-block-result",
          index: Math.max(0, index),
        });
      },
      executePush: (
        _a: string,
        _d: string,
        direction: { x: number; y: number }
      ) => {
        executeAsHost({
          type: "choose-push-direction",
          x: direction.x,
          y: direction.y,
        });
      },
      followUpPush: (attackerId: string) => {
        swallowNextFinish = attackerId;
        executeAsHost({ type: "choose-follow-up", followUp: true });
      },
      awardTouchback: (playerId: string) => {
        executeAsHost({ type: "touchback", playerId });
        return true;
      },
      answerReroll: (accept: boolean, source?: "skill" | "team") => {
        if (game.pendingDecision()?.type !== "reroll") return false;
        executeAsHost({ type: "use-reroll", accept, source });
        return true;
      },
      answerReaction: (accept: boolean) => {
        if (game.pendingDecision()?.type !== "reaction") return false;
        executeAsHost({ type: "use-reaction", accept });
        return true;
      },
      answerInterception: (playerId?: string) => {
        if (game.pendingDecision()?.type !== "interception") return false;
        executeAsHost({ type: "choose-interception", playerId });
        return true;
      },
      answerApothecary: (accept: boolean) => {
        if (game.pendingDecision()?.type !== "apothecary") return false;
        executeAsHost({ type: "use-apothecary", accept });
        return true;
      },
      finishActivation: (playerId: string) => {
        if (swallowNextFinish === playerId) {
          swallowNextFinish = null;
          return;
        }
        if (game.pendingDecision()?.type === "follow-up") {
          executeAsHost({ type: "choose-follow-up", followUp: false });
          return;
        }
        native.finishActivation(playerId);
      },
    };

    // TS `private` is compile-time only, so a Proxy delegating to the live
    // service is safe: everything behaves natively except decision replies.
    const hostFacade = new Proxy(native, {
      get(target, property, receiver) {
        if (property in overrides) {
          return overrides[property as keyof IGameService];
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as IGameService;

    // Replace the container's service so scene/HUD get the facade
    (container as { gameService: IGameService }).gameService = hostFacade;

    return finishMatch({
      role: "host",
      pendingDecision: () => game.pendingDecision(),
      sendChatRaw: (text) => void session.sendChat(text, myName),
      activeTeamId: () => native.getActiveTeamId(),
      phase: () => native.getPhase(),
      runProgressionCommand: executeOnHost,
      saveState: persistNow,
      close: () => {
        persistNow(); // final save so a reload resumes where we left off
        broadcaster.close();
        session.close();
        transport.close();
      },
    });
  }

  // ===== Guest =====

  function createGuestMatch(): OnlineMatch {
    let pending: PendingDecision | null = null;
    let replica: GameService | null = null;
    let lastPhase: GamePhase | null = null;
    let lastSubPhase: SubPhase | null = null;

    const applyBundle = (
      events: EmittedEvent[],
      snapshot: GameSnapshot,
      pendingDecision: PendingDecision | null
    ) => {
      // 1. Authoritative correction FIRST: snapshot overwrites the replica.
      //    Exception: during MY own setup turn, my placements are optimistic
      //    and may not all be acknowledged yet (e.g. a formation loads 7 at
      //    once) — trust the local positions for my team so nothing flashes
      //    back. They reconcile with the host the moment setup is confirmed
      //    or the turn moves on (this guard goes false).
      //    This must happen BEFORE the events below are replayed: several
      //    event handlers (ball/status reconciliation) read fresh state via
      //    gameService.getState() the instant they fire rather than from the
      //    event payload — if the replica were still on the previous bundle's
      //    state when they ran, they'd render stale results (e.g. the ball
      //    snapping to where it was one bundle ago).
      if (replica) {
        const myTeam = myTeamId === team1.id ? team1 : team2;
        const preserveMySetup =
          snapshot.phase === GamePhase.SETUP &&
          snapshot.activeTeamId === myTeamId;
        const saved = preserveMySetup
          ? new Map(myTeam.players.map((p) => [p.id, p.gridPosition]))
          : null;
        applySnapshotToTeams(snapshot, [team1, team2]);
        Object.assign(replica.getState(), deserializeGameState(snapshot));
        if (saved) {
          myTeam.players.forEach((p) => (p.gridPosition = saved.get(p.id)));
        }
        // Per-team turn counters (TurnManager.turnCounts) are not part of
        // GameState/GameSnapshot proper — restore them from the sidecar
        // field so the guest's scoreboard turn track (getTurnNumber per
        // team) matches the host instead of staying frozen at its initial
        // value for the whole match. Absent on pre-feature bundles.
        if (snapshot.turnManager) {
          replica.restoreTurnManagerState(snapshot.turnManager);
        }
      }

      // 2. Replay the host's events: animations, dialogs, dice log — now
      //    against up-to-date replica state (see comment above).
      for (const event of events) {
        if (UI_INTENT_EVENTS.has(event.name)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventBus.emit(event.name as any, event.data as any);
      }
      pending = pendingDecision;

      // Cache the last authoritative snapshot so a guest reload has state to
      // fall back on before the host's resync arrives (best-effort).
      try {
        localStorage.setItem(
          `bb_online_snapshot_${lobby.code}`,
          JSON.stringify(snapshot)
        );
      } catch {
        // storage full / unavailable — non-fatal
      }

      // 3. Drive the scene across phase jumps. A resync (or resume of a
      //    saved mid-play match) carries no PhaseChanged event, so emit one
      //    ourselves when the phase/subphase moved — the orchestrator is
      //    idempotent if the host already broadcast the same transition.
      const subPhase = snapshot.subPhase ?? null;
      if (snapshot.phase !== lastPhase || subPhase !== lastSubPhase) {
        lastPhase = snapshot.phase;
        lastSubPhase = subPhase;
        eventBus.emit(GameEventNames.PhaseChanged, {
          phase: snapshot.phase,
          subPhase: snapshot.subPhase ?? undefined,
        });
      }

      // 4. Reconcile the board to authoritative state. In setup this renders
      //    the opponent's placements (the scene doesn't draw the opponent's
      //    PlayerPlaced); in play it reconciles status visuals (down/up/
      //    stunned) that a missed event would otherwise leave stale — the
      //    scene handler keeps it position-safe during play. Movement itself
      //    still animates via the replayed events above.
      eventBus.emit(GameEventNames.UI_SyncBoard);
    };

    const session = new GuestSession({
      transport,
      selfId: user.uid,
      onApply: (response) =>
        applyBundle(
          response.events,
          response.snapshot,
          response.pendingDecision
        ),
      onBroadcast: (payload) =>
        applyBundle(
          payload.response.events,
          payload.response.snapshot,
          payload.response.pendingDecision
        ),
      onResync: (payload) =>
        applyBundle([], payload.snapshot, payload.pendingDecision),
      onChat: (payload) =>
        pushChat({
          text: payload.text,
          senderName: payload.senderName,
          fromSelf: false,
          ts: Date.now(),
        }),
      onHello: checkHello,
    });
    void session.sendHello();

    const dispatch = (command: HeadlessCommand): Promise<CommandResponse> =>
      session.sendCommand(command);

    // The container's engine becomes a passive replica behind the proxy;
    // its rules never execute (mutators go over the wire). Boot it into
    // SETUP/INTRO to match the host and the local-play scene, so the
    // orchestrator enters the SETUP phase instead of sitting in
    // SANDBOX_IDLE; the host's broadcasts/resync then drive it forward.
    const initialState = GameService.createInitialState(
      team1,
      team2,
      GamePhase.SETUP,
      SubPhase.INTRO
    );
    ServiceContainer.initialize(
      eventBus,
      team1,
      team2,
      initialState,
      seed,
      (inner: GameService): IGameService => {
        replica = inner;
        return new NetworkedGameService(inner, dispatch, () => pending);
      },
      lobby.settings.progressionEnabled ?? false
    );

    return finishMatch({
      role: "guest",
      pendingDecision: () => pending,
      sendChatRaw: (text) => void session.sendChat(text, myName),
      activeTeamId: () => replica?.getActiveTeamId() ?? null,
      phase: () => replica?.getPhase() ?? GamePhase.SETUP,
      runProgressionCommand: dispatch,
      // The guest holds no authoritative engine; the host persists state.
      saveState: () => {},
      close: () => {
        session.close();
        transport.close();
      },
    });
  }

  // ===== Shared assembly =====

  function finishMatch(parts: {
    role: "host" | "guest";
    pendingDecision: () => PendingDecision | null;
    sendChatRaw: (text: string) => void;
    activeTeamId: () => string | null;
    phase: () => GamePhase;
    runProgressionCommand(
      command: ProgressionCommand
    ): Promise<CommandResponse>;
    saveState: () => void;
    close: () => void;
  }): OnlineMatch {
    const teamOf = (playerId: string): string | undefined => {
      const all = [...team1.players, ...team2.players];
      return all.find((p) => p.id === playerId)?.teamId;
    };

    // During KICKOFF the kicking team acts (select kicker, kick). It is the
    // NON-active team — active is the receiving team, set last in setup — so
    // the actor is whoever isn't currently active.
    const isKickoffActor = (): boolean => {
      const active = parts.activeTeamId();
      return (
        parts.phase() === GamePhase.KICKOFF &&
        active != null &&
        active !== myTeamId
      );
    };

    const match: OnlineMatch = {
      role: parts.role,
      code: lobby.code,
      myTeamId,
      opponentName,
      coachName: (teamId: string) => coachNames[teamId],
      teams: { team1, team2 },
      seed,
      pendingDecision: parts.pendingDecision,
      mayAct(): boolean {
        if (clockPaused) return false; // clock paused — nobody acts
        const pending = parts.pendingDecision();
        if (pending) {
          const owner = decisionOwner(pending, {
            activeTeamId: parts.activeTeamId(),
            pendingDecision: pending,
            teamIdOfPlayer: teamOf,
            hostTeamId: team1.id,
          });
          return owner === myTeamId;
        }
        // Kickoff belongs to the kicking (non-active) team; otherwise the
        // active team acts.
        if (parts.phase() === GamePhase.KICKOFF) return isKickoffActor();
        return parts.activeTeamId() === myTeamId;
      },
      waitingLabel(): string {
        const pending = parts.pendingDecision();
        if (pending) {
          return `Waiting for ${opponentName} — ${pending.type.replace(/-/g, " ")}…`;
        }
        if (parts.phase() === GamePhase.KICKOFF && !isKickoffActor()) {
          return `Waiting for ${opponentName} to kick off…`;
        }
        const active = parts.activeTeamId();
        return active && active !== myTeamId
          ? `${opponentName}'s turn (${teamName(active)})…`
          : "Waiting…";
      },
      sendChat(text: string): void {
        const trimmed = text.trim();
        if (!trimmed) return;
        parts.sendChatRaw(trimmed);
        pushChat({
          text: trimmed,
          senderName: myName,
          fromSelf: true,
          ts: Date.now(),
        });
      },
      onChatMessage(listener) {
        chatListeners.add(listener);
        return () => chatListeners.delete(listener);
      },
      chatHistory: () => [...chatLog],
      onFatalError(listener) {
        errorListeners.add(listener);
        return () => errorListeners.delete(listener);
      },
      saveState: parts.saveState,
      setClockPaused: (paused: boolean) => {
        clockPaused = paused;
      },
      runProgressionCommand: parts.runProgressionCommand,
      close(): void {
        parts.close();
        if (activeMatch === match) setActiveOnlineMatch(null);
      },
    };
    return match;
  }
}
