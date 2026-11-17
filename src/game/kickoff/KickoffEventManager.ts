/**
 * KickoffEventManager — rolls the Sevens kickoff table and resolves every
 * event: immediate effects through the resolver table, and interactive
 * events (Alert Defence, High Kick, Quick Snap, Charge!) through a pending
 * step the kickoff awaits.
 *
 * The step is engine-owned state (NOT a DecisionService decision), so
 * nested decisions — a re-roll offer during a Charge! block — still work.
 * The headless protocol surfaces the open step as a pending decision
 * variant; UI and online coaches act through GameService methods.
 */

import {
  kickoffMomentDetail,
  kickoffOutcomeLine,
  kickoffRevealLine,
} from "./kickoffMoment";
import { DelayProvider, waitAtMost } from "../core/GameFlowManager";
import {
  awaitPresentation,
  nextPresentationId,
} from "../presentation/presentationGate";
import { whenMomentsComplete } from "../presentation/momentQueue";
import {
  DIE_LANDING_TIMEOUT_MS,
  DiceWatch,
} from "../presentation/diceWatch";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames, ActionType } from "../../types/events";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { DiceController } from "../controllers/DiceController";
import { WeatherManager } from "../managers/WeatherManager";
import { GameConfig } from "@/config/GameConfig";
import { SetupValidator } from "../validators/SetupValidator";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
  KickoffEventOutcome,
  grantEffect,
  isOneSquareMoveEvent,
  kickoffEventOwner,
} from "./kickoffEvents";
import { kickoffEventResolvers } from "./kickoffResolvers";

export interface ChargeBudget {
  blitz: number;
  throwTeammate: number;
  kickTeammate: number;
}

export interface KickoffEventStepState {
  event: KickoffEvent;
  /** The coach who may act. */
  teamId: string;
  selectionLimit: number;
  selectedPlayerIds: string[];
  /** Alert Defence / Quick Snap: players who already made their one-square move. */
  movedPlayerIds: string[];
  /**
   * Legacy serialized field retained for protocol compatibility. No event
   * populates it since Alert Defence replaced Solid Defence's re-set-up.
   */
  awaitingPlacement: string[];
  /** High Kick: the ball's landing square. */
  landingSquare?: { x: number; y: number };
  /** Charge!: activation sequence state. */
  charge?: {
    queue: string[];
    budget: ChargeBudget;
    activePlayerId: string | null;
    aborted: boolean;
  };
}

/**
 * How long the Kick-off Table waits for its coach to press Roll. Only a
 * screen with a coach waits: headless play and a replay never do, and an
 * online page answers at once (KickoffTableDialog).
 */
const ROLL_READY_GUARD_MS = 30 * 60_000;
/** The table dialog shows its dice and the result row, at the most. */
const TABLE_SHOWN_GUARD_MS = DIE_LANDING_TIMEOUT_MS + 4000;
/** How long each of an event's own rolls reads before the next one. */
const STEP_READ_MS = 900;

interface StepResolver {
  (skipped: boolean): void;
}

export class KickoffEventManager {
  private step: KickoffEventStepState | null = null;
  private stepResolver: StepResolver | null = null;
  /** Changing Weather → Perfect Conditions: the kick scatters in the air. */
  private weatherScatterPending = false;
  private lastEvent: KickoffEvent | null = null;
  /** From the table roll until its outcome is stored: never save then. */
  private resolving = false;
  private chargePreviousActiveTeamId: string | null = null;
  private readonly setupValidator = new SetupValidator();

