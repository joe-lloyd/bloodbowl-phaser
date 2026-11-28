import { kickoffTurnOf } from "../game/kickoff/kickRecord";
import { devVenueFormat } from "../testing/devVenue";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import {
  clearMatchSave,
  type MatchSaveRepository,
} from "../game/persistence/MatchSaveRepository";
import { type IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { scopeEventBus } from "../services/scopedEventBus";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type ComputerMatchSave,
  type RestoredMatchSave,
} from "../headless/serialization";
import {
  type CommandResponse,
  type HeadlessCommand,
  type PendingDecision,
} from "../headless/protocol";
import { GameEventNames } from "../types/events";
import { GamePhase, type GameState, SubPhase } from "../types/GameState";
import { type CompetitionContext } from "../competition/types";
import { type Coach } from "../simulation/coach";
import { NetworkedGameService } from "./NetworkedGameService";
import { refusalOnceQuiet } from "./OwnershipGate";
import { createComputerCoach, computerOwnsDecision } from "./computerCoach";
import { type OnlineMatch } from "./OnlineMatch";
import { possessive } from "../game/managers/TurnManager";
import { fixturePaysWinnings } from "../game/rules/winnings";
import type { GameType } from "../game/variants/gameTypes";
import type { Venue } from "../game/variants/pitchLayouts";
import { startingFormat } from "../game/variants/startingFormat";
import { DEATHBOWL_FORMAT } from "../game/variants/activeMatch";
import { type SeatedTeams } from "../game/seating";

class ComputerGameService extends NetworkedGameService {
  private readonly engine: GameService;
  private readonly forward: (
    command: HeadlessCommand
  ) => Promise<CommandResponse>;
  constructor(options: { engine: GameService; forward: (command: HeadlessCommand) => Promise<CommandResponse>; pendingDecision: () => PendingDecision | null; eventBus: IEventBus }) {
    super({ inner: options.engine, dispatch: options.forward, pendingDecision: options.pendingDecision, eventBus: options.eventBus });
    this.engine = options.engine;
    this.forward = options.forward;
  }

  override readyForWeather(teamId: string): boolean {
    return this.engine.readyForWeather(teamId);
  }
  override beginMatch = (): void => {
    this.engine.beginMatch();
  };
  override tossCoin(): string {
    return this.engine.tossCoin();
  }
  override startSetup(startingTeamId?: string): void {
    if (startingTeamId)
      void this.forward({ type: "start-setup", kickingTeamId: startingTeamId });
  }
}

const COMPUTER_NAME = "Computer";

export interface ComputerMatchOptions {
  eventBus: IEventBus;
  teams: SeatedTeams;

  humanTeamId: string;
  progressionEnabled?: boolean;

  coach?: Coach & { close?(): void };

  pace?: number;

  resume?: Pick<RestoredMatchSave, "save" | "state">;

  autosave?: { difficulty: string; slot?: MatchSaveRepository };

  competitionContext?: CompetitionContext;

  gameType?: GameType;

  venue?: Venue;
}

function pairFormat(options: ComputerMatchOptions) {
  return {
    ...devVenueFormat(),
    ...startingFormat(
      options.competitionContext
        ? { gameType: options.competitionContext.gameType }
        : { gameType: options.gameType, venue: options.venue }
    ),
  };
}

function computerMatchState(options: ComputerMatchOptions): GameState {
  const { teams } = options;
  const fourSeats = teams.length === 4;
  const initialState =
    options.resume?.state ??
    GameService.createMatchState({ teams, startingPhase: GamePhase.SETUP, startingSubPhase: SubPhase.INTRO, fixture: {
        paysWinnings: fixturePaysWinnings(options.competitionContext),
        competition: !!options.competitionContext,
        pregameInducements: !fourSeats,
      }, ...(fourSeats ? { format: DEATHBOWL_FORMAT } : pairFormat(options)) }
    );
  if (options.competitionContext) initialState.competition = true;
  if (!options.resume && options.competitionContext?.knockout)
    initialState.knockout = true;
  return initialState;
}

