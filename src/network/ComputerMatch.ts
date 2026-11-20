import { devVenueFormat } from "../testing/devVenue";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { clearMatchSave } from "../game/persistence/MatchSaveRepository";
import { type IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { scopeEventBus } from "../services/scopedEventBus";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type RestoredMatchSave,
  createMatchSave,
} from "../headless/serialization";
import {
  type CommandResponse,
  type HeadlessCommand,
  type PendingDecision,
} from "../headless/protocol";
import { GameEventNames } from "../types/events";
import { GamePhase, type GameState, SubPhase } from "../types/GameState";
import { type Team } from "../types/Team";
import { type CompetitionContext } from "../competition/types";
import { type Coach } from "../simulation/coach";
import { NetworkedGameService } from "./NetworkedGameService";
import { refusalOnceQuiet } from "./OwnershipGate";
import { createComputerCoach, computerOwnsDecision } from "./computerCoach";
import { type OnlineMatch } from "./OnlineMatch";
import { possessive } from "../game/managers/TurnManager";
import { fixturePaysWinnings } from "../game/rules/winnings";

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
  override beginCoinFlip = (): void => {
    this.engine.beginCoinFlip();
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
  team1: Team;
  team2: Team;

  computerTeamId: string;
  progressionEnabled?: boolean;

  coach?: Coach & { close?(): void };

  pace?: number;

  resume?: Pick<RestoredMatchSave, "save" | "state">;

  autosave?: { difficulty: string };

  competitionContext?: CompetitionContext;
}

function computerMatchState(options: ComputerMatchOptions): GameState {
  const { team1, team2 } = options;
  const initialState =
    options.resume?.state ??
    GameService.createMatchState({ team1: team1, team2: team2, startingPhase: GamePhase.SETUP, startingSubPhase: SubPhase.INTRO, fixture: {
        paysWinnings: fixturePaysWinnings(
          options.competitionContext?.competitionType
        ),
        pregameInducements: true,
      }, ...devVenueFormat() }
    );
  if (!options.resume && options.competitionContext?.knockout)
    initialState.knockout = true;
  return initialState;
}

const progressionOf = (options: ComputerMatchOptions): boolean =>
  options.resume?.save.matchStats.progressionEnabled ??
  options.progressionEnabled ??
  false;


