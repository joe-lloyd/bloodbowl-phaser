/**
 * OnlineMatch - boots an online match in the browser, the same way for both
 * coaches.
 *
 * Each browser runs the full engine from the same starting state and the
 * jointly generated seed. The board drives a NetworkedGameService whose
 * every action becomes an action-protocol command. The coach who may act
 * runs it on their own engine at once (no network wait) and the
 * LockstepSession sends just the command and checksums; the other browser
 * runs the same command and its engine produces the same result. A
 * HeadlessGame over the engine runs the game's own flow (weather, kickoff,
 * turns) as each command plays out, so the board only ever renders.
 */

import { IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { IGameService } from "../services/interfaces/IGameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  CommandResponse,
  HeadlessCommand,
  PendingDecision,
} from "../headless/protocol";
import {
  applySnapshotToTeams,
  deserializeGameState,
} from "../headless/serialization";
import { AllEvents, GameEventNames, StepPrompt } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { Team } from "../types/Team";
import { Player } from "../types/Player";
import { LockstepSession } from "./LockstepSession";
import { FirestoreTransport } from "./FirestoreTransport";
import { Transport } from "./transport";
import { NetworkedGameService } from "./NetworkedGameService";
import { decisionOwner } from "./OwnershipGate";
import { possessive } from "../game/managers/TurnManager";
import { PROTOCOL_VERSION } from "./envelope";
import { LobbyDoc, persistMatch } from "../firebase/lobby";
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
  /** May this player act right now (their turn, or their pending decision)? */
  mayAct(): boolean;
  /** Human label for the waiting overlay when mayAct() is false */
  waitingLabel(): string;
  pendingDecision(): PendingDecision | null;
  /** The team that owns the pending decision, if one is open. */
  decidingTeamId(): string | null;
  /** Run one of this coach's commands (e.g. a decision's default answer). */
  run(command: HeadlessCommand): Promise<CommandResponse>;
  sendChat(text: string): void;
  onChatMessage(listener: (message: ChatMessage) => void): () => void;
  chatHistory(): ChatMessage[];
  /** Version-mismatch or transport error the UI should surface */
  onFatalError(listener: (message: string) => void): () => void;
  /** Persist the current authoritative state so the match can resume later
   *  (host only; a no-op for the guest, which holds no engine). */
  saveState(): void;
  /** Freeze all input, and say why, while the turn clock is stopped. */
  setClockPaused(hold: InputHold): void;
  /** Run a post-match choice on the authoritative host engine. */
  runProgressionCommand(command: ProgressionCommand): Promise<CommandResponse>;
  close(): void;
}

/**
 * Why nobody may act for now: the other coach's connection dropped, or a
 * coach is spending a timeout. Null when play runs.
 */
export type InputHold = "opponent-away" | "timeout" | null;

/** The match the current page is playing, if any (UI gating hooks). */
let activeMatch: OnlineMatch | null = null;
export function getActiveOnlineMatch(): OnlineMatch | null {
  return activeMatch;
}
export function setActiveOnlineMatch(match: OnlineMatch | null): void {
  activeMatch = match;
}

/** Sentinel: this `PlayerSelected` event does not change what should be
 *  broadcast as "my current selection" — either it's not my own team's
 *  player (pure local inspection of the opponent) or it repeats the value
 *  already sent. Distinct from `null`, which is itself a real value meaning
 *  "I have nothing selected". */
export const NO_CHANGE = Symbol("selection-no-change");

/**
 * Decide whether a local `PlayerSelected` event should be forwarded to the
 * other coach as this coach's live selection indicator, and with what value.
 * Pure and independently testable: only a coach's own controlled team's
 * selection is ever meaningful to the other side (selecting an opponent's
 * player to inspect it locally is not "my selection" and must never be
 * broadcast), and repeats of the last forwarded value are suppressed.
 */
export function nextSelectionToForward(
  myTeamId: string,
  lastSent: string | null,
  player: Player | null
): string | null | typeof NO_CHANGE {
  if (player && player.teamId !== myTeamId) return NO_CHANGE;
  const playerId = player ? player.id : null;
  if (playerId === lastSent) return NO_CHANGE;
  return playerId;
}

/**
 * Receiver-side guard for an incoming "selection" envelope: the claimed
 * player must actually belong to the team the sender is expected to
 * control. A peer's claims about its own state are never taken at face
 * value — mirrors the trust model `OwnershipGate.checkOwnership` applies to
 * `HeadlessCommand`s, just for this cosmetic-only channel instead of an
 * engine mutation. `null` (a deselection) is always valid.
 */
