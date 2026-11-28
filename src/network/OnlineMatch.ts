import { kickoffTurnOf } from "../game/kickoff/kickRecord";
import { reopenBlockChoice } from "./reopenBlockChoice";
import { assertPregameSaveable } from "../game/inducements/pregame";
import { type IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { scopeEventBus } from "../services/scopedEventBus";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type CommandResponse,
  type HeadlessCommand,
  type PendingDecision,
} from "../headless/protocol";
import {
  applySnapshotToTeams,
  deserializeGameState,
  restoreTeam,
} from "../headless/serialization";
import {
  type AllEvents,
  GameEventNames,
  type StepPrompt,
} from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { type Team } from "../types/Team";
import { type Player } from "../types/Player";
import { LockstepSession } from "./LockstepSession";
import { FirestoreTransport } from "./FirestoreTransport";
import { type Transport } from "./transport";
import { NetworkedGameService } from "./NetworkedGameService";
import { decisionOwner } from "./OwnershipGate";
import { possessive } from "../game/managers/TurnManager";
import { PROTOCOL_VERSION } from "./envelope";
import {
  type LobbyDoc,
  lobbyGameType,
  persistMatch,
} from "../firebase/lobby";
import {
  seededRandom,
  startingFormat,
} from "../game/variants/startingFormat";
import { type AuthUser } from "../firebase/auth";
import { fixturePaysWinnings } from "../game/rules/winnings";
import {
  type ComputerCoachOptions,
  createComputerCoach,
  computerOwnsDecision,
} from "./computerCoach";

export interface ChatMessage {
  text: string;
  senderName: string;
  fromSelf: boolean;
  ts: number;
}

type ProgressionCommand = Extract<
  HeadlessCommand,
  { type: "award-mvp" | "assign-awarded-touchdown" }
>;

export interface OnlineMatch {
  kind: "online" | "computer";
  role: "host" | "guest";
  code: string;
  myTeamId: string;
  opponentName: string;

  coachName(teamId: string): string | undefined;
  teams: { team1: Team; team2: Team };

  mayAct(): boolean;

  waitingLabel(): string;
  pendingDecision(): PendingDecision | null;

  decidingTeamId(): string | null;

  run(command: HeadlessCommand): Promise<CommandResponse>;
  sendChat(text: string): void;
  onChatMessage(listener: (message: ChatMessage) => void): () => void;
  chatHistory(): ChatMessage[];

  onFatalError(listener: (message: string) => void): () => void;

  saveState(): void;

  setClockPaused(hold: InputHold): void;

  runProgressionCommand(command: ProgressionCommand): Promise<CommandResponse>;
  close(): void;
}

type InputHold = "opponent-away" | "timeout" | null;

const activeMatch: { current: OnlineMatch | null } = { current: null };
export function getActiveOnlineMatch(): OnlineMatch | null {
  return activeMatch.current;
}
export function setActiveOnlineMatch(match: OnlineMatch | null): void {
  activeMatch.current = match;
}

export const NO_CHANGE = Symbol("selection-no-change");

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
  "secureBall",
  "pass",
  "catch",
  "armour",
]);

function isValidStepPrompt(
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
        Number.isSafeInteger(roll.target) &&
        roll.target >= 2 &&
        roll.target <= (roll.type === "armour" ? 12 : 6)
    )
  );
}

interface CreateMatchOptions {
  lobby: LobbyDoc;
  user: AuthUser;
  eventBus: IEventBus;

  seed: number;

  transport?: Transport;

  computer?: Pick<ComputerCoachOptions, "coach" | "pace">;
}

const DECISION_ACTIVITIES: Record<Exclude<PendingDecision["type"], "block-dice" | "reaction">, string> = {
  reroll: "choosing a re-roll", "push-direction": "choosing a push square",
  "follow-up": "deciding whether to follow up", interception: "choosing an interceptor",
  "bite-target": "choosing who to bite", apothecary: "deciding whether to use the apothecary",
  "inducement-choice": "choosing an inducement", "foul-assists": "choosing the foul's assists",
  touchback: "choosing who takes the ball", "kickoff-event": "resolving the kick-off",
  "reserve-move": "bringing on reserves",
  "cross-assist": "deciding whether to lend an assist",
};

const SQUIG_DECISION_ACTIVITIES = {
  "squig-block": "choosing an opponent to Block",
  "squig-knock-down": "choosing a team-mate to knock down",
};

