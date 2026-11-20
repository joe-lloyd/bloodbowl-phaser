import {
  kickoffMomentDetail,
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
import { GameEventNames, type ActionType } from "../../types/events";
import { type GameState } from "@/types/GameState";
import { type Team } from "@/types/Team";
import { type Player, PlayerStatus } from "@/types/Player";
import type { DiceController } from "../controllers/DiceController";
import type { WeatherManager } from "../managers/WeatherManager";
import { isStandableSquare } from "../rules/pitchSquares";
import { SetupValidator } from "../validators/SetupValidator";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KICKOFF_EVENT_MEANING,
  kickoffEventForRoll,
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
  type KickoffEventOutcome,
  grantEffect,
  isOneSquareMoveEvent,
  kickoffEventOwner,
  isOpenKickoffPlayer,
} from "./kickoffEvents";
import { kickoffEventResolvers } from "./kickoffResolvers";

export interface ChargeBudget {
  blitz: number;
  throwTeammate: number;
  kickTeammate: number;
}

export interface KickoffEventStepState {
  event: KickoffEvent;

  teamId: string;
  selectionLimit: number;
  selectedPlayerIds: string[];

  movedPlayerIds: string[];

  awaitingPlacement: string[];

  landingSquare?: { x: number; y: number };

  charge?: {
    queue: string[];
    budget: ChargeBudget;
    activePlayerId: string | null;
    aborted: boolean;
  };
}

const KICKOFF_RESULT = "kickoff-result";

const ROLL_READY_GUARD_MS = 30 * 60_000;

const TABLE_SHOWN_GUARD_MS = DIE_LANDING_TIMEOUT_MS + 4000;

const STEP_READ_MS = 900;

type StepResolver = (skipped: boolean) => void;

interface KickoffManagerOptions {
eventBus: IEventBus;
state: GameState;
team1: Team;
team2: Team;
diceController: DiceController;
weatherManager: WeatherManager;
callbacks: {
      getTurnNumber: (teamId: string) => number;
      moveTurnMarkers: (delta: number) => void;
    };
delay: DelayProvider;
}

export class KickoffEventManager {
  private step: KickoffEventStepState | null = null;
  private stepResolver: StepResolver | null = null;

  private weatherScatterPending = false;
  private lastEvent: KickoffEvent | null = null;

  private resolving = false;
  private chargePreviousActiveTeamId: string | null = null;
  private readonly setupValidator = new SetupValidator();

  private readonly resolvers: ReturnType<typeof kickoffEventResolvers>;