export function isValidSelectionClaim(
  playerId: string | null,
  senderTeamId: string,
  teams: Team[]
): boolean {
  if (playerId === null) return true;
  const player = teams
    .flatMap((team) => team.players)
    .find((candidate) => candidate.id === playerId);
  return player?.teamId === senderTeamId;
}

const STEP_ROLLS = new Set<string>([
  "dodge",
  "rush",
  "pickup",
  "pass",
  "catch",
  "armour",
]);

/**
 * Receiver-side guard for an incoming "prompt" envelope: the player must be
 * on the sender's team, and the rolls and chance must be ones a prompt can
 * show. `null` (the prompt was answered) is always valid.
 */
export function isValidStepPrompt(
  prompt: StepPrompt | null,
  senderTeamId: string,
  teams: Team[]
): boolean {
  if (prompt === null) return true;
  return (
    isValidSelectionClaim(prompt.playerId, senderTeamId, teams) &&
    Array.isArray(prompt.rolls) &&
    prompt.rolls.length > 0 &&
    prompt.rolls.length <= 3 &&
    prompt.rolls.every(
      (roll) =>
        STEP_ROLLS.has(roll.type) &&
        Number.isInteger(roll.target) &&
        roll.target >= 2 &&
        // A foul's armour is a 2D6 roll; the rest are one D6
        roll.target <= (roll.type === "armour" ? 12 : 6)
    ) &&
    Number.isFinite(prompt.chance) &&
    prompt.chance >= 0 &&
    prompt.chance <= 1
  );
}

interface CreateMatchOptions {
  lobby: LobbyDoc;
  user: AuthUser;
  eventBus: IEventBus;
  /** The seed both coaches made together (see firebase/lobby seedFor). */
  seed: number;
  /** Override for tests (defaults to FirestoreTransport on the lobby code) */
  transport?: Transport;
}

