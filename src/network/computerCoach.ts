/** The same planner and paced command loop for local and online computer coaches. */
import { nextComputerPregameCommand } from "../game/inducements/computerPurchases";
import { whenEngineQuiet } from "../game/core/GameFlowManager";
import { whenScreenSettled } from "../game/presentation/screenSettled";
import { HeadlessGame } from "../headless/HeadlessGame";
import { CommandResponse, HeadlessCommand } from "../headless/protocol";
import { GameSnapshot } from "../headless/serialization";
import { IEventBus } from "../services/EventBus";
import { Coach } from "../simulation/coach";
import { plannerCoach } from "../simulation/ai/planner";
import { enumerateDecision } from "../simulation/candidates";
import { createCoachRng } from "../simulation/rng";
import { GameEventNames } from "../types/events";
import { GamePhase, GameState, SubPhase } from "../types/GameState";
import { decisionOwner, gateContextOf } from "./OwnershipGate";

export interface ComputerCoachOptions {
  game: HeadlessGame;
  eventBus: IEventBus;
  computerTeamId: string;
  mayAct(): boolean;
  run(command: HeadlessCommand): Promise<CommandResponse>;
  coach?: Coach & { close?(): void };
  pace?: number;
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

/** Resolves once the page is in view. */
function whenWatched(): Promise<void> {
  if (typeof document === "undefined" || !document.hidden)
    return Promise.resolve();
  return new Promise((resolve) => {
    const onShow = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onShow);
      resolve();
    };
    document.addEventListener("visibilitychange", onShow);
  });
}

/** During a kick-off, the kicking team: the one not active. */
function kickingTeamOf(
  snapshot: GameSnapshot,
  team1Id: string,
  team2Id: string
): string | null {
  if (snapshot.phase !== GamePhase.KICKOFF) return null;
  return snapshot.activeTeamId === team1Id ? team2Id : team1Id;
}

/** Dev builds keep a log of the computer's choices on the window. */
function logChoice(
  snapshot: GameSnapshot,
  label: string,
  note: string | undefined
): void {
  if (!import.meta.env?.DEV) return;
  const log = ((
    window as unknown as { __computerLog?: string[] }
  ).__computerLog ??= []);
  log.push(`${snapshot.turn.turnNumber} ${label}${note ? ` | ${note}` : ""}`);
}

/** A setup still awaiting placement, confirmation or Swarming. */
function ownsSetup(state: GameState, teamId: string): boolean {
  return (
    state.activeTeamId === teamId &&
    (!state.setup?.confirmedTeamIds?.includes(teamId) ||
      !!state.setup.swarming?.teams[teamId]) &&
    (state.subPhase === SubPhase.SETUP_KICKING ||
      state.subPhase === SubPhase.SETUP_RECEIVING)
  );
}

export function computerOwnsDecision(
  game: HeadlessGame,
  teamId: string,
  hostTeamId: string
): boolean {
  const pending = game.pendingDecision();
  const active = game.ctx.gameService.getActiveTeamId();
  if (pending)
    return decisionOwner(pending, gateContextOf(game, hostTeamId)) === teamId;
  const state = game.ctx.gameService.getState();
  if (state.pregameInducements && !state.pregameInducements.complete)
    return !state.pregameInducements.offer?.confirmed[teamId];
  switch (state.phase) {
    case GamePhase.SETUP:
      return ownsSetup(state, teamId);
    case GamePhase.KICKOFF:
      // The kicking team acts, and it is the one not active.
      return (
        active != null && active !== teamId && state.kickoffKickResolved == null
      );
    case GamePhase.PLAY:
      return active === teamId;
    default:
      return false;
  }
}

export function createComputerCoach(options: ComputerCoachOptions) {
  const { game, eventBus, computerTeamId, mayAct, run } = options;
  const coach: Coach & { close?(): void } = options.coach ?? plannerCoach;
  const pace = options.pace ?? 1;
  const rng = createCoachRng(Math.floor(Math.random() * 2 ** 31));
  let thinking = false;
  let closed = false;
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms * pace));

  const thinkPregame = async (): Promise<boolean | null> => {
    const pregame = game.ctx.gameService.getState().pregameInducements;
    if (!pregame || pregame.complete || game.pendingDecision()) return null;
    const command = nextComputerPregameCommand(pregame, computerTeamId, [
      game.ctx.team1.id,
      game.ctx.team2.id,
    ]);
    return command ? (await run(command)).ok : false;
  };

  /** One decision, if it is the computer's to make; true when it acted. */
  const think = async (): Promise<boolean> => {
    if (thinking || closed || !mayAct()) return false;
    thinking = true;
    try {
      // A turn that is about to end by itself has nothing left to decide.
      await whenEngineQuiet();
      if (closed || !mayAct()) return false;
      const pregameActed = await thinkPregame();
      if (pregameActed !== null) return pregameActed;
      const snapshot = game.snapshot();
      const point = await enumerateDecision(
        game,
        kickingTeamOf(snapshot, game.ctx.team1.id, game.ctx.team2.id)
      );
      if (point.teamId !== computerTeamId || point.candidates.length === 0)
        return false;
      const { index, note } = await coach.choose({
        game,
        snapshot,
        point,
        rng,
      });
      const candidate = point.candidates[index] ?? point.candidates[0];
      logChoice(snapshot, candidate.label, note);
      for (const command of candidate.commands) {
        // Each step is seen before the next: the walk, the ball, the dice
        // and the banners it started have all been shown. Nothing plays on
        // in a tab nobody is watching, to pile up for when they come back.
        await whenWatched();
        await whenScreenSettled(eventBus);
        await wait(pause(command));
        if (closed || !mayAct()) return false;
        showIntent(command);
        const response = await run(command);
        if (!response.ok) {
          console.warn(
            `[Computer] ${command.type} refused: ${response.reason}`
          );
          break;
        }
        moveResolved(command);
      }
      return true;
    } catch (error) {
      console.error("[Computer] coach failed:", error);
      return false;
    } finally {
      thinking = false;
    }
  };

  /** The board finishes showing the computer's move. */
  const moveResolved = (command: HeadlessCommand) => {
    if (command.type === "move")
      eventBus.emit(GameEventNames.UI_OtherCoachMoveResolved, {
        playerId: command.playerId,
      });
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
      const player = game.ctx.gameService.getPlayerById(command.playerId);
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
      if (!closed)
        timer = setTimeout(loop, acted ? 0 : Math.max(5, 200 * pace));
    });
  };

  return {
    start: loop,
    isThinking: () => thinking,
    close() {
      closed = true;
      clearTimeout(timer);
      coach.close?.();
    },
  };
}