  private eventBus: IEventBus;
  private state: GameState;
  private team1: Team;
  private team2: Team;
  private diceController: DiceController;
  private readonly delay: DelayProvider;
  constructor({ eventBus, state, team1, team2, diceController, weatherManager, callbacks, delay }: KickoffManagerOptions) {
    this.eventBus = eventBus;
    this.state = state;
    this.team1 = team1;
    this.team2 = team2;
    this.diceController = diceController;
    this.delay = delay;
    this.resolvers = kickoffEventResolvers({
      eventBus,
      state,
      diceController,
      weatherManager,
      getTurnNumber: callbacks.getTurnNumber,
      moveTurnMarkers: callbacks.moveTurnMarkers,
      onWeatherScatter: () => {
        this.weatherScatterPending = true;
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

  public async rollAndResolve(isTeam1Kicking: boolean): Promise<void> {
    const existing = this.state.kickoffResolution;
    if (existing) {
      this.lastEvent = existing.event;

      delete this.state.chargeTeamId;
      this.eventBus.emit(GameEventNames.KickoffResult, {
        roll: existing.roll,
        event: existing.event,
        meaning: existing.meaning,
        outcome: existing.outcome,
      });
      this.announceMoment(existing.outcome, isTeam1Kicking);
      return;
    }

    const kickingTeam = isTeam1Kicking ? this.team1 : this.team2;
    const receivingTeam = isTeam1Kicking ? this.team2 : this.team1;

    this.resolving = true;
    const { roll, event } = await this.revealTable(kickingTeam, receivingTeam);
    const outcome: KickoffEventOutcome = { event, meaning: KICKOFF_EVENT_MEANING[event], perTeam: {} };
    await this.resolvers[event]({ isTeam1Kicking, kickingTeam, receivingTeam, outcome });
    this.grantInteractiveEffect(outcome, kickingTeam, receivingTeam);
    this.state.kickoffResolution = { roll, event, meaning: outcome.meaning, outcome };
    this.resolving = false;
    this.eventBus.emit(GameEventNames.KickoffResult, { roll, event, meaning: outcome.meaning, outcome });
    this.announceOutcome(outcome, kickingTeam, receivingTeam);
    await this.resolveCoachStep(event, kickingTeam, receivingTeam);
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

  private async revealTable(kickingTeam: Team, receivingTeam: Team) {
    await this.waitUntilReady(kickingTeam.id);
    const roll = this.diceController.roll2D6(KICKOFF_TABLE_ROLL, kickingTeam.id);
    const event = kickoffEventForRoll(roll);
    this.lastEvent = event;
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

  private async resolveCoachStep(event: KickoffEvent, kickingTeam: Team, receivingTeam: Team): Promise<void> {
    if (!INTERACTIVE_KICKOFF_EVENTS.has(event) || event === KickoffEvent.HIGH_KICK) return;
    const ownerTeamId = kickoffEventOwner(event, kickingTeam.id, receivingTeam.id);
    const selectionLimit = this.diceController.rollD3(`${event}: D3 + 1 players`, ownerTeamId) + 1;
    await this.openStep({ event, teamId: ownerTeamId, selectionLimit });
  }

  private announceMoment(
    outcome: KickoffEventOutcome,
    isTeam1Kicking: boolean
  ): void {
    if (INTERACTIVE_KICKOFF_EVENTS.has(outcome.event)) return;
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: KICKOFF_RESULT,
      headline: outcome.event,
      subtitle: kickoffMomentDetail(
        outcome,
        isTeam1Kicking ? this.team1 : this.team2,
        isTeam1Kicking ? this.team2 : this.team1
      ),
    });
  }

  public isResolving(): boolean {
    return this.resolving;
  }

  public getLastEvent(): KickoffEvent | null {
    return this.lastEvent;
  }

  public async resolveHighKickStep(
    isTeam1Kicking: boolean,
    landingSquare: { x: number; y: number }
  ): Promise<void> {
    if (this.lastEvent !== KickoffEvent.HIGH_KICK) return;

    const { x, y } = landingSquare;
    if (!this.setupValidator.isInSetupZone(x, y, !isTeam1Kicking)) {
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        "High Kick: the ball lands in No Man's Land, so no player may be placed under it."
      );
      return;
    }

    const holder = [...this.team1.players, ...this.team2.players].find(
      (player) => player.gridPosition?.x === x && player.gridPosition.y === y
    );
    if (holder) {
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        `High Kick: ${holder.playerName} already stands where the ball will land, so no one else may be placed there.`
      );
      return;
    }
    const receivingTeamId = (isTeam1Kicking ? this.team2 : this.team1).id;
    await this.openStep({ event: KickoffEvent.HIGH_KICK, teamId: receivingTeamId, selectionLimit: 1, landingSquare: landingSquare }
    );
  }

  public consumeWeatherScatterPending(): boolean {
    const pending = this.weatherScatterPending;
    this.weatherScatterPending = false;
    return pending;
  }

  public getStep(): KickoffEventStepState | null {
    if (!this.step) return null;
    return {
      ...this.step,
      selectedPlayerIds: [...this.step.selectedPlayerIds],
      movedPlayerIds: [...this.step.movedPlayerIds],
      awaitingPlacement: [...this.step.awaitingPlacement],
      ...(this.step.charge ? { charge: { ...this.step.charge, queue: [...this.step.charge.queue] } } : {}),
    };
  }

  private openStep({ event, teamId, selectionLimit, landingSquare }: Pick<KickoffEventStepState, "event" | "teamId" | "selectionLimit" | "landingSquare">): Promise<boolean> {
    this.step = {
      event,
      teamId,
      selectionLimit,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
      ...(landingSquare === undefined ? {} : { landingSquare }),
    };
    return new Promise((resolve) => {
      this.stepResolver = resolve;
      this.eventBus.emit(GameEventNames.KickoffEventStepStarted, {
        event,
        teamId,
        selectionLimit,
        ...(landingSquare === undefined ? {} : { landingSquare }),
      });
    });
  }

  private finishStep(skipped: boolean): void {
    if (!this.step) return;
    const { event, teamId } = this.step;
    if (event === KickoffEvent.CHARGE) {
      this.state.activePlayer = null;
      this.state.activeTeamId = this.chargePreviousActiveTeamId;
      this.chargePreviousActiveTeamId = null;
      delete this.state.chargeTeamId;
    }
    this.step = null;
    this.eventBus.emit(GameEventNames.KickoffEventStepResolved, {
      event,
      teamId,
      skipped,
    });
    this.stepResolver?.(skipped);
    this.stepResolver = null;
  }

  public getActingTeamId(): string | null {
    return this.step?.teamId ?? null;
  }

  private isOpen(player: Player): boolean {
    const opponents = player.teamId === this.team1.id ? this.team2.players : this.team1.players;
    return isOpenKickoffPlayer(player, opponents);
  }

  private stepPlayers(teamId: string): Player[] {
    const team = teamId === this.team1.id ? this.team1 : this.team2;
    return team.players;
  }

  public togglePlayerSelection(playerId: string): boolean {
    if (!this.step) return false;
    const player = this.stepPlayers(this.step.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (!player || !this.isOpen(player)) return false;
    if (this.step.movedPlayerIds.includes(playerId)) return false;
    const selected = this.step.selectedPlayerIds;
    const index = selected.indexOf(playerId);
    if (index >= 0) {
      selected.splice(index, 1);
      return true;
    }
    if (selected.length >= this.step.selectionLimit) return false;
    selected.push(playerId);
    return true;
  }

  public movePlayer(playerId: string, x: number, y: number): boolean {
    if (!this.step || !isOneSquareMoveEvent(this.step.event)) return false;
    if (!this.step.selectedPlayerIds.includes(playerId)) return false;
    if (this.step.movedPlayerIds.includes(playerId)) return false;
    const player = this.stepPlayers(this.step.teamId).find(
      (candidate) => candidate.id === playerId
    );
    const from = player?.gridPosition;
    if (!player || !from) return false;
    if (Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) !== 1) {
      return false;
    }
    if (!this.isFreeDestination(playerId, x, y)) return false;

    player.gridPosition = { x, y };
    this.step.movedPlayerIds.push(playerId);
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId,
      from,
      to: { x, y },
      path: [{ x, y }],
    });
    return true;
  }

