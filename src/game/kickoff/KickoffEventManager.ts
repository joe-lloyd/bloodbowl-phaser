/**
 * KickoffEventManager — rolls the Sevens kickoff table and resolves every
 * event: immediate effects through the resolver table, and interactive
 * events (Solid Defence, High Kick, Quick Snap, Charge!) through a pending
 * step the kickoff awaits.
 *
 * The step is engine-owned state (NOT a DecisionService decision), so
 * nested decisions — a re-roll offer during a Charge! block — still work.
 * The headless protocol surfaces the open step as a pending decision
 * variant; UI and online coaches act through GameService methods.
 */

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
  KickoffEvent,
  KickoffEventOutcome,
  grantEffect,
  kickoffEventOwner,
} from "./kickoffEvents";
import {
  getDriveEffects,
} from "./driveEffects";

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
  /** Quick Snap: players who already made their one-square move. */
  movedPlayerIds: string[];
  /**
   * Legacy serialized field retained for protocol compatibility. Solid
   * Defence now redeploys directly on the pitch and never populates it.
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

interface StepResolver {
  (skipped: boolean): void;
}

/** Context handed to each resolver: teams + the outcome being built. */
export interface KickoffEventResolverContext {
  isTeam1Kicking: boolean;
  kickingTeam: Team;
  receivingTeam: Team;
  outcome: KickoffEventOutcome;
}

type KickoffEventResolver = (ctx: KickoffEventResolverContext) => void;

/** Weather-table results 4-10 are Perfect Conditions (logged as "Nice"). */
export const PERFECT_CONDITIONS = "Nice";

export class KickoffEventManager {
  private step: KickoffEventStepState | null = null;
  private stepResolver: StepResolver | null = null;
  /** Changing Weather → Perfect Conditions: the kick scatters in the air. */
  private weatherScatterPending = false;
  private lastEvent: KickoffEvent | null = null;
  private chargePreviousActiveTeamId: string | null = null;
  private readonly setupValidator = new SetupValidator();