function decisionActivity(pending: PendingDecision): string {
  if (pending.type === "block-dice") return pending.choiceStage === "attacker-reroll" ? "choosing a block re-roll" : "picking a block die";
  if (pending.type === "reaction") return `deciding whether to use ${pending.skill}`;
  if (pending.type === "bite-target" && pending.purpose) {
    return SQUIG_DECISION_ACTIVITIES[pending.purpose];
  }
  return DECISION_ACTIVITIES[pending.type];
}

function lobbySides(lobby: LobbyDoc, user: AuthUser) {
  const isHost = user.uid === lobby.hostUid;
  const hostPlayer = lobby.players[lobby.hostUid];
  const guestPlayer = lobby.guestUid ? lobby.players[lobby.guestUid] : null;
  if (!hostPlayer?.team || !guestPlayer?.team) {
    throw new Error("lobby-not-ready");
  }
  const team1 = hostPlayer.team;
  const team2 = guestPlayer.team;
  return {
    isHost,
    team1,
    team2,
    myTeamId: isHost ? team1.id : team2.id,
    opponentName: isHost ? guestPlayer.displayName : hostPlayer.displayName,

    coachNames: {
      [team1.id]: hostPlayer.displayName,
      [team2.id]: guestPlayer.displayName,
    } satisfies Record<string, string>,
    myName: isHost ? hostPlayer.displayName : guestPlayer.displayName,
  };
}

function restoreLobbyTeams(saved: LobbyDoc, teams: Team[]): void {
    for (const team of teams) {
      const roster = saved.resume?.teams?.find(
        (record) => record.id === team.id
      );
      if (roster) restoreTeam(team, roster);
    }
 }

function startingState(
  lobby: LobbyDoc,
  [team1, team2]: [Team, Team],
  seed: number
) {
  const saved = lobby.snapshot ? lobby : null;
  if (saved?.snapshot) {
    restoreLobbyTeams(saved, [team1, team2]);
    applySnapshotToTeams(saved.snapshot, [team1, team2]);
    const initialState = deserializeGameState(saved.snapshot);
    if (lobby.competitionContext) initialState.competition = true;
    return { saved, initialState };
  }
  const initialState = GameService.createMatchState({ teams: [team1, team2], startingPhase: GamePhase.SETUP, startingSubPhase: SubPhase.INTRO, fixture: {
      paysWinnings: fixturePaysWinnings(lobby.competitionContext),
      competition: !!lobby.competitionContext,
      pregameInducements: true,
    }, ...startingFormat(
        {
          gameType: lobbyGameType(lobby),
          ...(!lobby.competitionContext && { venue: lobby.settings.venue }),
        },
        seededRandom(seed)
      ) }
  );
  if (lobby.competitionContext?.knockout) initialState.knockout = true;
  return { saved, initialState };
}

function resumeParts(saved: ReturnType<typeof startingState>["saved"]) {
  const resume = saved?.resume;
  const turnManager = saved?.snapshot?.turnManager;
  return {
    rng: resume?.rng,
    matchStats: resume?.matchStats,
    turnManager,
    kickingTeamId: turnManager?.driveKickingTeamId ?? null,
    commands: { applied: 0, replay: [], ...resume },
  };
}


function subscribeSelectionForwarding(
    eventBus: IEventBus,
    myTeamId: string,
    send: (playerId: string | null) => void
  ): (() => void) {
    let lastSent: string | null = null;
    const handler = ({ player }: { player: Player | null }) => {
      const next = nextSelectionToForward(myTeamId, lastSent, player);
      if (next === NO_CHANGE) return;
      lastSent = next;
      send(next);
    };
    eventBus.on(GameEventNames.PlayerSelected, handler);
    return () => {
      eventBus.off(GameEventNames.PlayerSelected, handler);
    };
  }