  private isFreeDestination(playerId: string, x: number, y: number): boolean {
    if (!isStandableSquare({ x, y })) return false;
    return ![...this.team1.players, ...this.team2.players].some((other) => other.id !== playerId && other.gridPosition?.x === x && other.gridPosition.y === y);
  }

  public placePlayer(playerId: string, x: number, y: number): boolean {
    if (!this.step) return false;
    const player = this.stepPlayers(this.step.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (!player) return false;

    if (this.step.event === KickoffEvent.HIGH_KICK) {
      const landing = this.step.landingSquare;
      if (landing?.x !== x || y !== landing.y) return false;
      if (!this.step.selectedPlayerIds.includes(playerId)) return false;
      const occupied = [...this.team1.players, ...this.team2.players].some(
        (other) =>
          other.id !== playerId &&
          other.gridPosition?.x === x &&
          other.gridPosition.y === y
      );
      if (occupied) return false;
      player.gridPosition = { x, y };
      this.eventBus.emit(GameEventNames.PlayerPlaced, { playerId, x, y });
      this.finishStep(false);
      return true;
    }

    return false;
  }

  public confirmStep(): boolean {
    if (!this.step) return false;
    if (this.step.event === KickoffEvent.CHARGE) {
      if (this.step.charge) return false;
      if (this.step.selectedPlayerIds.length === 0) {
        this.finishStep(true);
        return true;
      }
      this.step.charge = {
        queue: [...this.step.selectedPlayerIds],
        budget: { blitz: 1, throwTeammate: 1, kickTeammate: 1 },
        activePlayerId: null,
        aborted: false,
      };
      this.chargePreviousActiveTeamId = this.state.activeTeamId;
      this.state.activeTeamId = this.step.teamId;
      this.state.chargeTeamId = this.step.teamId;
      this.advanceCharge();
      return true;
    }

    this.finishStep(false);
    return true;
  }

  public skipStep(): boolean {
    if (!this.step) return false;
    if (this.step.event === KickoffEvent.CHARGE && this.step.charge) {
      this.step.charge.queue = [];
      this.step.charge.activePlayerId = null;
      this.finishStep(false);
      return true;
    }
    this.finishStep(true);
    return true;
  }

  public getChargeActivePlayerId(): string | null {
    return this.step?.charge?.activePlayerId ?? null;
  }

  public getChargeBudget(): ChargeBudget | null {
    return this.step?.charge?.budget ?? null;
  }

  private advanceCharge(): void {
    const charge = this.step?.charge;
    if (!this.step || !charge) return;
    const next = charge.aborted ? undefined : charge.queue.shift();
    if (next === undefined) {
      charge.activePlayerId = null;
      this.finishStep(false);
      return;
    }
    charge.activePlayerId = next;

    this.state.turn.movementUsed.delete(charge.activePlayerId);
    const player = this.stepPlayers(this.step.teamId).find(
      (candidate) => candidate.id === charge.activePlayerId
    );
    if (player) {
      this.eventBus.emit(GameEventNames.PlayerSelected, { player });
    }
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Charge! ${player?.playerName ?? ""} activates`
    );
  }

  public canChargeAct(playerId: string, action: ActionType): boolean {
    const charge = this.step?.charge;
    if (charge?.activePlayerId !== playerId) return false;
    if (action === "move") return true;
    if (action === "blitz") return charge.budget.blitz > 0;
    return action === "throwTeamMate" && (charge.budget.throwTeammate > 0 || charge.budget.kickTeammate > 0);
  }

  public noteChargeActionDeclared(
    action: ActionType,
    mode?: "throw" | "kick"
  ): void {
    const charge = this.step?.charge;
    if (!charge) return;
    if (action === "blitz" && charge.budget.blitz > 0) charge.budget.blitz--;
    if (action === "throwTeamMate") {
      if (mode === "kick" && charge.budget.kickTeammate > 0) {
        charge.budget.kickTeammate--;
      } else if (charge.budget.throwTeammate > 0) {
        charge.budget.throwTeammate--;
      } else if (charge.budget.kickTeammate > 0) {
        charge.budget.kickTeammate--;
      }
    }
  }

  public noteChargeActivationEnded(playerId: string): void {
    const step = this.step;
    const charge = step?.charge;
    if (!step || charge?.activePlayerId !== playerId) return;
    const player = this.stepPlayers(step.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (player?.status !== PlayerStatus.ACTIVE) {
      charge.aborted = true;
    }
    this.advanceCharge();
  }

  public noteChargePlayerDown(playerId: string): void {
    const charge = this.step?.charge;
    if (charge?.activePlayerId !== playerId) return;
    charge.aborted = true;
    charge.queue = [];
    charge.activePlayerId = null;
    this.finishStep(false);
  }

  public isChargeActive(): boolean {
    return !!this.step?.charge?.activePlayerId;
  }

  public isStepOpen(): boolean {
    return this.step !== null;
  }
}