const progressionOf = (options: ComputerMatchOptions): boolean =>
  options.resume?.save.matchStats.progressionEnabled ??
  options.progressionEnabled ??
  false;


const noop = () => undefined;

const seatPlanOf = (
  teams: SeatedTeams,
  humanTeamId: string,
  difficulty: string
): ComputerMatchSave => {
  if (teams.length === 4) return { humanTeamId, difficulty };
  const computer = teams.find(({ id }) => id !== humanTeamId) ?? teams[1];
  return { computerTeamId: computer.id, difficulty };
};

class ComputerSession {
  readonly match: OnlineMatch;
  private readonly options: ComputerMatchOptions;
  private readonly eventBus: ReturnType<typeof scopeEventBus>;
  private readonly container: ServiceContainer;
  private readonly engine: GameService;
  private readonly game: HeadlessGame;
  private readonly myTeamId: string;
  private readonly autosave: MatchAutosave | null;
  private readonly computerCoaches: ReadonlyMap<string, ReturnType<typeof createComputerCoach>>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: ComputerMatchOptions) {
    this.options = options;
    this.eventBus = scopeEventBus(options.eventBus);
    this.myTeamId = options.humanTeamId;
    this.container = this.initializeServices();
    this.engine = this.container.engineGameService;
    this.game = new HeadlessGame({
      ctx: { eventBus: this.eventBus, gameService: this.engine, rng: this.container.rngService,
        teams: options.teams, seed: 0, matchStats: this.container.matchStats },
      kickingTeamId: options.resume?.save.drive.kickingTeamId ?? null,
    });
    const fourSeats = options.teams.length === 4;
    if (fourSeats && !options.resume) this.engine.beginMatch();
    this.autosave = this.createAutosave();
    if (options.resume || fourSeats) this.autosave?.start();
    this.computerCoaches = new Map(this.computerTeamIds().map((teamId) => [teamId, this.coachFor(teamId)]));
    this.startCoaches();
    if (import.meta.env.DEV) globalThis.__computerMatch = { game: this.game, run: (command) => this.runAs(this.myTeamId, command) };
    this.match = this.finishMatch();
  }

  private startCoaches(): void {
    for (const coach of this.computerCoaches.values()) {
      if (this.options.resume) this.eventBus.once(GameEventNames.GameStateRestored, coach.start);
      else coach.start();
    }
  }

  private computerTeamIds(): string[] {
    return this.options.teams.flatMap(({ id }) => (id === this.myTeamId ? [] : [id]));
  }

  private coachFor(teamId: string) {
    const { coach, pace } = this.options;
    return createComputerCoach({
      game: this.game, eventBus: this.eventBus, computerTeamId: teamId,
      mayAct: () => this.owner(teamId), run: (command) => this.runAs(teamId, command),
      ...(coach !== undefined && { coach }),
      ...(pace !== undefined && { pace }),
    });
  }

  private initializeServices(): ServiceContainer {
    const { teams } = this.options;
    const rngState = this.options.resume?.save.rng;
    const matchStatsState = this.options.resume?.save.matchStats;
    const turnManagerState = this.options.resume?.save.turnManager;
    return ServiceContainer.initialize({
      eventBus: this.eventBus, teams, initialState: computerMatchState(this.options),
      seed: Math.floor(Math.random() * 2 ** 31), progressionEnabled: progressionOf(this.options),
      gameServiceFactory: (engine) => new ComputerGameService({ engine,
        forward: (command) => this.runAs(this.myTeamId, command), pendingDecision: () => this.game.pendingDecision(), eventBus: this.eventBus }),
      ...(rngState !== undefined && { rngState }),
      ...(matchStatsState !== undefined && { matchStatsState }),
      ...(turnManagerState !== undefined && { turnManagerState }),
    });
  }

  private enqueue(work: () => Promise<CommandResponse>): Promise<CommandResponse> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next.then((response) => {
      if (this.engine.getPhase() === GamePhase.SETUP) this.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
      return response;
    });
  }

  private runAs(senderTeamId: string, command: HeadlessCommand): Promise<CommandResponse> {
    return this.enqueue(async () => {
      const refusal = await refusalOnceQuiet({ game: this.game, command, senderTeamId, hostTeamId: this.myTeamId });
      if (refusal) return refusal;
      const response = await this.game.execute(command);
      if (["ready-weather", "select-inducement", "remove-inducement", "confirm-inducements", "start-setup", "coin-flip"].includes(command.type) && response.ok) this.autosave?.start();
      return response;
    });
  }

  private createAutosave(): MatchAutosave | null {
    const settings = this.options.autosave;
    if (!settings) return null;
    return new MatchAutosave(this.eventBus, this.engine, () => this.captureSave(settings.difficulty), {
      choiceOpen: () => this.game.pendingDecision() !== null,
      ...(settings.slot !== undefined && { repository: settings.slot }),
    });
  }

  private captureSave(difficulty: string) {
    const { teams, competitionContext } = this.options;
    return {
      ...this.game.matchSave(),
      computer: seatPlanOf(teams, this.myTeamId, difficulty),
      ...(competitionContext !== undefined && { competition: competitionContext }),
    };
  }

  private computerOwner(): string | undefined {
    return this.computerTeamIds().find((teamId) => this.owner(teamId));
  }

  private computerThinking(): boolean {
    return [...this.computerCoaches.values()].some((coach) => coach.isThinking());
  }

  private owner(teamId: string): boolean {
    return computerOwnsDecision(this.game, teamId, this.myTeamId);
  }

  private waitingLabel(): string {
    if (this.game.pendingDecision()) return `${COMPUTER_NAME} is deciding…`;
    if (this.engine.getPhase() === GamePhase.SETUP) return `${COMPUTER_NAME} is setting up…`;
    const { teamId } = this.engine.getState().turn;
    const kickoff = kickoffTurnOf(this.engine.getState());
    if (kickoff && this.computerCoaches.has(teamId)) return `${COMPUTER_NAME} is playing ${kickoff.event}…`;
    if (this.engine.getPhase() === GamePhase.KICKOFF) return `${COMPUTER_NAME} is kicking off…`;
    const active = this.engine.getActiveTeamId();
    const team = this.options.teams.find(({ id }) => id === active);
    return team && this.computerCoaches.has(team.id) ? `${possessive(COMPUTER_NAME)} turn (${team.name})…` : "Waiting…";
  }

  private close(): void {
    for (const coach of this.computerCoaches.values()) coach.close();
    this.autosave?.dispose();
    const slot = this.options.autosave?.slot;
    if (this.autosave && this.engine.getPhase() === GamePhase.GAME_OVER) {
      if (slot) slot.clear();
      else clearMatchSave();
    }
    this.eventBus.dispose();
  }

  private finishMatch(): OnlineMatch {
    const { teams } = this.options;
    return {
      kind: "computer", role: "host", code: "computer", myTeamId: this.myTeamId, opponentName: COMPUTER_NAME,
      coachName: (teamId) => this.computerCoaches.has(teamId) ? COMPUTER_NAME : "You", teams,
      mayAct: () => !this.computerThinking() && this.owner(this.myTeamId), waitingLabel: () => this.waitingLabel(),
      pendingDecision: () => this.game.pendingDecision(), decidingTeamId: () => {
        if (!this.game.pendingDecision()) return null;
        return this.computerOwner() ?? this.myTeamId;
      },
      run: (command) => this.runAs(this.myTeamId, command),
      sendChat: () => undefined, onChatMessage: () => noop, chatHistory: () => [],
      onFatalError: () => noop,
      saveState: () => undefined, setClockPaused: () => undefined,
      runProgressionCommand: (command) => this.enqueue(() => this.game.execute(command)), close: () => { this.close(); },
    };
  }
}

declare global {
  var __computerMatch: { game: HeadlessGame; run: (command: HeadlessCommand) => Promise<CommandResponse> } | undefined;
}

export function createComputerMatch(options: ComputerMatchOptions): OnlineMatch {
  return new ComputerSession(options).match;
}