class ComputerSession {
  readonly match: OnlineMatch;
  private readonly options: ComputerMatchOptions;
  private readonly eventBus: ReturnType<typeof scopeEventBus>;
  private readonly container: ServiceContainer;
  private readonly engine: GameService;
  private readonly game: HeadlessGame;
  private readonly myTeamId: string;
  private readonly autosave: MatchAutosave | null;
  private readonly computerCoach: ReturnType<typeof createComputerCoach>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: ComputerMatchOptions) {
    this.options = options;
    this.eventBus = scopeEventBus(options.eventBus);
    this.myTeamId = options.computerTeamId === options.team1.id ? options.team2.id : options.team1.id;
    this.container = this.initializeServices();
    this.engine = this.container.engineGameService;
    this.game = new HeadlessGame({
      ctx: { eventBus: this.eventBus, gameService: this.engine, rng: this.container.rngService,
        team1: options.team1, team2: options.team2, seed: 0, matchStats: this.container.matchStats },
      kickingTeamId: options.resume?.save.drive.kickingTeamId ?? null,
    });
    this.autosave = this.createAutosave();
    if (options.resume) this.autosave?.start();
    this.computerCoach = createComputerCoach({
      game: this.game, eventBus: this.eventBus, computerTeamId: options.computerTeamId,
      mayAct: () => this.owner(options.computerTeamId), run: (command) => this.runAs(options.computerTeamId, command),
      ...(options.coach === undefined ? {} : { coach: options.coach }),
      ...(options.pace === undefined ? {} : { pace: options.pace }),
    });
    if (options.resume) this.eventBus.once(GameEventNames.GameStateRestored, this.computerCoach.start);
    else this.computerCoach.start();
    if (import.meta.env.DEV) window.__computerMatch = { game: this.game, run: (command) => this.runAs(this.myTeamId, command) };
    this.match = this.finishMatch();
  }

  private initializeServices(): ServiceContainer {
    const { team1, team2 } = this.options;
    const rngState = this.options.resume?.save.rng;
    const matchStatsState = this.options.resume?.save.matchStats;
    const turnManagerState = this.options.resume?.save.turnManager;
    return ServiceContainer.initialize({
      eventBus: this.eventBus, team1, team2, initialState: computerMatchState(this.options),
      seed: Math.floor(Math.random() * 2 ** 31), progressionEnabled: progressionOf(this.options),
      gameServiceFactory: (engine) => new ComputerGameService({ engine,
        forward: (command) => this.runAs(this.myTeamId, command), pendingDecision: () => this.game.pendingDecision(), eventBus: this.eventBus }),
      ...(rngState === undefined ? {} : { rngState }),
      ...(matchStatsState === undefined ? {} : { matchStatsState }),
      ...(turnManagerState === undefined ? {} : { turnManagerState }),
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
    return new MatchAutosave(this.eventBus, this.engine, () => this.captureSave(settings.difficulty), { choiceOpen: () => this.game.pendingDecision() !== null });
  }

  private captureSave(difficulty: string) {
    const { team1, team2, computerTeamId } = this.options;
    const kickingTeamId = this.game.driveKickingTeamId() ?? team1.id;
    return createMatchSave({
      state: this.engine.getState(), teams: [team1, team2],
      drive: { kickingTeamId, receivingTeamId: kickingTeamId === team1.id ? team2.id : team1.id },
      rng: this.container.rngService.captureState(), matchStats: this.container.matchStats.captureState(),
      turnManager: this.engine.captureTurnManagerState(),
      computer: { computerTeamId, difficulty },
      ...(this.options.competitionContext === undefined ? {} : { competition: this.options.competitionContext }),
    });
  }

  private owner(teamId: string): boolean {
    return computerOwnsDecision(this.game, teamId, this.myTeamId);
  }

  private waitingLabel(): string {
    if (this.game.pendingDecision()) return `${COMPUTER_NAME} is deciding…`;
    if (this.engine.getPhase() === GamePhase.SETUP) return `${COMPUTER_NAME} is setting up…`;
    if (this.engine.getPhase() === GamePhase.KICKOFF) return `${COMPUTER_NAME} is kicking off…`;
    const active = this.engine.getActiveTeamId();
    const teamName = (active === this.options.team1.id ? this.options.team1 : this.options.team2).name;
    return active === this.options.computerTeamId ? `${possessive(COMPUTER_NAME)} turn (${teamName})…` : "Waiting…";
  }

  private close(): void {
    this.computerCoach.close();
    this.autosave?.dispose();
    if (this.autosave && this.engine.getPhase() === GamePhase.GAME_OVER) clearMatchSave();
    this.eventBus.dispose();
  }

  private finishMatch(): OnlineMatch {
    const { team1, team2, computerTeamId } = this.options;
    return {
      kind: "computer", role: "host", code: "computer", myTeamId: this.myTeamId, opponentName: COMPUTER_NAME,
      coachName: (teamId) => teamId === computerTeamId ? COMPUTER_NAME : "You", teams: { team1, team2 },
      mayAct: () => !this.computerCoach.isThinking() && this.owner(this.myTeamId), waitingLabel: () => this.waitingLabel(),
      pendingDecision: () => this.game.pendingDecision(), decidingTeamId: () => {
        if (!this.game.pendingDecision()) return null;
        return this.owner(computerTeamId) ? computerTeamId : this.myTeamId;
      },
      run: (command) => this.runAs(this.myTeamId, command),
      sendChat: () => undefined, onChatMessage: () => () => undefined, chatHistory: () => [],
      onFatalError: () => () => undefined, saveState: () => undefined, setClockPaused: () => undefined,
      runProgressionCommand: (command) => this.enqueue(() => this.game.execute(command)), close: () => { this.close(); },
    };
  }
}

declare global {
  interface Window {
    __computerMatch?: { game: HeadlessGame; run: (command: HeadlessCommand) => Promise<CommandResponse> };
  }
}

export function createComputerMatch(options: ComputerMatchOptions): OnlineMatch {
  return new ComputerSession(options).match;
}
