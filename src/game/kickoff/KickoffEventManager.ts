import {
  kickoffOutcomeLine,
  kickoffRevealLine,
} from "./kickoffMoment";
import { type DelayProvider, waitAtMost } from "../core/GameFlowManager";
import {
  awaitCoach,
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";
import { whenMomentsComplete } from "../presentation/momentQueue";
import { DIE_LANDING_TIMEOUT_MS, DiceWatch } from "../presentation/diceWatch";
import { type IEventBus } from "../../services/EventBus";
import { GameEventNames, type AllEvents } from "../../types/events";
import { type GameState } from "@/types/GameState";
import { type Team } from "@/types/Team";
import {
  everyone,
  opponentsOf,
  type Seating,
  pairSeating,
  pairTeams,
  playerAt,
  seatOf,
} from "../seating";
import { type Player } from "@/types/Player";
import type { DiceController } from "../controllers/DiceController";
import type { WeatherManager } from "../managers/WeatherManager";
import { isStandableSquare } from "../rules/pitchSquares";
import { SetupValidator } from "../validators/SetupValidator";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
  type KickoffEventOutcome,
  grantEffect,
  kickoffEventOwner,
  isPickableKickoffPlayer,
} from "./kickoffEvents";
import {
  KICKOFF_TABLES,
  activeKickoffTableId,
  kickoffEventForRoll,
  kickoffEventMeaning,
} from "./kickoffTables";
import { type KickoffTurnStart, kickoffTurnPlay, mayReselect } from "./kickoffTurn";
import {
  type KickoffChoice,
  type KickoffRehearsal,
  type KickRecord,
  kickoffChoiceOf,
  kickoffTurnOf,
} from "./kickRecord";
import { kickoffEventResolvers } from "./kickoffResolvers";
import type { GameFlowManager } from "../core/GameFlowManager";

export interface KickoffEventStepState extends Omit<KickoffChoice, "stage"> {
  movedPlayerIds: string[];

  awaitingPlacement: string[];

  stage: "choose" | "play";

  canReselect: boolean;
}

const KICKOFF_RESULT = "kickoff-result";

const ROLL_READY_GUARD_MS = 30 * 60_000;

const TABLE_SHOWN_GUARD_MS = DIE_LANDING_TIMEOUT_MS + 4000;

const STEP_READ_MS = 900;

interface KickoffManagerOptions {
eventBus: IEventBus;
state: GameState;
seating: Seating;
diceController: DiceController;
weatherManager: WeatherManager;
flowManager: GameFlowManager;
callbacks: {
      getTurnNumber: (teamId: string) => number;
      moveTurnMarkers: (delta: number) => void;
      startTurn: (start: KickoffTurnStart) => boolean;
      closeTurn: () => void;
      finishActivation: (playerId: string) => void;
    };
delay: DelayProvider;
}

function choosingStep(choice: KickoffChoice): KickoffEventStepState {
  return {
    ...choice,
    selectedPlayerIds: [...choice.selectedPlayerIds],
    movedPlayerIds: [],
    awaitingPlacement: [],
    canReselect: false,
  };
}

export class KickoffEventManager {
  private closeStep: (() => void) | null = null;

  private resolving = false;
  private readonly setupValidator = new SetupValidator();

  private readonly resolvers: ReturnType<typeof kickoffEventResolvers>;

  private eventBus: IEventBus;
  private state: GameState;
  private readonly seating: Seating;
  private diceController: DiceController;
  private readonly delay: DelayProvider;
  private readonly callbacks: KickoffManagerOptions["callbacks"];
  constructor({ eventBus, state, seating, diceController, weatherManager, flowManager, callbacks, delay }: KickoffManagerOptions) {
    this.eventBus = eventBus;
    this.state = state;
    this.seating = seating;
    this.diceController = diceController;
    this.delay = delay;
    this.callbacks = callbacks;
    this.resolvers = kickoffEventResolvers({
      eventBus,
      state,
      diceController,
      weatherManager,
      flowManager,
      getTurnNumber: callbacks.getTurnNumber,
      moveTurnMarkers: callbacks.moveTurnMarkers,
      onWeatherScatter: (squares) => {
        if (this.state.kick) this.state.kick.scatter = squares;
      },
      diceShown: () => this.diceShown(),
    });
  }

