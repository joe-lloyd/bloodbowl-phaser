import { isCommandOf } from "./commandKinds";
import { nextComputerPregameCommand } from "../game/inducements/computerPurchases";
import { whenEngineQuiet } from "../game/core/GameFlowManager";
import { whenScreenSettled } from "../game/presentation/screenSettled";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type CommandResponse,
  type HeadlessCommand,
} from "../headless/protocol";
import { type GameSnapshot } from "../headless/serialization";
import { type IEventBus } from "../services/EventBus";
import { type Coach } from "../simulation/coach";
import { plannerCoach } from "../simulation/ai/planner";
import { type Candidate, enumerateDecision } from "../simulation/candidates";
import { createCoachRng } from "../simulation/rng";
import { GameEventNames } from "../types/events";
import { GamePhase, type GameState, SubPhase } from "../types/GameState";
import { decisionOwner, gateContextOf } from "./OwnershipGate";

const DECLARE_ACTION = "declare-action";
const END_ACTIVATION = "end-activation";

export interface ComputerCoachOptions {
  game: HeadlessGame;
  eventBus: IEventBus;
  computerTeamId: string;
  mayAct(): boolean;
  run(command: HeadlessCommand): Promise<CommandResponse>;
  coach?: Coach & { close?(): void };
  pace?: number;
}

function pause(command: HeadlessCommand): number {
  if (!isCommandOf(command, ["place-player", "remove-player", "confirm-setup", DECLARE_ACTION, "move", END_ACTIVATION, "end-turn"])) return 550;
  switch (command.type) {
    case "place-player":
    case "remove-player":
      return 40;
    case "confirm-setup":
      return 400;
    case DECLARE_ACTION:
      return 700;
    case "move":
      return 320;
    case END_ACTIVATION:
      return 250;
    case "end-turn":
      return 600;
  }
}

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

function kickingTeamOf(
  snapshot: GameSnapshot,
  team1Id: string,
  team2Id: string
): string | null {
  if (snapshot.phase !== GamePhase.KICKOFF) return null;
  return snapshot.activeTeamId === team1Id ? team2Id : team1Id;
}

function logChoice(
  snapshot: GameSnapshot,
  label: string,
  note: string | undefined
): void {
  if (!import.meta.env.DEV) return;
  const log = (window.__computerLog ??= []);
  log.push(
    `${String(snapshot.turn.turnNumber)} ${label}${note ? ` | ${note}` : ""}`
  );
}

function ownsSetup(state: GameState, teamId: string): boolean {
  return (
    state.activeTeamId === teamId &&
    (!state.setup?.confirmedTeamIds.includes(teamId) ||
      !!state.setup.swarming?.teams[teamId]) &&
    (state.subPhase === SubPhase.SETUP_KICKING ||
      state.subPhase === SubPhase.SETUP_RECEIVING)
  );
}

function ownsKickoff(state: GameState, teamId: string): boolean {
  return state.activeTeamId !== null && state.activeTeamId !== teamId && state.kickoffKickResolved == null;
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
  if (state.phase === GamePhase.SETUP) return ownsSetup(state, teamId);
  if (state.phase === GamePhase.KICKOFF) return ownsKickoff(state, teamId);
  return state.phase === GamePhase.PLAY && active === teamId;
}

declare global {
  interface Window {
    __computerLog?: string[];
  }
}

class ComputerCoach {
  private thinking = false;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly coach: Coach & { close?(): void };
  private readonly pace: number;
  private readonly rng = createCoachRng(Math.floor(Math.random() * 2 ** 31));
  private readonly options: ComputerCoachOptions;

  constructor(options: ComputerCoachOptions) {
    this.options = options;
    this.coach = options.coach ?? plannerCoach;
    this.pace = options.pace ?? 1;
  }

  readonly start = (): void => {
    if (this.closed) return;
    void this.think().then((acted) => {
      if (!this.closed) this.timer = setTimeout(this.start, acted ? 0 : Math.max(5, 200 * this.pace));
    });
  };

  isThinking(): boolean {
    return this.thinking;
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.coach.close?.();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms * this.pace));
  }

  private mayAct(): boolean {
    return !this.closed && this.options.mayAct();
  }

  private async thinkPregame(): Promise<boolean | null> {
    const { game, computerTeamId } = this.options;
    const pregame = game.ctx.gameService.getState().pregameInducements;
    if (!pregame || pregame.complete || game.pendingDecision()) return null;
    const command = nextComputerPregameCommand(pregame, computerTeamId, [game.ctx.team1.id, game.ctx.team2.id]);
    return command ? (await this.options.run(command)).ok : false;
  }

  private async choose(): Promise<Candidate | null> {
    const { game, computerTeamId } = this.options;
    const snapshot = game.snapshot();
    const point = await enumerateDecision(game, kickingTeamOf(snapshot, game.ctx.team1.id, game.ctx.team2.id));
    if (point.teamId !== computerTeamId) return null;
    const [first] = point.candidates;
    if (!first) return null;
    const { index, note } = await this.coach.choose({ game, snapshot, point, rng: this.rng });
    const candidate = point.candidates[index] ?? first;
    logChoice(snapshot, candidate.label, note);
    return candidate;
  }

  private async think(): Promise<boolean> {
    if (this.thinking || !this.mayAct()) return false;
    this.thinking = true;
    try {
      await whenEngineQuiet();
      if (!this.mayAct()) return false;
      const pregameActed = await this.thinkPregame();
      if (pregameActed !== null) return pregameActed;
      const candidate = await this.choose();
      return candidate ? await this.execute(candidate) : false;
    } catch (error) {
      console.error("[Computer] coach failed:", error);
      return false;
    } finally {
      this.thinking = false;
    }
  }

  private async execute(candidate: Candidate): Promise<boolean> {
    for (const command of candidate.commands) {
      await whenWatched();
      await whenScreenSettled(this.options.eventBus);
      await this.wait(pause(command));
      if (!this.mayAct()) return false;
      this.showIntent(command);
      const response = await this.options.run(command);
      if (!response.ok) {
        console.warn(`[Computer] ${command.type} refused: ${String(response.reason)}`);
        break;
      }
      this.moveResolved(command);
    }
    return true;
  }

  private moveResolved(command: HeadlessCommand): void {
    if (command.type === "move") this.options.eventBus.emit(GameEventNames.UI_OtherCoachMoveResolved, { playerId: command.playerId });
  }

  private showIntent(command: HeadlessCommand): void {
    const { eventBus, game } = this.options;
    if (command.type === DECLARE_ACTION) eventBus.emit(GameEventNames.RemoteSelectionChanged, { playerId: command.playerId });
    if (command.type === END_ACTIVATION || command.type === "end-turn") eventBus.emit(GameEventNames.RemoteSelectionChanged, { playerId: null });
    if (command.type !== "move") return;
    const player = game.ctx.gameService.getPlayerById(command.playerId);
    if (player?.gridPosition) eventBus.emit(GameEventNames.UI_ShowOtherCoachMove, { from: { ...player.gridPosition }, path: command.path, ma: player.stats.MA });
  }
}

export function createComputerCoach(options: ComputerCoachOptions) {
  return new ComputerCoach(options);
}