  private readonly resolvers: ReturnType<typeof kickoffEventResolvers>;

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private diceController: DiceController,
    weatherManager: WeatherManager,
    callbacks: {
      getTurnNumber: (teamId: string) => number;
      moveTurnMarkers: (delta: number) => void;
    },
    private readonly delay: DelayProvider
  ) {
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

  /**
   * A visual barrier between one kick-off roll and the next: the dice
   * thrown so far land and their result reads. Never changes state or
   * RNG order; headless and replays pass straight through.
   */
  private async diceShown(): Promise<void> {
    await waitAtMost(
      this.delay,
      DiceWatch.shared(this.eventBus).landed(),
      TABLE_SHOWN_GUARD_MS
    );
    await this.delay(STEP_READ_MS);
  }

  // ===== Roll orchestration =====

  /**
   * Roll the table and resolve everything that happens before the kick:
   * immediate effects, then (for pre-kick interactive events) the step.
   * High Kick is deferred to resolveHighKickStep (needs the landing square).
   */
  public async rollAndResolve(isTeam1Kicking: boolean): Promise<void> {
    // A drive's kickoff table resolves exactly once. A stale re-entry into
    // ROLL_KICKOFF (page refresh, restored save, or the KICKOFF phase being
    // re-entered) must reproduce the already-resolved event and outcome
    // rather than rolling — and, critically, must not re-apply resolver
    // effects (bribes, free re-rolls, etc.) a second time. Re-opening the
    // original interactive step is out of scope here: that step's in-flight
    // progress cannot be recovered across a refresh anyway, so a replay only
    // re-announces the result and lets the kick land normally.
    const existing = this.state.kickoffResolution;
    if (existing) {
      this.lastEvent = existing.event;
      // A Charge! saved mid-sequence ends here with its step, so its re-roll
      // window must close too or the drive's first turn loses its re-roll
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

    // The coach rolls when ready, in the table dialog, which shows the
    // dice land and the result row before the event's own banner
    const readyId = nextPresentationId("kickoff-ready");
    const rolled = awaitPresentation(
      this.eventBus,
      this.delay,
      readyId,
      ROLL_READY_GUARD_MS
    );
    this.eventBus.emit(GameEventNames.KickoffTableReady, {
      presentationId: readyId,
      kickingTeamId: kickingTeam.id,
    });
    await rolled;
    this.resolving = true;
    const roll = this.diceController.roll2D6(
      KICKOFF_TABLE_ROLL,
      kickingTeam.id
    );
    const event = KICKOFF_TABLE[roll];
    this.lastEvent = event;
    const shownId = nextPresentationId("kickoff-table");
    const shown = awaitPresentation(
      this.eventBus,
      this.delay,
      shownId,
      TABLE_SHOWN_GUARD_MS
    );
    this.eventBus.emit(GameEventNames.KickoffTableRolled, {
      presentationId: shownId,
      roll,
      event,
    });
    await shown;

    // The event's name first, and what its next dice decide
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "kickoff-result",
      headline: event,
      subtitle: kickoffRevealLine(event, kickingTeam, receivingTeam),
    });
    await whenMomentsComplete(this.eventBus);

    const outcome: KickoffEventOutcome = {
      event,
      meaning: KICKOFF_EVENT_MEANING[event],
      perTeam: {},
    };
    await this.resolvers[event]({
      isTeam1Kicking,
      kickingTeam,
      receivingTeam,
      outcome,
    });
    if (INTERACTIVE_KICKOFF_EVENTS.has(event)) {
      const ownerTeamId = kickoffEventOwner(
        event,
        kickingTeam.id,
        receivingTeam.id
      );
      grantEffect(outcome, ownerTeamId, `may resolve the ${event} coach step`);
    }

    this.state.kickoffResolution = { roll, event, meaning: outcome.meaning, outcome };
    this.resolving = false;

    this.eventBus.emit(GameEventNames.KickoffResult, {
      roll,
      event,
      meaning: outcome.meaning,
      outcome,
    });

    // Then what the event's own dice decided
    const decided = kickoffOutcomeLine(outcome, kickingTeam, receivingTeam);
    if (decided) {
      this.eventBus.emit(GameEventNames.UI_Announce, {
        kind: "kickoff-result",
        headline: event,
        subtitle: decided,
      });
    }

    if (
      INTERACTIVE_KICKOFF_EVENTS.has(event) &&
      event !== KickoffEvent.HIGH_KICK
    ) {
      const ownerTeamId = kickoffEventOwner(
        event,
        kickingTeam.id,
        receivingTeam.id
      );
      const selectionLimit =
        this.diceController.rollD3(
          `${event}: D3 + 1 players`,
          ownerTeamId
        ) + 1;
      await this.openStep(event, ownerTeamId, selectionLimit);
    }
  }

  /**
   * The kick-off result banner: the event, what it does and who it
   * favours. An interactive event opens its step at once, and the step's
   * own overlay presents it instead.
   */
  private announceMoment(
    outcome: KickoffEventOutcome,
    isTeam1Kicking: boolean
  ): void {
    if (INTERACTIVE_KICKOFF_EVENTS.has(outcome.event)) return;
    this.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "kickoff-result",
      headline: outcome.event,
      subtitle: kickoffMomentDetail(
        outcome,
        isTeam1Kicking ? this.team1 : this.team2,
        isTeam1Kicking ? this.team2 : this.team1
      ),
    });
  }

  /** The table is rolled and its outcome not yet stored. */
  public isResolving(): boolean {
    return this.resolving;
  }

  /** The event rolled for the in-flight kick (null outside kickoff). */
  public getLastEvent(): KickoffEvent | null {
    return this.lastEvent;
  }

  /** High Kick: landing square known, ball not yet down — offer the step. */
  public async resolveHighKickStep(
    isTeam1Kicking: boolean,
    landingSquare: { x: number; y: number }
  ): Promise<void> {
    if (this.lastEvent !== KickoffEvent.HIGH_KICK) return;
    // Sevens K5: only a ball landing between the receiving End Zone and
    // Line of Scrimmage, never in No Man's Land.
    const { x, y } = landingSquare;
    if (!this.setupValidator.isInSetupZone(x, y, !isTeam1Kicking)) {
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        "High Kick: the ball lands in No Man's Land, so no player may be placed under it."
      );
      return;
    }
    // A square holds one player: if someone already stands there, nobody
    // can be placed under the ball.
    const holder = [...this.team1.players, ...this.team2.players].find(
      (player) => player.gridPosition?.x === x && player.gridPosition?.y === y
    );
    if (holder) {
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        `High Kick: ${holder.playerName} already stands where the ball will land, so no one else may be placed there.`
      );
      return;
    }
    const receivingTeamId = (isTeam1Kicking ? this.team2 : this.team1).id;
    await this.openStep(KickoffEvent.HIGH_KICK, receivingTeamId, 1, landingSquare);
  }

  /** Changing Weather rolled Perfect Conditions: scatter the ball in the air. */
  public consumeWeatherScatterPending(): boolean {
    const pending = this.weatherScatterPending;
    this.weatherScatterPending = false;
    return pending;
  }

  // ===== Interactive step =====

  public getStep(): KickoffEventStepState | null {
    if (!this.step) return null;
    return {
      ...this.step,
      selectedPlayerIds: [...this.step.selectedPlayerIds],
      movedPlayerIds: [...this.step.movedPlayerIds],
      awaitingPlacement: [...this.step.awaitingPlacement],
      charge: this.step.charge
        ? { ...this.step.charge, queue: [...this.step.charge.queue] }
        : undefined,
    };
  }

  private openStep(
    event: KickoffEvent,
    teamId: string,
    selectionLimit: number,
    landingSquare?: { x: number; y: number }
  ): Promise<boolean> {
    this.step = {
      event,
      teamId,
      selectionLimit,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
      landingSquare,
    };
    return new Promise((resolve) => {
      this.stepResolver = resolve;
      this.eventBus.emit(GameEventNames.KickoffEventStepStarted, {
        event,
        teamId,
        selectionLimit,
        landingSquare,
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

  /** The team whose coach may act right now (null when no step is open). */
  public getActingTeamId(): string | null {
    return this.step?.teamId ?? null;
  }

  /** Open = Standing on the pitch and not Marked by a Standing opponent. */
  private isOpen(player: Player): boolean {
    if (!player.gridPosition || player.status !== PlayerStatus.ACTIVE) {
      return false;
    }
    const opponents =
      player.teamId === this.team1.id ? this.team2.players : this.team1.players;
    return !opponents.some(
      (opponent) =>
        opponent.status === PlayerStatus.ACTIVE &&
        opponent.gridPosition &&
        Math.max(
          Math.abs(opponent.gridPosition.x - player.gridPosition!.x),
          Math.abs(opponent.gridPosition.y - player.gridPosition!.y)
        ) === 1
    );
  }

  private stepPlayers(teamId: string): Player[] {
    const team = teamId === this.team1.id ? this.team1 : this.team2;
    return team.players;
  }

  /** Toggle a player's selection (Open players of the owning team only). */
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

  /**
   * Alert Defence / Quick Snap: move a selected player exactly one square
   * (no dodge, any direction incl. No Man's Land and the opposition half,
   * not into occupation or off-pitch, not marked as having acted).
   */
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
      return false; // exactly one square
    }
    if (
      x < 0 ||
      x >= GameConfig.PITCH_WIDTH ||
      y < 0 ||
      y >= GameConfig.PITCH_HEIGHT
    ) {
      return false;
    }
    const occupied = [...this.team1.players, ...this.team2.players].some(
      (other) =>
        other.id !== playerId &&
        other.gridPosition &&
        other.gridPosition.x === x &&
        other.gridPosition.y === y
    );
    if (occupied) return false;

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

  /** High Kick: place the selected Open receiver into the landing square. */
  public placePlayer(playerId: string, x: number, y: number): boolean {
    if (!this.step) return false;
    const player = this.stepPlayers(this.step.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (!player) return false;

    if (this.step.event === KickoffEvent.HIGH_KICK) {
      const landing = this.step.landingSquare;
      if (!landing || x !== landing.x || y !== landing.y) return false;
      if (!this.step.selectedPlayerIds.includes(playerId)) return false;
      const occupied = [...this.team1.players, ...this.team2.players].some(
        (other) =>
          other.id !== playerId &&
          other.gridPosition?.x === x &&
          other.gridPosition?.y === y
      );
      if (occupied) return false;
      player.gridPosition = { x, y };
      this.eventBus.emit(GameEventNames.PlayerPlaced, { playerId, x, y });
      this.finishStep(false);
      return true;
    }

    return false;
  }

  /** Confirm the step: applies whatever requires confirmation. */
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
    // Alert Defence / Quick Snap / High Kick: moves already applied as issued.
    this.finishStep(false);
    return true;
  }

  /** Skip the step (only while nothing irreversible is in flight). */
  public skipStep(): boolean {
    if (!this.step) return false;
    if (this.step.event === KickoffEvent.CHARGE && this.step.charge) {
      // Charge already running: skipping means ending the sequence early.
      this.step.charge.queue = [];
      this.step.charge.activePlayerId = null;
      this.finishStep(false);
      return true;
    }
    this.finishStep(true);
    return true;
  }

  // ===== Charge! =====

  /** The player currently up in the Charge! sequence. */
  public getChargeActivePlayerId(): string | null {
    return this.step?.charge?.activePlayerId ?? null;
  }

  public getChargeBudget(): ChargeBudget | null {
    return this.step?.charge?.budget ?? null;
  }

  /** Advance to the next selected player, or end the step. */
  private advanceCharge(): void {
    const charge = this.step?.charge;
    if (!this.step || !charge) return;
    if (charge.aborted || charge.queue.length === 0) {
      charge.activePlayerId = null;
      this.finishStep(false);
      return;
    }
    charge.activePlayerId = charge.queue.shift()!;
    // A free activation starts with the whole MA. The turn ledger still
    // holds the turn before the kick-off (a scorer's squares, say); the
    // drive's first turn starts a fresh one, so nothing else reads it.
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

  /**
   * Can this player act in the Charge! sequence, and with which action?
   * Move is always free; Blitz / Throw / Kick Team-mate each once per
   * sequence while budget remains.
   */
  public canChargeAct(playerId: string, action: ActionType): boolean {
    const charge = this.step?.charge;
    if (!charge || charge.activePlayerId !== playerId) return false;
    switch (action) {
      case "move":
        return true;
      case "blitz":
        return charge.budget.blitz > 0;
      case "throwTeamMate":
        return (
          charge.budget.throwTeammate > 0 || charge.budget.kickTeammate > 0
        );
      default:
        return false;
    }
  }

  /** Spend the budget for an action just declared. */
  public noteChargeActionDeclared(action: ActionType, mode?: "throw" | "kick"): void {
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

  /**
   * The acting Charge! player's activation is over: end the whole sequence
   * if they went down, otherwise advance. Never marks anyone as having acted.
   */
  public noteChargeActivationEnded(playerId: string): void {
    const step = this.step;
    const charge = step?.charge;
    if (!step || !charge || charge.activePlayerId !== playerId) return;
    const player = this.stepPlayers(step.teamId).find(
      (candidate) => candidate.id === playerId
    );
    if (!player || player.status !== PlayerStatus.ACTIVE) {
      charge.aborted = true; // fell over or was knocked down: the Charge ends
    }
    this.advanceCharge();
  }

  /** A Charge! player went down mid-action: abort immediately. */
  public noteChargePlayerDown(playerId: string): void {
    const charge = this.step?.charge;
    if (!charge || charge.activePlayerId !== playerId) return;
    charge.aborted = true;
    charge.queue = [];
    charge.activePlayerId = null;
    this.finishStep(false);
  }

  /** True while a Charge! sequence is running (turnover suppression etc.). */
  public isChargeActive(): boolean {
    return !!this.step?.charge?.activePlayerId;
  }

  /** True while any interactive step is open. */
  public isStepOpen(): boolean {
    return this.step !== null;
  }
}