  private readonly resolvers: Record<KickoffEvent, KickoffEventResolver>;

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private diceController: DiceController,
    private weatherManager: WeatherManager,
    private callbacks: {
      getTurnNumber: (teamId: string) => number;
      moveTurnMarkers: (delta: number) => void;
    }
  ) {
    this.resolvers = {
      [KickoffEvent.GET_THE_REF]: (ctx) => this.resolveGetTheRef(ctx),
      [KickoffEvent.TIME_OUT]: (ctx) => this.resolveTimeOut(ctx),
      [KickoffEvent.SOLID_DEFENCE]: () => {},
      [KickoffEvent.HIGH_KICK]: () => {},
      [KickoffEvent.CHEERING_FANS]: (ctx) => this.resolveCheeringFans(ctx),
      [KickoffEvent.BRILLIANT_COACHING]: (ctx) =>
        this.resolveBrilliantCoaching(ctx),
      [KickoffEvent.CHANGING_WEATHER]: (ctx) => this.resolveChangingWeather(ctx),
      [KickoffEvent.QUICK_SNAP]: () => {},
      [KickoffEvent.CHARGE]: () => {},
      [KickoffEvent.DODGY_SNACK]: (ctx) => this.resolveDodgySnack(ctx),
      [KickoffEvent.PITCH_INVASION]: (ctx) => this.resolvePitchInvasion(ctx),
    };
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
      this.eventBus.emit(GameEventNames.KickoffResult, {
        roll: existing.roll,
        event: existing.event,
        meaning: existing.meaning,
        outcome: existing.outcome,
      });
      return;
    }

    const roll = this.diceController.roll2D6("Kickoff Event");
    const event = KICKOFF_TABLE[roll];
    this.lastEvent = event;

    const kickingTeam = isTeam1Kicking ? this.team1 : this.team2;
    const receivingTeam = isTeam1Kicking ? this.team2 : this.team1;
    const outcome: KickoffEventOutcome = {
      event,
      meaning: KICKOFF_EVENT_MEANING[event],
      perTeam: {},
    };
    this.resolvers[event]({
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

    this.eventBus.emit(GameEventNames.KickoffResult, {
      roll,
      event,
      meaning: outcome.meaning,
      outcome,
    });

    if (
      INTERACTIVE_KICKOFF_EVENTS.has(event) &&
      event !== KickoffEvent.HIGH_KICK
    ) {
      const ownerTeamId = kickoffEventOwner(
        event,
        kickingTeam.id,
        receivingTeam.id
      );
      const selectionLimit = this.diceController.rollD3(`${event} limit`) + 1;
      await this.openStep(event, ownerTeamId, selectionLimit);
    }
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
    const receivingTeamId = (isTeam1Kicking ? this.team2 : this.team1).id;
    await this.openStep(KickoffEvent.HIGH_KICK, receivingTeamId, 1, landingSquare);
  }

  /** Changing Weather rolled Perfect Conditions: scatter the ball in the air. */
  public consumeWeatherScatterPending(): boolean {
    const pending = this.weatherScatterPending;
    this.weatherScatterPending = false;
    return pending;
  }

  // ===== Non-interactive resolvers =====

  private resolveGetTheRef(ctx: KickoffEventResolverContext): void {
    this.state.bribes ??= {};
    for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
      this.state.bribes[team.id] = (this.state.bribes[team.id] ?? 0) + 1;
      grantEffect(ctx.outcome, team.id, "gains a Bribe (lost at full time)");
      this.eventBus.emit(GameEventNames.DriveEffectGranted, {
        teamId: team.id,
        effect: "bribe",
        detail: "one Bribe, usable until the end of the match",
      });
    }
  }

  private resolveTimeOut(ctx: KickoffEventResolverContext): void {
    const kickingTurn = this.callbacks.getTurnNumber(ctx.kickingTeam.id);
    // Markers on 4-6 move back one (the half gets longer); otherwise forward.
    const delta = kickingTurn >= 4 && kickingTurn <= 6 ? -1 : 1;
    this.callbacks.moveTurnMarkers(delta);
    for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
      grantEffect(
        ctx.outcome,
        team.id,
        delta < 0 ? "turn marker moves back one" : "turn marker moves forward one"
      );
    }
  }

  /** Shared D6 + staff roll-off: returns the winning team ids (both on a tie). */
  private staffRollOff(
    label: string,
    staffOf: (team: Team) => number,
    teams: Team[]
  ): { winners: Team[]; totals: Record<string, number> } {
    const totals: Record<string, number> = {};
    for (const team of teams) {
      const modifier = staffOf(team);
      const roll = this.diceController.rollD6(
        `${label} — ${team.name}`,
        team.id
      );
      totals[team.id] = roll + modifier;
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        `${label} — ${team.name}: D6 ${roll} + ${modifier} = ${totals[team.id]}`
      );
    }
    const [a, b] = teams;
    const winners =
      totals[a.id] === totals[b.id]
        ? [a, b]
        : [totals[a.id] > totals[b.id] ? a : b];
    return { winners, totals };
  }

  /** Shared D6 + modifier roll-off where the lowest total is afflicted. */
  private lowRollOff(
    label: string,
    modifierOf: (team: Team) => number,
    teams: Team[]
  ): { afflicted: Team[]; totals: Record<string, number> } {
    const totals: Record<string, number> = {};
    for (const team of teams) {
      const modifier = modifierOf(team);
      const roll = this.diceController.rollD6(
        `${label} — ${team.name}`,
        team.id
      );
      totals[team.id] = roll + modifier;
      this.eventBus.emit(
        GameEventNames.UI_GameLog,
        `${label} — ${team.name}: D6 ${roll} + ${modifier} = ${totals[team.id]}`
      );
    }
    const [a, b] = teams;
    const afflicted =
      totals[a.id] === totals[b.id]
        ? [a, b]
        : [totals[a.id] < totals[b.id] ? a : b];
    return { afflicted, totals };
  }

  private resolveCheeringFans(ctx: KickoffEventResolverContext): void {
    const { winners } = this.staffRollOff(
      "Cheering Fans",
      (team) => team.cheerleaders,
      [ctx.kickingTeam, ctx.receivingTeam]
    );
    for (const team of winners) {
      getDriveEffects(this.state).owedAssists[team.id] = {
        turn: this.callbacks.getTurnNumber(team.id) + 1,
        used: false,
      };
      grantEffect(
        ctx.outcome,
        team.id,
        "owes an extra Offensive Assist to the first Block of its next turn"
      );
      this.eventBus.emit(GameEventNames.DriveEffectGranted, {
        teamId: team.id,
        effect: "offensive-assist",
        detail: "+1 Offensive Assist on the first Block of your next turn",
      });
    }
  }

  private resolveBrilliantCoaching(ctx: KickoffEventResolverContext): void {
    const { winners } = this.staffRollOff(
      "Brilliant Coaching",
      (team) => team.coaches,
      [ctx.kickingTeam, ctx.receivingTeam]
    );
    for (const team of winners) {
      const effects = getDriveEffects(this.state);
      effects.freeRerolls[team.id] = (effects.freeRerolls[team.id] ?? 0) + 1;
      grantEffect(ctx.outcome, team.id, "gains a free team re-roll for this drive");
      this.eventBus.emit(GameEventNames.DriveEffectGranted, {
        teamId: team.id,
        effect: "free-reroll",
        detail: "one free team re-roll for this drive",
      });
    }
  }

  private resolveChangingWeather(ctx: KickoffEventResolverContext): void {
    const weather = this.weatherManager.rollWeather();
    const note =
      weather === PERFECT_CONDITIONS
        ? "weather becomes Perfect Conditions — the kick Scatters (3) in the air"
        : `weather becomes ${weather}`;
    for (const team of [ctx.kickingTeam, ctx.receivingTeam]) {
      grantEffect(ctx.outcome, team.id, note);
    }
    if (weather === PERFECT_CONDITIONS) {
      this.weatherScatterPending = true;
    }
  }

  /** Random player of `team` currently on the pitch (D6-indexed, logged). */
  private randomPitchPlayer(team: Team, label: string): Player | undefined {
    const onPitch = team.players.filter((player) => !!player.gridPosition);
    if (onPitch.length === 0) return undefined;
    // Rejection sampling over a D16 keeps every roster slot equally likely.
    const acceptedRange = Math.floor(16 / onPitch.length) * onPitch.length;
    let roll: number;
    do {
      roll = this.diceController.rollD16(
        `${label} — ${team.name}`,
        team.id
      );
    } while (roll > acceptedRange);
    const index = (roll - 1) % onPitch.length;
    return onPitch[index];
  }

  private resolveDodgySnack(ctx: KickoffEventResolverContext): void {
    const { afflicted } = this.lowRollOff(
      "Dodgy Snack",
      () => 0,
      [ctx.kickingTeam, ctx.receivingTeam]
    );
    for (const team of afflicted) {
      const player = this.randomPitchPlayer(team, "Dodgy Snack player");
      if (!player) continue;
      const roll = this.diceController.rollD6(
        `Dodgy Snack — ${team.name}: ${player.playerName}`,
        team.id
      );
      if (roll === 1) {
        getDriveEffects(this.state).playerModifiers[player.id] = {
          confinedToReserves: true,
        };
        this.removeFromPitch(player);
        grantEffect(
          ctx.outcome,
          team.id,
          `${player.playerName} is confined to the Reserves for the drive`
        );
      } else {
        getDriveEffects(this.state).playerModifiers[player.id] = {
          maModifier: -1,
          avModifier: -1,
        };
        grantEffect(
          ctx.outcome,
          team.id,
          `${player.playerName} suffers -1 MA and -1 AV for the drive`
        );
      }
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      this.eventBus.emit(GameEventNames.DriveEffectGranted, {
        teamId: team.id,
        effect: "dodgy-snack",
        detail:
          roll === 1
            ? `${player.playerName} is confined to Reserves for the drive`
            : `${player.playerName} has -1 MA and -1 AV for the drive`,
      });
    }
  }

  private resolvePitchInvasion(ctx: KickoffEventResolverContext): void {
    const { afflicted } = this.lowRollOff(
      "Pitch Invasion",
      (team) => team.dedicatedFans,
      [ctx.kickingTeam, ctx.receivingTeam]
    );
    for (const team of afflicted) {
      const player = this.randomPitchPlayer(team, "Pitch Invasion player");
      if (!player) continue;
      // Placed Prone and Stunned (recovers at that team's next turn start).
      player.status = PlayerStatus.STUNNED;
      this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
        playerId: player.id,
      });
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      grantEffect(
        ctx.outcome,
        team.id,
        `${player.playerName} is Placed Prone and Stunned by the crowd`
      );
    }
  }

  /** Lift a player off the pitch into the Reserves box (visuals via events). */
  private removeFromPitch(player: Player): void {
    player.gridPosition = undefined;
    player.status = PlayerStatus.RESERVE;
    this.eventBus.emit(GameEventNames.PlayerRemoved, player.id);
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
    // Solid Defence is a single direct drag. Merely clicking a player must
    // never select/remove them or spend the redeployment allowance.
    if (this.step.event === KickoffEvent.SOLID_DEFENCE) return false;
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
   * Quick Snap: move a selected player exactly one square (no dodge, any
   * direction incl. the opposition half, not into occupation or off-pitch,
   * not marked as having acted).
   */
  public movePlayer(playerId: string, x: number, y: number): boolean {
    if (!this.step || this.step.event !== KickoffEvent.QUICK_SNAP) return false;
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

  /**
   * High Kick: place the selected Open receiver into the landing square.
   * Solid Defence: drag an Open player directly from its current square to a
   * legal setup square without ever staging it in Reserves.
   */
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

    if (this.step.event === KickoffEvent.SOLID_DEFENCE) {
      if (this.step.movedPlayerIds.includes(playerId)) return false;
      if (this.step.selectedPlayerIds.length >= this.step.selectionLimit) {
        return false;
      }
      if (!this.isOpen(player) || !player.gridPosition) return false;
      const from = { ...player.gridPosition };
      if (from.x === x && from.y === y) return false;
      const isTeam1 = this.step.teamId === this.team1.id;
      if (!this.setupValidator.isInSetupZone(x, y, isTeam1)) return false;
      const occupied = [...this.team1.players, ...this.team2.players].some(
        (other) =>
          other.id !== playerId &&
          other.gridPosition &&
          other.gridPosition.x === x &&
          other.gridPosition.y === y
      );
      if (occupied) return false;
      player.gridPosition = { x, y };
      this.step.selectedPlayerIds.push(playerId);
      this.step.movedPlayerIds.push(playerId);
      this.eventBus.emit(GameEventNames.PlayerPlaced, { playerId, x, y });
      return true;
    }

    return false;
  }

  /** Confirm the step: applies whatever requires confirmation. */
  public confirmStep(): boolean {
    if (!this.step) return false;
    if (this.step.event === KickoffEvent.SOLID_DEFENCE) {
      this.finishStep(this.step.selectedPlayerIds.length === 0);
      return true;
    }
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
      this.advanceCharge();
      return true;
    }
    // Quick Snap / High Kick: moves already applied as issued.
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