  private async diceShown(): Promise<void> {
    await waitAtMost(
      this.delay,
      DiceWatch.shared(this.eventBus).landed(),
      TABLE_SHOWN_GUARD_MS
    );
    await this.delay(STEP_READ_MS);
  }

  private sides(kick: KickRecord) {
    const [home, away] = pairTeams(pairSeating(this.seating));
    const isTeam1Kicking = kick.kickingTeamId === home.id;
    return {
      isTeam1Kicking,
      kickingTeam: isTeam1Kicking ? home : away,
      receivingTeam: isTeam1Kicking ? away : home,
    };
  }

  public async rollAndResolve(kick: KickRecord): Promise<void> {
    const { isTeam1Kicking, kickingTeam, receivingTeam } = this.sides(kick);
    this.resolving = true;
    const rolled = kick.rehearsal ? this.rehearsedRoll(kick.rehearsal) : await this.revealTable(kick);
    if (!rolled || this.state.kick !== kick) return;
    const { roll, event } = rolled;
    const table = activeKickoffTableId();
    const outcome: KickoffEventOutcome = { event, meaning: kickoffEventMeaning(event, table), perTeam: {} };
    await this.resolvers[event]({ isTeam1Kicking, kickingTeam, receivingTeam, outcome, table });
    this.grantInteractiveEffect(outcome, kickingTeam, receivingTeam);
    const resolution = { roll, event, meaning: outcome.meaning, outcome };
    kick.resolution = resolution;
    this.resolving = false;
    this.eventBus.emit(GameEventNames.KickoffResult, resolution);
    this.announceOutcome(outcome, kickingTeam, receivingTeam);
  }

  private async waitUntilReady(kickingTeamId: string): Promise<void> {
    const readyId = nextPresentationId("kickoff-ready");
    const rolled = awaitCoach(this.eventBus, this.delay, readyId, ROLL_READY_GUARD_MS);
    this.eventBus.emit(GameEventNames.KickoffTableReady, { presentationId: readyId, kickingTeamId });
    await rolled;
  }

  private async showTable(roll: number, event: KickoffEvent): Promise<void> {
    const shownId = nextPresentationId("kickoff-table");
    const shown = awaitPresentation(this.eventBus, this.delay, shownId, TABLE_SHOWN_GUARD_MS);
    this.eventBus.emit(GameEventNames.KickoffTableRolled, { presentationId: shownId, roll, event });
    await shown;
  }