export function createOnlineMatch(options: CreateMatchOptions): OnlineMatch {
  const { lobby, user, eventBus, seed } = options;
  const isHost = user.uid === lobby.hostUid;
  const hostPlayer = lobby.players[lobby.hostUid];
  const guestPlayer = lobby.guestUid ? lobby.players[lobby.guestUid] : null;
  if (!hostPlayer?.team || !guestPlayer?.team) {
    throw new Error("lobby-not-ready");
  }

  // Same construction order on both machines: team1 = host's team
  const team1 = hostPlayer.team;
  const team2 = guestPlayer.team;
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
  // While the turn clock is stopped, all input is frozen for both players.
  let hold: InputHold = null;

  const transport =
    options.transport ?? new FirestoreTransport(lobby.code, user.uid);

  /**
   * Forward local selections of MY OWN controlled team's players to the
   * other coach, deduped against the last value actually sent (decision
   * logic lives in the pure, independently-testable `nextSelectionToForward`
   * above). Selecting an opponent's player (pure local inspection) is never
   * forwarded.
   */
  const subscribeSelectionForwarding = (
    send: (playerId: string | null) => void
  ): (() => void) => {
    let lastSent: string | null = null;
    const handler = ({ player }: { player: Player | null }) => {
      const next = nextSelectionToForward(myTeamId, lastSent, player);
      if (next === NO_CHANGE) return;
      lastSent = next;
      send(next);
    };
    eventBus.on(GameEventNames.PlayerSelected, handler);
    return () => eventBus.off(GameEventNames.PlayerSelected, handler);
  };

  /**
   * Forward this coach's open Dodge, Rush or Pick up prompt, and its
   * answer, so the other coach can see what is being decided. The prompt
   * comes before its command, so the engine has nothing to show yet.
   */
  const subscribePromptForwarding = (
    send: (prompt: StepPrompt | null) => void
  ): (() => void) => {
    let open: string | null = null;
    const onRequest = (
      request: AllEvents[GameEventNames.UI_RequestConfirmation]
    ) => {
      if (!request.step || request.chooserTeamId !== myTeamId) return;
      open = request.actionId;
      send(request.step);
    };
    const onResult = ({ actionId }: { actionId: string }) => {
      if (actionId !== open) return;
      open = null;
      send(null);
    };
    // The pass being aimed: sent as it changes, not on every hover
    let aimed = "null";
    const onAim = (aim: StepPrompt | null) => {
      const key = JSON.stringify(aim);
      if (key === aimed) return;
      aimed = key;
      send(aim);
    };
    eventBus.on(GameEventNames.UI_RequestConfirmation, onRequest);
    eventBus.on(GameEventNames.UI_ConfirmationResult, onResult);
    eventBus.on(GameEventNames.UI_PassAimed, onAim);
    return () => {
      eventBus.off(GameEventNames.UI_RequestConfirmation, onRequest);
      eventBus.off(GameEventNames.UI_ConfirmationResult, onResult);
      eventBus.off(GameEventNames.UI_PassAimed, onAim);
    };
  };

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

  // A resumed match rebuilds the last saved state; a fresh one boots into
  // SETUP/INTRO like local play so the opening sequence runs.
  const saved = lobby.snapshot ? lobby : null;
  let initialState;
  if (saved?.snapshot) {
    applySnapshotToTeams(saved.snapshot, [team1, team2]);
    initialState = deserializeGameState(saved.snapshot);
  } else {
    initialState = GameService.createInitialState(
      team1,
      team2,
      GamePhase.SETUP,
      SubPhase.INTRO
    );
  }

  let session: LockstepSession | null = null;
  const dispatch = (command: HeadlessCommand): Promise<CommandResponse> =>
    runOwn(command);

  let engine: GameService | null = null;
  const container = ServiceContainer.initialize(
    eventBus,
    team1,
    team2,
    initialState,
    seed,
    (inner: GameService): IGameService => {
      engine = inner;
      return new NetworkedGameService(
        inner,
        dispatch,
        () => game.pendingDecision(),
        eventBus
      );
    },
    lobby.settings.progressionEnabled ?? false,
    saved?.resume?.rng,
    saved?.resume?.matchStats,
    saved?.snapshot?.turnManager
  );
  const game: HeadlessGame = new HeadlessGame({
    ctx: {
      eventBus,
      gameService: engine!,
      rng: container.rngService,
      team1,
      team2,
      seed,
      matchStats: container.matchStats,
    },
    kickingTeamId: saved?.snapshot?.turnManager?.driveKickingTeamId ?? null,
  });

  // Save at every change of turn, by the coach whose command changed it:
  // a reload resumes from here, and the other side catches it up.
  let savedTurn = "";
  const saveIfTurnChanged = () => {
    const { phase, turn } = engine!.getState();
    const key = `${phase}:${turn.teamId}:${turn.turnNumber}`;
    if (key === savedTurn) return;
    savedTurn = key;
    saveNow();
  };
  const saveNow = () => {
    void persistMatch(lobby.code, game.snapshot(), {
      rng: container.rngService.captureState(),
      matchStats: container.matchStats.captureState(),
      applied: session!.appliedCommands(),
    }).catch((error) => console.warn("[Online] save failed:", error));
  };

  session = new LockstepSession({
    transport,
    game,
    selfId: user.uid,
    myTeamId,
    peerTeamId: isHost ? team2.id : team1.id,
    hostTeamId: team1.id,
    appliedCommands: saved?.resume?.applied ?? 0,
    onHello: checkHello,
    onChat: (payload) =>
      pushChat({
        text: payload.text,
        senderName: payload.senderName,
        fromSelf: false,
        ts: Date.now(),
      }),
    // The other coach's own-team selection changed — mirror it as a local
    // "remote selection" indicator, never as engine state, and only for a
    // player that really is on their team.
    onSelection: (payload) => {
      const theirTeamId = isHost ? team2.id : team1.id;
      if (
        !isValidSelectionClaim(payload.playerId, theirTeamId, [team1, team2])
      ) {
        console.warn(
          "[Online] rejected selection envelope: player is not on the sender's team"
        );
        return;
      }
      eventBus.emit(GameEventNames.RemoteSelectionChanged, {
        playerId: payload.playerId,
      });
    },
    // The other coach's open step prompt, shown read-only in the dock
    onPrompt: ({ prompt }) => {
      const theirTeamId = isHost ? team2.id : team1.id;
      if (!isValidStepPrompt(prompt, theirTeamId, [team1, team2])) {
        console.warn("[Online] rejected prompt envelope");
        return;
      }
      eventBus.emit(GameEventNames.RemotePromptChanged, prompt);
    },
    // Show where the other coach's player is running, the whole way
    onPeerCommand: (command) => {
      if (command.type !== "move") return;
      const player = engine!.getPlayerById(command.playerId);
      if (!player?.gridPosition) return;
      eventBus.emit(GameEventNames.UI_ShowOtherCoachMove, {
        from: { ...player.gridPosition },
        path: command.path,
        ma: player.stats.MA,
      });
    },
    // The board does not draw the other coach's setup placements by
    // itself; redraw it after each setup command. The other coach's move
    // has resolved, so its drawn path can go once the walk has played.
    onApplied: (command, own) => {
      if (engine!.getPhase() === GamePhase.SETUP)
        eventBus.emit(GameEventNames.UI_SyncBoard);
      if (!own && command.type === "move")
        eventBus.emit(GameEventNames.UI_OtherCoachMoveResolved, {
          playerId: command.playerId,
        });
    },
    // The state was replaced wholesale: redraw where everyone stands, the
    // turn and score, and drop a block dialog the old state had open.
    onResynced: () => {
      eventBus.emit(GameEventNames.PhaseChanged, {
        phase: engine!.getPhase(),
        subPhase: engine!.getSubPhase(),
      });
      eventBus.emit(GameEventNames.GameStateRestored, engine!.getState());
      eventBus.emit(GameEventNames.UI_BlockRollCancelled);
      eventBus.emit(GameEventNames.UI_SyncBoard, { positions: true });
    },
  });
  const runOwn = async (command: HeadlessCommand) => {
    const response = await session!.run(command);
    if (response.ok) saveIfTurnChanged();
    return response;
  };
  void session.sendHello();
  const unsubscribeSelectionForwarding = subscribeSelectionForwarding(
    (playerId) => void session!.sendSelection(playerId)
  );
  const unsubscribePromptForwarding = subscribePromptForwarding(
    (prompt) => void session!.sendPrompt(prompt)
  );

  return finishMatch({
    role: isHost ? "host" : "guest",
    pendingDecision: () => game.pendingDecision(),
    sendChatRaw: (text) => void session!.sendChat(text, myName),
    activeTeamId: () => engine!.getActiveTeamId(),
    phase: () => engine!.getPhase(),
    kicked: () => engine!.getState().kickoffKickResolved != null,
    runProgressionCommand: runOwn,
    run: runOwn,
    saveState: saveNow,
    close: () => {
      unsubscribeSelectionForwarding();
      unsubscribePromptForwarding();
      session!.close();
      transport.close();
    },
  });

  // ===== Shared assembly =====

  function finishMatch(parts: {
    role: "host" | "guest";
    pendingDecision: () => PendingDecision | null;
    sendChatRaw: (text: string) => void;
    activeTeamId: () => string | null;
    phase: () => GamePhase;
    /** This drive's kick has been made; the kick-off is resolving. */
    kicked: () => boolean;
    runProgressionCommand(
      command: ProgressionCommand
    ): Promise<CommandResponse>;
    run(command: HeadlessCommand): Promise<CommandResponse>;
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
      pendingDecision: parts.pendingDecision,
      decidingTeamId(): string | null {
        const pending = parts.pendingDecision();
        if (!pending) return null;
        return (
          decisionOwner(pending, {
            activeTeamId: parts.activeTeamId(),
            pendingDecision: pending,
            teamIdOfPlayer: teamOf,
            hostTeamId: team1.id,
          }) ?? null
        );
      },
      run: parts.run,
      mayAct(): boolean {
        if (hold) return false; // clock stopped: nobody acts
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
        switch (hold) {
          case "opponent-away":
            return `Reconnecting to ${opponentName}…`;
          case "timeout":
            return "Game paused for a timeout";
          case null:
            break;
          default: {
            const exhaustive: never = hold;
            return exhaustive;
          }
        }
        const pending = parts.pendingDecision();
        if (pending) {
          const owner = decisionOwner(pending, {
            activeTeamId: parts.activeTeamId(),
            pendingDecision: pending,
            teamIdOfPlayer: teamOf,
            hostTeamId: team1.id,
          });
          const team = owner ? teamName(owner) : opponentName;
          switch (pending.type) {
            case "block-dice":
              return `${team} is ${pending.choiceStage === "attacker-reroll" ? "choosing a block re-roll" : "picking a block die"}`;
            case "reroll":
              return `${team} is choosing a re-roll`;
            case "push-direction":
              return `${team} is choosing a push square`;
            case "follow-up":
              return `${team} is deciding whether to follow up`;
            case "interception":
              return `${team} is choosing an interceptor`;
            case "reaction":
              return `${team} is deciding whether to use ${pending.skill}`;
            case "apothecary":
              return `${team} is deciding whether to use the apothecary`;
            case "inducement-choice":
              return `${team} is choosing an inducement`;
            case "touchback":
              return `${team} is choosing who takes the ball`;
            case "kickoff-event":
              return `${team} is resolving the kick-off`;
            default: {
              const exhaustive: never = pending;
              return exhaustive;
            }
          }
        }
        if (parts.phase() === GamePhase.KICKOFF && parts.kicked()) {
          return "The kick-off is landing…";
        }
        if (parts.phase() === GamePhase.KICKOFF && !isKickoffActor()) {
          return `Waiting for ${opponentName} to kick off…`;
        }
        if (parts.phase() === GamePhase.SETUP) {
          return `Waiting for ${opponentName} to set up…`;
        }
        const active = parts.activeTeamId();
        return active && active !== myTeamId
          ? `${possessive(opponentName)} turn (${teamName(active)})…`
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
      setClockPaused: (next: InputHold) => {
        hold = next;
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
