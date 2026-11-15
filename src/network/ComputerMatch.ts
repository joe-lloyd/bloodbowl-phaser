/**
 * ComputerMatch - a local match against the computer coach.
 *
 * It is an online match whose other coach lives in this page. The board
 * drives the engine through the same NetworkedGameService online play
 * uses, so every human action becomes a protocol command that a
 * HeadlessGame runs on the one local engine. The computer coach reads the
 * same engine, picks its commands with the simulation's planner, and runs
 * them through that HeadlessGame too, paced so a person can follow them.
 * The HUD already hides controls from the coach who may not act, so the
 * human cannot move the computer's players or answer its decisions.
 */

import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { clearMatchSave } from "../game/persistence/MatchSaveRepository";
import { IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { scopeEventBus } from "../services/scopedEventBus";
import { HeadlessGame } from "../headless/HeadlessGame";
import { RestoredMatchSave, createMatchSave } from "../headless/serialization";
import {
  CommandResponse,
  HeadlessCommand,
  PendingDecision,
} from "../headless/protocol";
import { GameEventNames } from "../types/events";
import { GamePhase, GameState, SubPhase } from "../types/GameState";
import { Team } from "../types/Team";
import { CompetitionContext } from "../competition/types";
import { Coach } from "../simulation/coach";
import { NetworkedGameService } from "./NetworkedGameService";
import { refusalOnceQuiet } from "./OwnershipGate";
import { createComputerCoach, computerOwnsDecision } from "./computerCoach";
import { OnlineMatch } from "./OnlineMatch";
import { possessive } from "../game/managers/TurnManager";
import { fixturePaysWinnings } from "../game/rules/winnings";

/** The board's engine bridge, plus a coin toss: there is no lobby to toss over. */
class ComputerGameService extends NetworkedGameService {
  constructor(
    private readonly engine: GameService,
    private readonly forward: (
      command: HeadlessCommand
    ) => Promise<CommandResponse>,
    pendingDecision: () => PendingDecision | null,
    eventBus: IEventBus
  ) {
    super(engine, forward, pendingDecision, eventBus);
  }
  // The board's own intro runs the opening, as in a local match: weather,
  // then the toss in the coin-flip overlay.
  override rollInitialWeather(): void {
    this.engine.rollInitialWeather();
  }
  override beginCoinFlip(): void {
    this.engine.beginCoinFlip();
  }
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
  /** The team the computer coaches; the human has the other. */
  computerTeamId: string;
  progressionEnabled?: boolean;
  /** Who plays the computer's side; Standard difficulty if unset. */
  coach?: Coach & { close?(): void };
  /** Scale every pause; 0 plays at full speed (tests). */
  pace?: number;
  /** The save this match picks up; team1 and team2 are its restored teams. */
  resume?: Pick<RestoredMatchSave, "save" | "state">;
  /** What a save holds beyond the engine. Unset, the match is not saved. */
  autosave?: { difficulty: string };
  /** The league or cup fixture this match plays. */
  competitionContext?: CompetitionContext;
}

/**
 * A resumed match's state, or a fresh one. A league fixture takes on
 * Journeymen at kick-off and rolls the Fan Factors for its winnings at
 * full time; a drawn cup tie goes to Extra Time, then Penalties.
 */
function computerMatchState(options: ComputerMatchOptions): GameState {
  const { team1, team2 } = options;
  const initialState =
    options.resume?.state ??
    GameService.createMatchState(
      team1,
      team2,
      GamePhase.SETUP,
      SubPhase.INTRO,
      {
        paysWinnings: fixturePaysWinnings(
          options.competitionContext?.competitionType
        ),
      }
    );
  if (!options.resume && options.competitionContext?.knockout)
    initialState.knockout = true;
  return initialState;
}

const progressionOf = (options: ComputerMatchOptions): boolean =>
  options.resume?.save.matchStats.progressionEnabled ??
  options.progressionEnabled ??
  false;

export function createComputerMatch(
  options: ComputerMatchOptions
): OnlineMatch {
  const { eventBus: pageBus, team1, team2, computerTeamId } = options;
  // Everything this match does on the page's bus ends when it closes.
  const eventBus = scopeEventBus(pageBus);
  const myTeamId = computerTeamId === team1.id ? team2.id : team1.id;
  const teamName = (id: string) => (id === team1.id ? team1 : team2).name;

  // One engine, one command queue: the human's and the computer's commands
  // run strictly in turn, as a lockstep session would order them.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (
    work: () => Promise<CommandResponse>
  ): Promise<CommandResponse> => {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next.then((response) => {
      // The board does not redraw setup placements by itself.
      if (engine!.getPhase() === GamePhase.SETUP)
        eventBus.emit(GameEventNames.UI_SyncBoard);
      return response;
    });
  };
  // The same check a lockstep session makes, for both coaches on this page.
  const runAs = (
    senderTeamId: string,
    command: HeadlessCommand
  ): Promise<CommandResponse> =>
    enqueue(async () => {
      const refusal = await refusalOnceQuiet({
        game,
        command,
        senderTeamId,
        hostTeamId: myTeamId,
      });
      if (refusal) return refusal;
      const response = await game.execute(command);
      // Before the toss there is nothing to come back to. Either command
      // makes the toss and starts set-up.
      if (
        (command.type === "start-setup" || command.type === "coin-flip") &&
        response.ok
      )
        autosave?.start();
      return response;
    });
  const run = (command: HeadlessCommand) => runAs(myTeamId, command);

  let engine: GameService | null = null;
  const initialState = computerMatchState(options);
  const container = ServiceContainer.initialize(
    eventBus,
    team1,
    team2,
    initialState,
    Math.floor(Math.random() * 2 ** 31),
    (inner: GameService) => {
      engine = inner;
      return new ComputerGameService(
        inner,
        run,
        () => game.pendingDecision(),
        eventBus
      );
    },
    progressionOf(options),
    options.resume?.save.rng,
    options.resume?.save.matchStats,
    options.resume?.save.turnManager
  );
  const game: HeadlessGame = new HeadlessGame({
    ctx: {
      eventBus,
      gameService: engine!,
      rng: container.rngService,
      team1,
      team2,
      seed: 0,
      matchStats: container.matchStats,
    },
    kickingTeamId: options.resume?.save.drive.kickingTeamId ?? null,
  });

  const saveOptions = options.autosave;
  const autosave = saveOptions
    ? new MatchAutosave(
        eventBus,
        engine!,
        () => {
          const kickingTeamId = game.driveKickingTeamId() ?? team1.id;
          return createMatchSave({
            state: engine!.getState(),
            teams: [team1, team2],
            drive: {
              kickingTeamId,
              receivingTeamId: kickingTeamId === team1.id ? team2.id : team1.id,
            },
            rng: container.rngService.captureState(),
            matchStats: container.matchStats.captureState(),
            turnManager: engine!.captureTurnManagerState(),
            computer: { computerTeamId, difficulty: saveOptions.difficulty },
            competition: options.competitionContext,
          });
        },
        // Block dice, pushes and kick-off events wait here, not in the engine
        { choiceOpen: () => game.pendingDecision() !== null }
      )
    : null;
  if (options.resume) autosave?.start();

  const owner = (teamId: string) =>
    computerOwnsDecision(game, teamId, myTeamId);
  const computerCoach = createComputerCoach({
    game,
    eventBus,
    computerTeamId,
    mayAct: () => owner(computerTeamId),
    run: (command) => runAs(computerTeamId, command),
    coach: options.coach,
    pace: options.pace,
  });
  // A resumed computer waits for the board, so its moves are seen.
  if (options.resume)
    eventBus.once(GameEventNames.GameStateRestored, computerCoach.start);
  else computerCoach.start();
  // Dev builds only: lets a scripted coach drive the human side to record
  // whole matches against the computer.
  if (import.meta.env?.DEV)
    (window as unknown as { __computerMatch?: unknown }).__computerMatch = {
      game,
      run,
    };

  const waitingLabel = (): string => {
    const pending = game.pendingDecision();
    if (pending) return `${COMPUTER_NAME} is deciding…`;
    if (engine!.getPhase() === GamePhase.SETUP)
      return `${COMPUTER_NAME} is setting up…`;
    if (engine!.getPhase() === GamePhase.KICKOFF)
      return `${COMPUTER_NAME} is kicking off…`;
    const active = engine!.getActiveTeamId();
    return active === computerTeamId
      ? `${possessive(COMPUTER_NAME)} turn (${teamName(active)})…`
      : "Waiting…";
  };

  return {
    kind: "computer",
    role: "host",
    code: "computer",
    myTeamId,
    opponentName: COMPUTER_NAME,
    coachName: (teamId) => (teamId === computerTeamId ? COMPUTER_NAME : "You"),
    teams: { team1, team2 },
    // While the computer's command runs the engine can be between decisions.
    mayAct: () => !computerCoach.isThinking() && owner(myTeamId),
    waitingLabel,
    pendingDecision: () => game.pendingDecision(),
    decidingTeamId: () => {
      const pending = game.pendingDecision();
      if (!pending) return null;
      return owner(computerTeamId) ? computerTeamId : myTeamId;
    },
    run,
    sendChat: () => {},
    onChatMessage: () => () => {},
    chatHistory: () => [],
    onFatalError: () => () => {},
    saveState: () => {},
    setClockPaused: () => {},
    // The results screen settles both teams' awards from this one page.
    runProgressionCommand: (command) => enqueue(() => game.execute(command)),
    close: () => {
      computerCoach.close();
      autosave?.dispose();
      // A finished match has nothing to come back to.
      if (autosave && engine!.getPhase() === GamePhase.GAME_OVER)
        clearMatchSave();
      eventBus.dispose();
    },
  };
}