  private async revealTable(kick: KickRecord) {
    const { kickingTeam, receivingTeam } = this.sides(kick);
    await this.waitUntilReady(kickingTeam.id);
    if (this.state.kick !== kick) return null;
    const roll = this.diceController.roll2D6(KICKOFF_TABLE_ROLL, kickingTeam.id);
    const event = kickoffEventForRoll(roll);
    await this.showTable(roll, event);
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: KICKOFF_RESULT, headline: event, subtitle: kickoffRevealLine(event, kickingTeam, receivingTeam),
    });
    await whenMomentsComplete(this.eventBus);
    return { roll, event };
  }

  private grantInteractiveEffect(outcome: KickoffEventOutcome, kickingTeam: Team, receivingTeam: Team): void {
    if (!INTERACTIVE_KICKOFF_EVENTS.has(outcome.event)) return;
    const owner = kickoffEventOwner(outcome.event, kickingTeam.id, receivingTeam.id);
    grantEffect(outcome, owner, `may resolve the ${outcome.event} coach step`);
  }

  private announceOutcome(outcome: KickoffEventOutcome, kickingTeam: Team, receivingTeam: Team): void {
    const decided = kickoffOutcomeLine(outcome, kickingTeam, receivingTeam);
    if (decided) this.eventBus.emit(GameEventNames.UI_Announce, { kind: KICKOFF_RESULT, headline: outcome.event, subtitle: decided });
  }

  public async coachStep(kick: KickRecord): Promise<void> {
    if (!kick.step) this.openStep(kick);
    else if (kick.step.stage === "choose") this.announceChoice(kick.step);
    if (!kick.step) return;
    await new Promise<void>((resolve) => {
      this.closeStep = resolve;
    });
  }

  private openStep(kick: KickRecord): void {
    const choice =
      kick.stage === "coach" ? this.eventChoice(kick) : this.highKickChoice(kick);
    if (choice) this.chooseFrom(kick, choice);
  }

  private eventChoice(kick: KickRecord): KickoffChoice | null {
    const event = kick.resolution?.event;
    if (!event || !INTERACTIVE_KICKOFF_EVENTS.has(event) || event === KickoffEvent.HIGH_KICK) return null;
    const { kickingTeam, receivingTeam } = this.sides(kick);
    const teamId = kickoffEventOwner(event, kickingTeam.id, receivingTeam.id);
    const selectionLimit = this.stepSize(kick, event, teamId);
    return {
      stage: "choose",
      event,
      teamId,
      selectionLimit,
      selectedPlayerIds: event === KickoffEvent.GET_READY_LADS ? this.eligiblePlayerIds(event, teamId).slice(0, selectionLimit) : [],
    };
  }

  private rehearsedRoll({ event }: KickoffRehearsal) {
    const table = KICKOFF_TABLES[activeKickoffTableId()];
    const roll = Object.entries(table).find((entry) => entry[1] === event);
    return { roll: Number(roll?.[0] ?? 0), event };
  }

  private stepSize(kick: KickRecord, event: KickoffEvent, ownerTeamId: string): number {
    if (kick.rehearsal?.selectionLimit) return kick.rehearsal.selectionLimit;
    if (event === KickoffEvent.QUICK_ATTACK) return 1;
    if (event === KickoffEvent.GET_READY_LADS) {
      return this.eligiblePlayerIds(event, ownerTeamId).length;
    }
    return this.diceController.rollD3(`${event}: D3 + 1 players`, ownerTeamId) + 1;
  }

  public isResolving(): boolean {
    return this.resolving;
  }

  private highKickChoice(kick: KickRecord): KickoffChoice | null {
    const landing = this.state.balls[0].at;
    if (kick.resolution?.event !== KickoffEvent.HIGH_KICK || !landing) return null;

    const { x, y } = landing;
    const { isTeam1Kicking, receivingTeam } = this.sides(kick);
    if (!this.setupValidator.isInSetupZone(x, y, !isTeam1Kicking)) {
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        "High Kick: the ball lands in No Man's Land, so no player may be placed under it."
      );
      return null;
    }

    const holder = playerAt(this.seating, { x, y });
    if (holder) {
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        `High Kick: ${holder.playerName} already stands where the ball will land, so no one else may be placed there.`
      );
      return null;
    }
    return { stage: "choose", event: KickoffEvent.HIGH_KICK, teamId: receivingTeam.id, selectionLimit: 1, selectedPlayerIds: [], landingSquare: { x, y } };
  }

  public getStep(): KickoffEventStepState | null {
    const choice = kickoffChoiceOf(this.state);
    return choice ? choosingStep(choice) : this.playingStep();
  }

  private playingStep(): KickoffEventStepState | null {
    const turn = kickoffTurnOf(this.state);
    if (!turn) return null;
    const { teamId, activatedPlayerIds } = this.state.turn;
    return {
      event: turn.event,
      teamId,
      selectionLimit: turn.selectionLimit,
      selectedPlayerIds: [...turn.playerIds],
      movedPlayerIds: turn.playerIds.filter((id) => activatedPlayerIds.has(id)),
      awaitingPlacement: [],
      stage: "play",
      canReselect: mayReselect(this.state),
    };
  }

  private chooseFrom(kick: KickRecord, choice: KickoffChoice): void {
    kick.step = choice;
    this.announceChoice(choice);
  }

  private announceChoice(choice: KickoffChoice): void {
    const { event, teamId, selectionLimit, landingSquare } = choice;
    this.eventBus.emit(GameEventNames.KickoffEventStepStarted, {
      event,
      teamId,
      selectionLimit,
      ...(landingSquare !== undefined && { landingSquare }),
    });
  }

  private finishStep(skipped: boolean): void {
    const choice = kickoffChoiceOf(this.state);
    if (choice) this.closeWith({ event: choice.event, teamId: choice.teamId, skipped });
  }

  private closeWith(
    resolved: AllEvents[typeof GameEventNames.KickoffEventStepResolved]
  ): void {
    const { kick } = this.state;
    if (kick) {
      kick.step = null;
      kick.stage = kick.stage === "coach" ? "high-kick" : "scatter";
    }
    this.eventBus.emit(GameEventNames.KickoffEventStepResolved, resolved);
    this.abandonStep();
  }

  public abandonStep(): void {
    const close = this.closeStep;
    this.closeStep = null;
    this.resolving = false;
    close?.();
  }

  public getActingTeamId(): string | null {
    return this.getStep()?.teamId ?? null;
  }

  private selectable(player: Player, event: KickoffEvent): boolean {
    return isPickableKickoffPlayer(
      event,
      player,
      opponentsOf(this.seating, player.teamId)
    );
  }

  private eligiblePlayerIds(event: KickoffEvent, teamId: string): string[] {
    return this.stepPlayers(teamId)
      .filter((player) => this.selectable(player, event))
      .map((player) => player.id);
  }

  private stepPlayers(teamId: string): Player[] {
    return seatOf(this.seating, teamId).team.players;
  }

  public togglePlayerSelection(playerId: string): boolean {
    const choice = kickoffChoiceOf(this.state);
    if (!choice) return false;
    const player = this.stepPlayers(choice.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (!player || !this.selectable(player, choice.event)) return false;
    const selected = choice.selectedPlayerIds;
    const index = selected.indexOf(playerId);
    if (index !== -1) {
      selected.splice(index, 1);
      return true;
    }
    if (selected.length >= choice.selectionLimit) return false;
    selected.push(playerId);
    return true;
  }

  public movePlayer(playerId: string, x: number, y: number): boolean {
    const { teamId, activatedPlayerIds } = this.state.turn;
    if (kickoffTurnOf(this.state)?.play.kind !== "one-square") return false;
    if (activatedPlayerIds.has(playerId)) return false;
    const player = this.stepPlayers(teamId).find(
      (candidate) => candidate.id === playerId
    );
    const from = player?.gridPosition;
    if (!player || !from) return false;
    if (Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) !== 1) {
      return false;
    }
    if (!this.isFreeDestination(playerId, x, y)) return false;

    player.gridPosition = { x, y };
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId,
      from,
      to: { x, y },
      path: [{ x, y }],
    });
    this.callbacks.finishActivation(playerId);
    return true;
  }

  private isFreeDestination(playerId: string, x: number, y: number): boolean {
    if (!isStandableSquare({ x, y })) return false;
    return everyone(this.seating).every((other) => !(other.id !== playerId && other.gridPosition?.x === x && other.gridPosition.y === y));
  }

  public placePlayer(playerId: string, x: number, y: number): boolean {
    const choice = kickoffChoiceOf(this.state);
    const landing = choice?.landingSquare;
    if (landing?.x !== x || landing.y !== y) return false;
    if (!choice?.selectedPlayerIds.includes(playerId)) return false;
    const player = this.stepPlayers(choice.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (!player || !this.isFreeDestination(playerId, x, y)) return false;
    player.gridPosition = { x, y };
    this.eventBus.emit(GameEventNames.PlayerPlaced, { playerId, x, y });
    this.finishStep(false);
    return true;
  }

  public confirmStep(): boolean {
    const choice = kickoffChoiceOf(this.state);
    if (!choice) return false;
    const { event, teamId, selectedPlayerIds, selectionLimit } = choice;
    if (!kickoffTurnPlay(event)) {
      this.finishStep(false);
      return true;
    }
    if (selectedPlayerIds.length === 0) return this.skipStep();
    return this.callbacks.startTurn({
      event,
      teamId,
      selectionLimit,
      playerIds: selectedPlayerIds,
    });
  }

  public skipStep(): boolean {
    if (!kickoffChoiceOf(this.state)) return false;
    this.finishStep(true);
    return true;
  }

  public reselect(): boolean {
    const playing = this.playingStep();
    const { kick } = this.state;
    if (!kick || !playing?.canReselect) return false;
    this.callbacks.closeTurn();
    const { event, teamId, selectionLimit, selectedPlayerIds } = playing;
    this.chooseFrom(kick, { stage: "choose", event, teamId, selectionLimit, selectedPlayerIds });
    return true;
  }

  public finishTurn(event: KickoffEvent, teamId: string): void {
    this.closeWith({ event, teamId, skipped: false });
  }

  public isStepOpen(): boolean {
    return this.getStep() !== null;
  }
}
