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

import { IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { ServiceContainer } from "../services/ServiceContainer";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  CommandResponse,
  HeadlessCommand,
  PendingDecision,
} from "../headless/protocol";
import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { Team } from "../types/Team";
import { enumerateDecision } from "../simulation/candidates";
import { Coach } from "../simulation/coach";
import { createCoachRng } from "../simulation/rng";
import { plannerCoach } from "../simulation/ai/planner";
import { NetworkedGameService } from "./NetworkedGameService";
import { decisionOwner } from "./OwnershipGate";
import { OnlineMatch } from "./OnlineMatch";
import { possessive } from "../game/managers/TurnManager";

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

/** How long the computer waits before each kind of command, in ms. */
function pause(command: HeadlessCommand): number {
  switch (command.type) {
    case "place-player":
    case "remove-player":
      return 40;
    case "confirm-setup":
      return 400;
    case "declare-action":
      return 700;
    case "move":
      return 320;
    case "end-activation":
      return 250;
    case "end-turn":
      return 600;
    default:
      return 550;
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
  coach?: Coach;
  /** Scale every pause; 0 plays at full speed (tests). */
  pace?: number;
}

export function createComputerMatch(
  options: ComputerMatchOptions
): OnlineMatch {
  const { eventBus, team1, team2, computerTeamId } = options;
  const coach = options.coach ?? plannerCoach;
  const pace = options.pace ?? 1;
  const myTeamId = computerTeamId === team1.id ? team2.id : team1.id;
  const teamName = (id: string) => (id === team1.id ? team1 : team2).name;
  const teamOf = (playerId: string) =>
    [...team1.players, ...team2.players].find((p) => p.id === playerId)?.teamId;

  // One engine, one command queue: the human's and the computer's commands
  // run strictly in turn, as a lockstep session would order them.
  let queue: Promise<unknown> = Promise.resolve();
  const run = (command: HeadlessCommand): Promise<CommandResponse> => {
    const next = queue.then(() => game.execute(command));
    queue = next.catch(() => undefined);
    return next.then((response) => {
      // The board does not redraw setup placements by itself.
      if (engine!.getPhase() === GamePhase.SETUP)
        eventBus.emit(GameEventNames.UI_SyncBoard);
      return response;
    });
  };

  let engine: GameService | null = null;
  const container = ServiceContainer.initialize(
    eventBus,
    team1,
    team2,
    GameService.createInitialState(
      team1,
      team2,
      GamePhase.SETUP,
      SubPhase.INTRO
    ),
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
    options.progressionEnabled ?? false
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
  });

  const owner = (teamId: string): boolean => {
    const pending = game.pendingDecision();
    const active = engine!.getActiveTeamId();
    if (pending)
      return (
        decisionOwner(pending, {
          activeTeamId: active,
          pendingDecision: pending,
          teamIdOfPlayer: teamOf,
          hostTeamId: team1.id,
        }) === teamId
      );
    const state = engine!.getState();
    switch (state.phase) {
      case GamePhase.SETUP:
        // The hand-over to the other team lands a moment after a confirm.
        return (
          active === teamId &&
          !state.setup?.confirmedTeamIds?.includes(teamId) &&
          (state.subPhase === SubPhase.SETUP_KICKING ||
            state.subPhase === SubPhase.SETUP_RECEIVING)
        );
      case GamePhase.KICKOFF:
        // The kicking team acts, and it is the one not active.
        return (
          active != null &&
          active !== teamId &&
          state.kickoffKickResolved == null
        );
      case GamePhase.PLAY:
        return active === teamId;
      default:
        return false;
    }
  };

  // ===== The computer coach =====
  const rng = createCoachRng(Math.floor(Math.random() * 2 ** 31));
  let thinking = false;
  let closed = false;
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms * pace));

  /** One decision, if it is the computer's to make; true when it acted. */
  const think = async (): Promise<boolean> => {
    if (thinking || closed || !owner(computerTeamId)) return false;
    thinking = true;
    try {
      const snapshot = game.snapshot();
      const kicker =
        snapshot.phase === GamePhase.KICKOFF
          ? snapshot.activeTeamId === team1.id
            ? team2.id
            : team1.id
          : null;
      const point = await enumerateDecision(game, kicker);
      if (point.teamId !== computerTeamId || point.candidates.length === 0)
        return false;
      const { index, note } = await coach.choose({
        game,
        snapshot,
        point,
        rng,
      });
      const candidate = point.candidates[index] ?? point.candidates[0];
      if (import.meta.env?.DEV) {
        const log = ((
          window as unknown as { __computerLog?: string[] }
        ).__computerLog ??= []);
        log.push(
          `${snapshot.turn.turnNumber} ${candidate.label}${note ? ` | ${note}` : ""}`
        );
      }
      for (const command of candidate.commands) {
        await wait(pause(command));
        if (closed) return false;
        showIntent(command);
        const response = await run(command);
        if (!response.ok) {
          console.warn(
            `[Computer] ${command.type} refused: ${response.reason}`
          );
          break;
        }
        if (command.type === "move")
          eventBus.emit(GameEventNames.UI_OtherCoachMoveResolved, {
            playerId: command.playerId,
          });
      }
      return true;
    } catch (error) {
      console.error("[Computer] coach failed:", error);
      return false;
    } finally {
      thinking = false;
    }
  };

  /** Show the human which player the computer is using, and where it runs. */
  const showIntent = (command: HeadlessCommand) => {
    if (command.type === "declare-action")
      eventBus.emit(GameEventNames.RemoteSelectionChanged, {
        playerId: command.playerId,
      });
    if (command.type === "end-activation" || command.type === "end-turn")
      eventBus.emit(GameEventNames.RemoteSelectionChanged, { playerId: null });
    if (command.type === "move") {
      const player = engine!.getPlayerById(command.playerId);
      if (player?.gridPosition)
        eventBus.emit(GameEventNames.UI_ShowOtherCoachMove, {
          from: { ...player.gridPosition },
          path: command.path,
          ma: player.stats.MA,
        });
    }
  };

  // Act again at once after acting; otherwise look again shortly.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loop = () => {
    if (closed) return;
    void think().then((acted) => {
      timer = setTimeout(loop, acted ? 0 : Math.max(5, 200 * pace));
    });
  };
  loop();
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
    mayAct: () => owner(myTeamId),
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
    runProgressionCommand: run,
    close: () => {
      closed = true;
      clearTimeout(timer);
    },
  };
}
