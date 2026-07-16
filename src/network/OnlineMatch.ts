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
import { Team } from "../types/Team";
import { BlockResult } from "../services/BlockResolutionService";
import { HostSession } from "./HostSession";
import { GuestSession } from "./GuestSession";
import { FirestoreTransport } from "./FirestoreTransport";
import { Transport } from "./transport";
import { NetworkedGameService } from "./NetworkedGameService";
import { decisionOwner } from "./OwnershipGate";
import { PROTOCOL_VERSION } from "./envelope";
import { LobbyDoc } from "../firebase/lobby";
import { AuthUser } from "../firebase/auth";

export interface ChatMessage {
  text: string;
  senderName: string;
  fromSelf: boolean;
  ts: number;
}

export interface OnlineMatch {
  role: "host" | "guest";
  code: string;
  myTeamId: string;
  opponentName: string;
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
 */
const UI_INTENT_EVENTS = new Set<string>([
  GameEventNames.UI_RollBlockDice,
  GameEventNames.UI_BlockResultSelected,
  GameEventNames.UI_FollowUpResponse,
  GameEventNames.UI_ConfirmationResult,
  GameEventNames.UI_CoinFlipComplete,
  GameEventNames.UI_SetupAction,
  GameEventNames.UI_ActionSelected,
  GameEventNames.UI_CancelAction,
  GameEventNames.UI_EndActivation,
  GameEventNames.UI_StepSelected,
  GameEventNames.UI_StartCoinFlip,
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
  const myTeamId = isHost ? team1.id : team2.id;
  const opponentName = isHost
    ? guestPlayer.displayName
    : hostPlayer.displayName;

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
    const container = ServiceContainer.initialize(
      eventBus,
      team1,
      team2,
      undefined,
      seed
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
      },
      autoStartOnReady: false,
    });

    const broadcaster = new EventBroadcaster(eventBus, (events) => {
      void session.broadcastEvents(events);
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
      onHello: checkHello,
      // The guest's command response already carries these events
      onGuestExecuteStart: () => broadcaster.pause(),
      onGuestExecuteEnd: () => broadcaster.resume(),
    });
    void session.sendHello();

    /** Host decision replies go through the protocol so pending-decision
     *  state stays consistent; the broadcast inside executeLocal already
     *  delivers the events, so the broadcaster pauses meanwhile. */
    const executeAsHost = (command: HeadlessCommand) => {
      broadcaster.pause();
      void session
        .executeLocal(command)
        .then((response) => {
          if (!response.ok) {
            console.warn(
              `[Online] host ${command.type} rejected: ${response.reason}`
            );
          }
        })
        .finally(() => broadcaster.resume());
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
      sendChatRaw: (text) =>
        void session.sendChat(text, user.displayName ?? "Host"),
      activeTeamId: () => native.getActiveTeamId(),
      close: () => {
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

    const applyBundle = (
      events: EmittedEvent[],
      snapshot: GameSnapshot,
      pendingDecision: PendingDecision | null
    ) => {
      // 1. Replay the host's events: animations, dialogs, dice log
      for (const event of events) {
        if (UI_INTENT_EVENTS.has(event.name)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventBus.emit(event.name as any, event.data as any);
      }
      // 2. Authoritative correction: snapshot overwrites the replica
      if (replica) {
        applySnapshotToTeams(snapshot, [team1, team2]);
        Object.assign(replica.getState(), deserializeGameState(snapshot));
      }
      pending = pendingDecision;
    };

    const session = new GuestSession({
      transport,
      selfId: user.uid,
      onApply: (response) =>
        applyBundle(response.events, response.snapshot, response.pendingDecision),
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
    // its rules never execute (mutators go over the wire).
    ServiceContainer.initialize(
      eventBus,
      team1,
      team2,
      undefined,
      seed,
      (inner: GameService): IGameService => {
        replica = inner;
        return new NetworkedGameService(inner, dispatch, () => pending);
      }
    );

    return finishMatch({
      role: "guest",
      pendingDecision: () => pending,
      sendChatRaw: (text) =>
        void session.sendChat(text, user.displayName ?? "Guest"),
      activeTeamId: () => replica?.getActiveTeamId() ?? null,
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
    close: () => void;
  }): OnlineMatch {
    const teamOf = (playerId: string): string | undefined => {
      const all = [...team1.players, ...team2.players];
      return all.find((p) => p.id === playerId)?.teamId;
    };

    const match: OnlineMatch = {
      role: parts.role,
      code: lobby.code,
      myTeamId,
      opponentName,
      teams: { team1, team2 },
      seed,
      pendingDecision: parts.pendingDecision,
      mayAct(): boolean {
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
        return parts.activeTeamId() === myTeamId;
      },
      waitingLabel(): string {
        const pending = parts.pendingDecision();
        if (pending) {
          return `Waiting for ${opponentName} — ${pending.type.replace(/-/g, " ")}…`;
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
          senderName: user.displayName ?? "You",
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
      close(): void {
        parts.close();
        if (activeMatch === match) setActiveOnlineMatch(null);
      },
    };
    return match;
  }
}