function subscribePromptForwarding(
    eventBus: IEventBus,
    myTeamId: string,
    send: (prompt: StepPrompt | null) => void
  ): (() => void) {
    let open: string | null = null;
    const onRequest = (
      request: AllEvents[typeof GameEventNames.UI_RequestConfirmation]
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
  }

class OnlineSession {
  readonly match: OnlineMatch;
  private readonly options: CreateMatchOptions;
  private readonly eventBus: ReturnType<typeof scopeEventBus>;
  private readonly sides: ReturnType<typeof lobbySides>;
  private readonly transport: Transport;
  private readonly container: ServiceContainer;
  private readonly engine: GameService;
  private readonly game: HeadlessGame;
  private readonly session: LockstepSession;
  private readonly subscriptions: (() => void)[];
  private computerCoach: ReturnType<typeof createComputerCoach> | null = null;
  private hold: InputHold = null;
  private savedTurn = "";
  private readonly chatLog: ChatMessage[] = [];
  private readonly chatListeners = new Set<(message: ChatMessage) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();

  constructor(options: CreateMatchOptions) {
    this.options = options;
    this.eventBus = scopeEventBus(options.eventBus);
    this.sides = lobbySides(options.lobby, options.user);
    this.transport = options.transport ?? new FirestoreTransport(options.lobby.code, options.user.uid);
    const { team1, team2 } = this.sides;
    const { saved, initialState } = startingState(
      options.lobby,
      [team1, team2],
      options.seed
    );
    const resume = resumeParts(saved);
    this.container = this.initializeServices(initialState, resume);
    this.engine = this.container.engineGameService;
    this.game = new HeadlessGame({
      ctx: { eventBus: this.eventBus, gameService: this.engine, rng: this.container.rngService,
        teams: [team1, team2], seed: options.seed, matchStats: this.container.matchStats },
      kickingTeamId: resume.kickingTeamId,
    });
    this.session = this.createSession(resume.commands.applied);
    void this.session.replaySaved(resume.commands.replay);
    void this.session.sendHello();
    this.eventBus.on(GameEventNames.GameStateRestored, this.showOpenChoice);
    this.subscriptions = [
      subscribeSelectionForwarding(this.eventBus, this.sides.myTeamId, (playerId) => void this.session.sendSelection(playerId)),
      subscribePromptForwarding(this.eventBus, this.sides.myTeamId, (prompt) => void this.session.sendPrompt(prompt)),
    ];
    this.match = this.finishMatch();
    this.startComputer(saved !== null);
  }

  private initializeServices(initialState: ReturnType<typeof startingState>["initialState"], resume: ReturnType<typeof resumeParts>) {
    const { team1, team2 } = this.sides;
    return ServiceContainer.initialize({
      eventBus: this.eventBus, teams: [team1, team2], initialState, seed: this.options.seed,
      gameServiceFactory: (inner) => new NetworkedGameService({ inner,
        dispatch: (command) => this.runOwn(command), pendingDecision: () => this.game.pendingDecision(), eventBus: this.eventBus }),
      progressionEnabled: this.options.lobby.settings.progressionEnabled,
      ...(resume.rng !== undefined && { rngState: resume.rng }),
      ...(resume.matchStats !== undefined && { matchStatsState: resume.matchStats }),
      ...(resume.turnManager !== undefined && { turnManagerState: resume.turnManager }),
    });
  }

  private pushChat(message: ChatMessage): void {
    this.chatLog.push(message);
    this.chatListeners.forEach((listener) => { listener(message); });
  }

  private checkHello(payload: { protocolVersion: number }): void {
    if (payload.protocolVersion === PROTOCOL_VERSION) return;
    const message = `Incompatible game versions (you: ${String(PROTOCOL_VERSION)}, opponent: ${String(payload.protocolVersion)}). Both players must update.`;
    this.errorListeners.forEach((listener) => { listener(message); });
  }

  private saveNow(): void {
    if (this.engine.getState().pregameInducements?.resolving) return;
    const { snapshot, teams, rng, matchStats, applied, replay } = this.session.captureState();
    void persistMatch(this.options.lobby.code, snapshot, { teams: structuredClone(teams), rng, matchStats, applied, replay: structuredClone(replay) }).catch((error: unknown) => { console.warn("[Online] save failed:", error); });
  }

  private saveIfTurnChanged(): void {
    const { phase, turn } = this.engine.getState();
    const key = `${phase}:${turn.teamId}:${String(turn.turnNumber)}`;
    if (key === this.savedTurn) return;
    if (this.game.isAtRest()) this.savedTurn = key;
    this.saveNow();
  }

  private async runOwn(command: HeadlessCommand): Promise<CommandResponse> {
    const response = await this.session.run(command);
    if (!response.ok) return response;
    const state = this.engine.getState();
    if (state.pregameInducements && state.turn.turnNumber === 0) {
      if (!this.game.isSuspended() && !this.game.pendingDecision()) this.saveNow();
    } else this.saveIfTurnChanged();
    return response;
  }

  private createSession(appliedCommands: number): LockstepSession {
    return new LockstepSession({
      transport: this.transport, game: this.game, selfId: this.options.user.uid,
      myTeamId: this.sides.myTeamId, peerTeamId: this.sides.isHost ? this.sides.team2.id : this.sides.team1.id,
      hostTeamId: this.sides.team1.id, appliedCommands,
      onHello: (payload) => { this.checkHello(payload); },
      onChat: (payload) => { this.pushChat({ ...payload, fromSelf: false, ts: Date.now() }); },
      onSelection: (payload) => { this.receiveSelection(payload.playerId); },
      onPrompt: ({ prompt }) => { this.receivePrompt(prompt); },
      onPeerCommand: (command) => { this.showPeerCommand(command); },
      onApplied: (command, own) => { this.onApplied(command, own); },
      onResynced: () => { this.onResynced(); },
    });
  }

  private receiveSelection(playerId: string | null): void {
    const { isHost, team1, team2 } = this.sides;
    if (!isValidSelectionClaim(playerId, isHost ? team2.id : team1.id, [team1, team2])) {
      console.warn("[Online] rejected selection envelope: player is not on the sender's team");
      return;
    }
    this.eventBus.emit(GameEventNames.RemoteSelectionChanged, { playerId });
  }

  private receivePrompt(prompt: StepPrompt | null): void {
    const { isHost, team1, team2 } = this.sides;
    if (!isValidStepPrompt(prompt, isHost ? team2.id : team1.id, [team1, team2])) {
      console.warn("[Online] rejected prompt envelope");
      return;
    }
    this.eventBus.emit(GameEventNames.RemotePromptChanged, prompt);
  }

  private showPeerCommand(command: HeadlessCommand): void {
    if (command.type !== "move") return;
    const player = this.engine.getPlayerById(command.playerId);
    if (player?.gridPosition) this.eventBus.emit(GameEventNames.UI_ShowOtherCoachMove, {
      from: { ...player.gridPosition }, path: command.path, ma: player.stats.MA,
    });
  }

  private onApplied(command: HeadlessCommand, own: boolean): void {
    if (this.engine.getPhase() === GamePhase.SETUP) this.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
    if (!own && command.type === "move") this.eventBus.emit(GameEventNames.UI_OtherCoachMoveResolved, { playerId: command.playerId });
  }

  private onResynced(): void {
    const subPhase = this.engine.getSubPhase();
    this.eventBus.emit(GameEventNames.PhaseChanged, { phase: this.engine.getPhase(), ...(subPhase !== undefined && { subPhase }) });
    this.eventBus.emit(GameEventNames.GameStateRestored, this.engine.getState());
    if (this.game.pendingDecision()?.type !== "block-dice") this.eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
    this.eventBus.emit(GameEventNames.UI_SyncBoard, { positions: true });
  }

  private readonly showOpenChoice = (): void => {
    const request = this.engine.getDecisionService().pending();
    if (request) this.eventBus.emit(GameEventNames.DecisionRequested, request);
    else reopenBlockChoice(this.game.pendingDecision(), this.engine, this.eventBus);
  };

  private startComputer(resuming: boolean): void {
    if (!this.options.computer) return;
    const { myTeamId, team1 } = this.sides;
    this.computerCoach = createComputerCoach({
      ...this.options.computer, game: this.game, eventBus: this.eventBus, computerTeamId: myTeamId,
      mayAct: () => this.match.mayAct() && computerOwnsDecision(this.game, myTeamId, team1.id),
      run: (command) => {
        if (command.type === "declare-action") void this.session.sendSelection(command.playerId);
        else if (command.type === "end-activation" || command.type === "end-turn") void this.session.sendSelection(null);
        return this.runOwn(command);
      },
    });
    if (resuming) this.eventBus.once(GameEventNames.GameStateRestored, this.computerCoach.start);
    else this.computerCoach.start();
  }

  private teamOf(playerId: string): string | undefined {
    return [...this.sides.team1.players, ...this.sides.team2.players].find((player) => player.id === playerId)?.teamId;
  }

  private decidingTeamId(): string | null {
    const pending = this.game.pendingDecision();
    if (!pending) return null;
    return decisionOwner(pending, {
      activeTeamId: this.engine.getActiveTeamId(), pendingDecision: pending,
      teamIdOfPlayer: (id) => this.teamOf(id), hostTeamId: this.sides.team1.id,
    }) ?? null;
  }

  private isKickoffActor(): boolean {
    const active = this.engine.getActiveTeamId();
    return this.engine.getPhase() === GamePhase.KICKOFF && !kickoffTurnOf(this.engine.getState()) && active !== null && active !== this.sides.myTeamId;
  }

  private mayAct(): boolean {
    if (this.hold) return false;
    if (this.game.pendingDecision()) return this.decidingTeamId() === this.sides.myTeamId;
    const pregame = this.engine.getState().pregameInducements;
    if (pregame && !pregame.complete) return pregame.offer?.confirmed[this.sides.myTeamId] !== true;
    if (this.engine.getPhase() === GamePhase.KICKOFF && !kickoffTurnOf(this.engine.getState())) return this.isKickoffActor();
    return this.engine.getActiveTeamId() === this.sides.myTeamId;
  }

  private waitingLabel(): string {
    if (this.hold === "opponent-away") return `Reconnecting to ${this.sides.opponentName}…`;
    if (this.hold === "timeout") return "Game paused for a timeout";
    const pending = this.game.pendingDecision();
    if (pending) {
      const owner = this.decidingTeamId();
      const team = owner ? this.teamName(owner) : this.sides.opponentName;
      return `${team} is ${decisionActivity(pending)}`;
    }
    return this.phaseWaitingLabel();
  }

  private teamName(teamId: string): string {
    return (teamId === this.sides.team1.id ? this.sides.team1 : this.sides.team2).name;
  }

  private phaseWaitingLabel(): string {
    const { teamId } = this.engine.getState().turn;
    const kickoff = kickoffTurnOf(this.engine.getState());
    if (kickoff) return `${this.teamName(teamId)} is playing ${kickoff.event}…`;
    if (this.engine.getPhase() === GamePhase.KICKOFF) {
      if (this.engine.getState().kick) return "The kick-off is landing…";
      if (!this.isKickoffActor()) return `Waiting for ${this.sides.opponentName} to kick off…`;
    }
    if (this.engine.getPhase() === GamePhase.SETUP) return `Waiting for ${this.sides.opponentName} to set up…`;
    const active = this.engine.getActiveTeamId();
    return active && active !== this.sides.myTeamId
      ? `${possessive(this.sides.opponentName)} turn (${this.teamName(active)})…` : "Waiting…";
  }

  private sendChat(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    void this.session.sendChat(trimmed, this.sides.myName);
    this.pushChat({ text: trimmed, senderName: this.sides.myName, fromSelf: true, ts: Date.now() });
  }

  private close(): void {
    this.computerCoach?.close();
    for (const unsubscribe of this.subscriptions) { unsubscribe(); }
    this.eventBus.detach();
    this.session.close();
    this.transport.close();
    void this.session.whenIdle().finally(() => { this.eventBus.dispose(); });
    if (activeMatch.current === this.match) setActiveOnlineMatch(null);
  }

  private finishMatch(): OnlineMatch {
    const { isHost, myTeamId, opponentName, team1, team2, coachNames } = this.sides;
    return {
      kind: "online", role: isHost ? "host" : "guest", code: this.options.lobby.code,
      myTeamId, opponentName, coachName: (id) => coachNames[id], teams: { team1, team2 },
      pendingDecision: () => this.game.pendingDecision(), decidingTeamId: () => this.decidingTeamId(),
      run: (command) => this.runOwn(command), mayAct: () => this.mayAct(), waitingLabel: () => this.waitingLabel(),
      sendChat: (text) => { this.sendChat(text); }, chatHistory: () => [...this.chatLog],
      onChatMessage: (listener) => { this.chatListeners.add(listener); return () => this.chatListeners.delete(listener); },
      onFatalError: (listener) => { this.errorListeners.add(listener); return () => this.errorListeners.delete(listener); },
      saveState: () => { assertPregameSaveable(this.engine.getState()); this.saveNow(); },
      setClockPaused: (hold) => { this.hold = hold; },
      runProgressionCommand: (command) => this.runOwn(command), close: () => { this.close(); },
    };
  }
}

export function createOnlineMatch(options: CreateMatchOptions): OnlineMatch {
  return new OnlineSession(options).match;
}
