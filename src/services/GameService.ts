/**
 * GameService - Core game logic service
 *
 * Pure TypeScript implementation with no Phaser dependencies.
 * Manages game state, phase transitions, and turn management.
 */

import { IGameService } from "./interfaces/IGameService.js";
import { IEventBus } from "./EventBus.js";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { ActionType, GameEventNames } from "../types/events";
import { Team } from "@/types/Team";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
  removeCondition,
  hasTackleZone,
} from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { BlockResult, BlockResolutionService } from "./BlockResolutionService";
import { ActivationValidator } from "../game/validators/ActivationValidator.js";

import { SetupManager } from "../game/managers/SetupManager";
import { TurnManager, TurnManagerState } from "../game/managers/TurnManager";
import { BallManager } from "../game/managers/BallManager";
import { MovementManager } from "../game/managers/MovementManager";
import { BlockManager } from "../game/managers/BlockManager";
import { WeatherManager } from "../game/managers/WeatherManager";

import { PlayerActionManager } from "../game/managers/PlayerActionManager";
import { PassController } from "../game/controllers/PassController";
import { CatchController } from "../game/controllers/CatchController";
import { BallMovementController } from "../game/controllers/BallMovementController";
import { DiceController } from "../game/controllers/DiceController";
import { ArmourController } from "../game/controllers/ArmourController";
import { InjuryController } from "../game/controllers/InjuryController";

import {
  GameFlowManager,
  DelayProvider,
  realTimeDelay,
} from "@/game/core/GameFlowManager";
import { PassOperation } from "@/game/operations/PassOperation";
import { HandoffOperation } from "@/game/operations/HandoffOperation";
import { isLegalHandoffTarget } from "@/game/rules/handoff";
import {
  ClearPitchOperation,
  KORecoveryOperation,
  StartNextDriveOperation,
  TouchdownCelebrationOperation,
} from "@/game/operations/EndDriveOperations";
import {
  assertSinglePlayerLocation,
  movePlayerToBox,
} from "@/game/rules/playerLocation";
import { isInEndZone } from "@/game/elements/GridUtils";
import { GameConfig } from "@/config/GameConfig";
import { BounceOperation } from "@/game/operations/BounceOperation";
import { ArmourOperation } from "@/game/operations/ArmourOperation";
import { ActivationGateOperation } from "@/game/operations/ActivationGateOperation";
import { BreatheFireOperation } from "@/game/operations/BreatheFireOperation";
import { ProjectileVomitOperation } from "@/game/operations/ProjectileVomitOperation";
import { HypnoticGazeOperation } from "@/game/operations/HypnoticGazeOperation";
import { ChompOperation } from "@/game/operations/ChompOperation";
import { ChainsawAttackOperation } from "@/game/operations/ChainsawAttackOperation";
import { FoulController } from "@/game/controllers/FoulController";
import { FoulOperation } from "@/game/operations/FoulOperation";
import { StabOperation } from "@/game/operations/StabOperation";
import { PuntOperation } from "@/game/operations/PuntOperation";
import { ThrowTeammateOperation } from "@/game/operations/ThrowTeammateOperation";
import { BombardierOperation } from "@/game/operations/BombardierOperation";
import { BallAndChainOperation } from "@/game/operations/BallAndChainOperation";
import { IRNGService } from "./rng/RNGService.js";
import {
  RerollArbiter,
  DecisionService,
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  withRerollOffer,
  FollowUpContext,
  foldActionDeclared,
  ActionDeclaredContext,
  foldTurnEnding,
  TurnEndingContext,
  SkillRegistry,
} from "@/game/skills";
import { moveAllowance } from "@/game/skills/movement";
import { RerollSource } from "@/types/decisions";
import { KickoffEventManager } from "@/game/kickoff/KickoffEventManager";
import {
  driveEffectsEmpty,
  emptyDriveEffects,
  getDriveEffects,
} from "@/game/kickoff/driveEffects";
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
  blockReplacementForDirectAction,
} from "@/types/BlockReplacement";
import {
  hasReachableBlockReplacementTarget,
  isLegalBlockReplacementTarget,
  legalBlockReplacementTargets,
} from "@/game/rules/blockReplacements";

export class GameService implements IGameService {
  private state: GameState;
  private team1: Team;
  private team2: Team;

  // Managers
  private setupManager: SetupManager;
  private turnManager: TurnManager;
  private ballManager: BallManager;
  private movementManager: MovementManager;
  private blockManager: BlockManager;
  private weatherService: WeatherManager;

  /**
   * Factory method to create a default initial state
   */
  public static createInitialState(
    team1: Team,
    team2: Team,
    startingPhase: GamePhase = GamePhase.SANDBOX_IDLE,
    startingSubPhase?: SubPhase
  ): GameState {
    return {
      phase: startingPhase,
      subPhase: startingSubPhase,
      activeTeamId: null,
      turn: {
        teamId: "",
        turnNumber: 0,
        isHalf2: false,
        activatedPlayerIds: new Set(),
        hasBlitzed: false,
        hasPassed: false,
        hasHandedOff: false,
        hasFouled: false,
        movementUsed: new Map(),
      },
      score: {
        [team1.id]: 0,
        [team2.id]: 0,
      },
      weather: "Nice",
      ballPosition: null, // Ball not placed yet
      activePlayer: null,
      coachesEjected: [],
      setup: undefined,
    };
  }
  private playerActionManager: PlayerActionManager;
  private decisionService: DecisionService;
  private rerollArbiter: RerollArbiter;
  private kickoffEventManager!: KickoffEventManager;
  private passController: PassController;
  private catchController: CatchController;
  public diceController: DiceController;
  private armourController: ArmourController;
  private injuryController: InjuryController;
  private foulController: FoulController;

  // Game Flow Manager
  public flowManager: GameFlowManager;

  // Validators
  private activationValidator: ActivationValidator = new ActivationValidator();

  constructor(
    private eventBus: IEventBus,
    team1: Team,
    team2: Team,
    rngService: IRNGService,
    blockResolutionService: BlockResolutionService,
    initialState?: GameState,
    private delay: DelayProvider = realTimeDelay
  ) {
    this.team1 = team1;
    this.team2 = team2;

    this.state = initialState || GameService.createInitialState(team1, team2);

    // If starting a fresh game (no initial state), ensure teams are clean
    if (!initialState) {
      SetupManager.sanitizeTeam(team1);
      SetupManager.sanitizeTeam(team2);
    }

    // Initialize Dice Controller first
    this.diceController = new DiceController(eventBus, rngService);

    // Mid-action decision channel + reroll constraints (skill rules)
    this.decisionService = new DecisionService(eventBus);
    this.rerollArbiter = new RerollArbiter(
      this.state,
      (id) => this.getTeam(id),
      eventBus
    );

    // Initialize Flow Manager (Pass 'this' as context)
    this.flowManager = new GameFlowManager({
      gameService: this,
      eventBus: eventBus,
      delay: this.delay,
    });

    // Initialize Managers
    this.weatherService = new WeatherManager(
      eventBus,
      this.state,
      this.diceController
    );

    this.setupManager = new SetupManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.weatherService,
      {
        onKickoffRequested: () => this.startKickoff(),
      },
      this.delay
    );

    this.turnManager = new TurnManager(
      eventBus,
      this.state,
      team1,
      team2,
      {
        onPhaseChanged: (phase, subPhase) =>
          this.eventBus.emit(GameEventNames.PhaseChanged, { phase, subPhase }),
        onHalfEnded: (secondHalfKickingTeamId) =>
          this.endDrive("halftime", secondHalfKickingTeamId),
        onTurnEnding: (endingTeamId) => this.handleTurnEnding(endingTeamId),
      },
      this.delay
    );

    this.ballManager = new BallManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.weatherService,
      this.diceController,
      {
        onTurnover: (reason) => this.triggerTurnover(reason),
        onPhaseChange: (phase, subPhase) =>
          this.eventBus.emit(GameEventNames.PhaseChanged, { phase, subPhase }),
        onBallPlaced: (x, y) =>
          this.eventBus.emit(GameEventNames.BallPlaced, { x, y }),
        getFlowManager: () => this.flowManager,
        resolveKickoffEvent: (isTeam1Kicking) =>
          this.kickoffEventManager.rollAndResolve(isTeam1Kicking),
        resolveHighKickStep: (isTeam1Kicking, landingSquare) =>
          this.kickoffEventManager.resolveHighKickStep(
            isTeam1Kicking,
            landingSquare
          ),
        consumeWeatherScatterPending: () =>
          this.kickoffEventManager.consumeWeatherScatterPending(),
      },
      this.delay
    );

    this.playerActionManager = new PlayerActionManager(eventBus, this.state);

    this.kickoffEventManager = new KickoffEventManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.diceController,
      this.weatherService,
      {
        getTurnNumber: (teamId) => this.turnManager.getTurnNumber(teamId),
        moveTurnMarkers: (delta) => this.turnManager.moveTurnMarkers(delta),
      }
    );

    // Conditions expire on engine events, not in rules: Rooted ends when
    // its player is Knocked Down or Placed Prone; Chomped ends the moment
    // the chomper is no longer Marking the victim (moved, downed, pushed).
    eventBus.on(
      GameEventNames.PlayerKnockedDown,
      ({ playerId }: { playerId: string }) => {
        // A Charge! player going down aborts the whole sequence at once
        this.kickoffEventManager?.noteChargePlayerDown(playerId);
        this.onPlayerDowned(playerId);
      }
    );
    eventBus.on(GameEventNames.PlayerStatusChanged, (p: Player) => {
      if (p.status !== PlayerStatus.ACTIVE) this.onPlayerDowned(p.id);
      this.sweepChomped();
    });
    eventBus.on(GameEventNames.PlayerMoved, () => this.sweepChomped());
    eventBus.on(GameEventNames.PhaseChanged, ({ phase }) => {
      if (phase === GamePhase.GAME_OVER) {
        // Get the Ref bribes are match-scoped and never leave this match.
        this.state.bribes = {};
      }
    });
    // A Blitz's single block is tracked per activation; a fresh turn clears it.
    eventBus.on(GameEventNames.TurnStarted, () => {
      this.blitzBlockUsed.clear();
      this.puntUsedThisTurn = false;
    });

    this.passController = new PassController(
      eventBus,
      this.ballManager.movementController,
      this.diceController
    );
    this.catchController = new CatchController(eventBus, this.diceController);
    this.armourController = new ArmourController();
    this.injuryController = new InjuryController();
    this.foulController = new FoulController();

    this.movementManager = new MovementManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.diceController,
      {
        onTurnover: (reason: string) => this.triggerTurnover(reason),
        onActivationFinished: (playerId: string) =>
          this.finishActivation(playerId),
        onTouchdown: (teamId: string) => this.addTouchdown(teamId),
      }
    );

    this.blockManager = new BlockManager(
      eventBus,
      this.state,
      team1,
      team2,
      blockResolutionService,
      this.diceController,
      {
        onTurnover: (reason) => this.triggerTurnover(reason),
        getFlowManager: () => this.flowManager,
      }
    );

    // A headless/sandbox scenario may begin directly in PLAY, bypassing the
    // normal kickoff transition, so seed its half-level Leader bank here.
    if (this.state.phase === GamePhase.PLAY) {
      this.rerollArbiter.beginHalf([this.team1.id, this.team2.id]);
    }
  }

  // ===== State Queries =====

  getState(): GameState {
    return this.state;
  }

  getPhase(): GamePhase {
    return this.state.phase;
  }

  getSubPhase(): SubPhase | undefined {
    return this.state.subPhase;
  }

  getActiveTeamId(): string | null {
    return this.state.activeTeamId;
  }
  public getPassController(): PassController {
    return this.passController;
  }
  public getCatchController(): CatchController {
    return this.catchController;
  }

  public getBallMovementController(): BallMovementController {
    return this.ballManager.movementController;
  }

  public getDiceController(): DiceController {
    return this.diceController;
  }

  public getArmourController(): ArmourController {
    return this.armourController;
  }

  public getInjuryController(): InjuryController {
    return this.injuryController;
  }

  public getFoulController(): FoulController {
    return this.foulController;
  }

  public getFlowContext(): import("@/game/core/GameFlowManager").FlowContext {
    return this.flowManager.context;
  }

  public getDecisionService(): DecisionService {
    return this.decisionService;
  }

  public getRerollArbiter(): RerollArbiter {
    return this.rerollArbiter;
  }

  /** Answer a pending reroll decision (dialog or protocol reply). */
  public answerReroll(accept: boolean, source?: RerollSource): boolean {
    const pending = this.decisionService.pending();
    if (!pending || pending.type !== "reroll") return false;
    return this.decisionService.answer({ accept, source });
  }

  /** Answer a pending reaction decision (dialog or protocol reply). */
  public answerReaction(accept: boolean): boolean {
    const pending = this.decisionService.pending();
    if (!pending || pending.type !== "reaction") return false;
    return this.decisionService.answer({ accept });
  }

  /**
   * Answer a pending interception decision — the defending coach's chosen
   * interceptor, or undefined to decline. False when none is pending.
   */
  public answerInterception(playerId?: string): boolean {
    const pending = this.decisionService.pending();
    if (!pending || pending.type !== "interception") return false;
    return this.decisionService.answer({ playerId });
  }

  getTurnNumber(teamId: string): number {
    return this.turnManager.getTurnNumber(teamId);
  }

  seedTurnCounts(turnNumber: number): void {
    this.turnManager.seedTurnCounts(turnNumber);
  }

  captureTurnManagerState(): TurnManagerState {
    return this.turnManager.captureState();
  }

  restoreTurnManagerState(snapshot: TurnManagerState): void {
    this.turnManager.restoreState(snapshot);
  }

  // ===== Setup Phase =====

  startSetup(startingTeamId?: string): void {
    this.setupManager.startSetup(startingTeamId);
  }

  placePlayer(playerId: string, x: number, y: number): boolean {
    return this.setupManager.placePlayer(playerId, x, y);
  }

  removePlayer(playerId: string): void {
    this.setupManager.removePlayer(playerId);
  }

  swapPlayers(player1Id: string, player2Id: string): boolean {
    return this.setupManager.swapPlayers(player1Id, player2Id);
  }

  confirmSetup(teamId: string): boolean {
    return this.setupManager.confirmSetup(teamId);
  }

  isSetupComplete(teamId: string): boolean {
    return this.setupManager.isSetupComplete(teamId);
  }

  getSetupStatus(
    teamId: string
  ): import("../types/SetupTypes").SetupTeamStatus | undefined {
    return this.setupManager.getSetupStatus(teamId);
  }

  getLastSetupError(): string | null {
    return this.setupManager.getLastError();
  }

  applySetupFormation(
    teamId: string,
    formation: import("../types/SetupTypes").FormationPosition[]
  ): import("../types/SetupTypes").SetupFormationResult {
    return this.setupManager.applyFormation(teamId, formation);
  }

  resolveSetupConcession(teamId: string, concede: boolean): boolean {
    return this.setupManager.resolveConcession(teamId, concede);
  }

  getSetupZone(
    teamId: string
  ): import("../types/SetupTypes").SetupZone | undefined {
    return this.setupManager.getSetupZone(teamId);
  }

  // ===== Kickoff Phase =====

  startKickoff(): void {
    this.state.phase = GamePhase.KICKOFF;
    this.state.subPhase = SubPhase.ROLL_KICKOFF;
    this.eventBus.emit(GameEventNames.KickoffStarted);
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.ROLL_KICKOFF,
    });
  }

  selectKicker(playerId: string): void {
    if (this.state.phase === GamePhase.KICKOFF) {
      const player = this.getPlayerById(playerId);
      if (player) {
        this.eventBus.emit(GameEventNames.PlayerSelected, { player });
      }
    }
  }

  async kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    await this.ballManager.kickBall(isTeam1Kicking, playerId, targetX, targetY);
  }

  rollKickoff(): void {
    void this.ballManager.rollKickoff();
  }

  resolveBallPlacement(): void {
    this.ballManager.resolveBallPlacement();
  }

  /** Touchback: receiving coach hands the ball to one of their players. */
  awardTouchback(playerId: string): boolean {
    return this.ballManager.awardTouchback(playerId);
  }

  isTouchbackPending(): boolean {
    return this.ballManager.isTouchbackPending();
  }

  getKickoffEventStep(): import("@/game/kickoff/KickoffEventManager").KickoffEventStepState | null {
    return this.kickoffEventManager.getStep();
  }

  selectKickoffEventPlayer(playerId: string): boolean {
    return this.kickoffEventManager.togglePlayerSelection(playerId);
  }

  moveKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    return this.kickoffEventManager.movePlayer(playerId, x, y);
  }

  placeKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    return this.kickoffEventManager.placePlayer(playerId, x, y);
  }

  confirmKickoffEventStep(): boolean {
    return this.kickoffEventManager.confirmStep();
  }

  skipKickoffEventStep(): boolean {
    return this.kickoffEventManager.skipStep();
  }

  // ===== Sub-Phase Helpers =====

  setWeather(_weather: number): void {
    this.weatherService.rollWeather();
    this.state.subPhase = SubPhase.COIN_FLIP;
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.SETUP,
      subPhase: SubPhase.COIN_FLIP,
    });
  }

  /**
   * Roll the initial weather using the seeded RNG, without advancing the
   * setup subphase. Used by online play, which skips the local intro (that
   * normally rolls weather) — the host rolls once and the result rides the
   * snapshot to the guest, so both see the same weather.
   */
  rollInitialWeather(): void {
    this.weatherService.rollWeather();
  }

  // ===== Turn Management =====
  setCoinFlipWinner(winningTeamId: string): void {
    this.startSetup(winningTeamId);
  }

  startGame(kickingTeamId: string): void {
    this.rerollArbiter.beginHalf([this.team1.id, this.team2.id]);
    this.turnManager.startGame(kickingTeamId);
  }

  startTurn(teamId: string): void {
    this.turnManager.startTurn(teamId);
  }

  endTurn(): void {
    this.turnManager.endTurn();
  }

  endHalf(): void {
    this.turnManager.endHalf();
  }

  finishActivation(playerId: string): void {
    // Charge! free activations end without touching the turn ledger — the
    // player may still activate normally when their team's turn begins.
    if (this.kickoffEventManager.isChargeActive()) {
      this.state.activePlayer = null;
      this.kickoffEventManager.noteChargeActivationEnded(playerId);
      this.eventBus.emit(GameEventNames.ActionResolved, { playerId });
      return;
    }
    this.blitzBlockUsed.delete(playerId);
    if (this.state.activePlayer?.id === playerId) {
      this.state.activePlayer = null;
    }
    this.turnManager.finishActivation(playerId);
    this.eventBus.emit(GameEventNames.ActionResolved, { playerId });
  }

  /**
   * The single block a Blitz allows was spent this activation. A Blitz may
   * block once, at any point during the move; afterwards the player may keep
   * moving, so a second block must be refused.
   */
  private blitzBlockUsed = new Set<string>();
  private puntUsedThisTurn = false;

  public hasUsedBlitzBlock(playerId: string): boolean {
    if (!this.blitzBlockUsed.has(playerId)) return false;
    // The guard only means anything INSIDE the Blitz that spent the block.
    // A flag surviving an earlier activation must never refuse a later
    // Block — that is what produced "this Blitz has already used its Block"
    // on a plain Block the player was entitled to make.
    return (
      this.state.activePlayer?.id === playerId &&
      this.state.activePlayer?.action === "blitz"
    );
  }

  /**
   * End (or continue) a blocker's activation once their block has fully
   * resolved. A plain Block always ends the activation. A Blitz block does
   * not: it costs one square of the move, marks the Blitz's block as spent,
   * and — while any of the MA+rush budget remains and the blocker is still
   * Standing — leaves the player active so the coach can keep moving (and
   * Rush). The normal movement auto-finish ends it once the budget is spent.
   */
  public finishBlockActivation(attackerId: string): void {
    const player = this.getPlayerById(attackerId);
    const isBlitz =
      this.state.activePlayer?.action === "blitz" &&
      this.state.activePlayer?.id === attackerId;
    if (
      player &&
      isBlitz &&
      player.status === PlayerStatus.ACTIVE &&
      !this.blitzBlockUsed.has(attackerId)
    ) {
      // The Blitz block's own square is already charged in rollBlockDice; here
      // we only decide whether the move continues. Mark the single block as
      // spent, and if any of the MA+rush budget is left, keep the player
      // active so the coach can keep moving (and Rush).
      this.blitzBlockUsed.add(attackerId);
      if (this.getMovementUsed(attackerId) < moveAllowance(player)) {
        this.eventBus.emit(GameEventNames.PlayerMovedInAction, {
          playerId: attackerId,
        });
        return;
      }
    }
    // A plain Block ends here — Hit and Run may take a free square first.
    this.blockManager.endBlockActivation(attackerId);
  }

  canActivate(playerId: string): boolean {
    const player = this.getPlayerById(playerId);
    if (!player) return false;
    return this.activationValidator.canActivate(player, this.state.turn);
  }

  playerAction(playerId: string): boolean {
    return this.canActivate(playerId);
  }

  hasPlayerActed(playerId: string): boolean {
    return this.state.turn.activatedPlayerIds.has(playerId);
  }

  // ===== Action Methods =====

  previewBlock(attackerId: string, defenderId: string): void {
    this.blockManager.previewBlock(attackerId, defenderId);
  }

  async multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    await this.blockManager.startMultipleBlock(
      attackerId,
      defender1Id,
      defender2Id
    );
  }

  async rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void> {
    const declaration = this.state.activePlayer;
    if (
      declaration?.id !== attackerId ||
      (declaration.action !== "block" && declaration.action !== "blitz") ||
      declaration.blockReplacement ||
      this.hasUsedBlitzBlock(attackerId)
    ) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "No normal Block is available for this declaration."
      );
      this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
      return;
    }

    // A player that is down or stunned can never throw a block
    const blocker = this.getPlayerById(attackerId);
    if (!blocker || blocker.status !== PlayerStatus.ACTIVE) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "A prone or stunned player cannot block!"
      );
      this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
      return;
    }

    // The block at the end of a Blitz costs 1 movement. If that point is
    // beyond MA it's a Rush (GFI): roll it BEFORE the block — on a failure
    // the blitzer falls over in front of their target and no block happens.
    if (
      this.state.activePlayer?.action === "blitz" &&
      this.state.activePlayer.id === attackerId
    ) {
      const attacker = this.getPlayerById(attackerId);
      if (attacker) {
        const used = this.state.turn.movementUsed.get(attackerId) || 0;
        const newUsed = used + 1;
        if (newUsed > moveAllowance(attacker)) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "No movement left to make the Blitz block!"
          );
          this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
          return;
        }
        this.state.turn.movementUsed.set(attackerId, newUsed);

        if (newUsed > attacker.stats.MA) {
          // The Blitz block's rush may be rerolled (Sure Feet / team)
          const check = await withRerollOffer(
            { gameService: this, eventBus: this.eventBus },
            attacker,
            "rush",
            () =>
              this.diceController.rollSkillCheck(
                "Rush (GFI)",
                2,
                0,
                attacker.playerName
              )
          );
          if (!check.success) {
            attacker.status = PlayerStatus.PRONE;
            this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
              playerId: attackerId,
            });
            this.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
            if (this.ballManager.hasBall(attackerId) && attacker.gridPosition) {
              this.flowManager.add(
                new BounceOperation(attacker.gridPosition),
                true
              );
            }
            this.flowManager.add(new ArmourOperation(attackerId), true);
            // The block never happens — release any dialog waiting on dice
            this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
            this.triggerTurnover("Failed GFI on Blitz block");
            return;
          }
        }
      }
    }

    await this.blockManager.rollBlockDice(
      attackerId,
      defenderId,
      numDice,
      isAttackerChoice
    );
  }

  async resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    await this.blockManager.resolveBlock(attackerId, defenderId, result);
  }

  /** Team Re-roll on a block: re-roll all the dice. */
  teamRerollBlock(attackerId: string): void {
    this.blockManager.teamRerollBlock(attackerId);
  }

  /** Pro on a block: re-roll a single die (3+ to use). */
  proRerollBlockDie(attackerId: string, dieIndex: number): void {
    this.blockManager.proRerollBlockDie(attackerId, dieIndex);
  }

  public executePush(
    attackerId: string,
    defenderId: string,
    direction: { x: number; y: number },
    resultType: string,
    followUp: boolean
  ): void {
    this.blockManager.executePush(
      attackerId,
      defenderId,
      direction,
      resultType,
      followUp
    );
  }

  /**
   * Follow-up into the square the pushed player vacated. This move is FREE:
   * no movement cost, no dodge, no rush — a Blitz already paid its movement
   * (and rolled any Rush) before the block.
   */
  public async followUpPush(
    attackerId: string,
    targetSquare: { x: number; y: number }
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    if (!attacker || !attacker.gridPosition) return;

    // Trigger point: the blocker follows up (Frenzy-style effects hook here)
    const followCtx: FollowUpContext = {
      attacker,
      targetSquare,
      decisions: this.decisionService,
      flow: this.flowManager,
      triggers: [],
    };
    await foldTrigger(
      "onFollowUp",
      gatherParticipants(
        attacker,
        undefined,
        adjacentStanding(attacker.gridPosition, [
          ...this.team1.players,
          ...this.team2.players,
        ])
      ),
      followCtx
    );
    followCtx.triggers.forEach((t) =>
      this.eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    const from = { ...attacker.gridPosition };
    attacker.gridPosition = { ...targetSquare };

    // A carrier keeps the ball while following up
    const carriedBall =
      this.state.ballPosition &&
      this.state.ballPosition.x === from.x &&
      this.state.ballPosition.y === from.y;
    if (carriedBall) {
      this.state.ballPosition = { ...targetSquare };
      this.eventBus.emit(GameEventNames.BallPlaced, { ...targetSquare });
    }

    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: attackerId,
      from,
      to: { ...targetSquare },
      path: [from, { ...targetSquare }],
      ballFrom: carriedBall ? from : undefined,
      ballPath: carriedBall ? [from, { ...targetSquare }] : undefined,
      ballJoinStep: 0,
    });

    // Following up onto a loose ball is entering its square — the player must
    // roll to pick it up (a failed pickup bounces the ball and is a turnover,
    // handled by attemptPickup). Without this the player just stood on the
    // ball holding nothing.
    const looseBallHere =
      !carriedBall &&
      this.state.ballPosition &&
      this.state.ballPosition.x === targetSquare.x &&
      this.state.ballPosition.y === targetSquare.y;
    if (looseBallHere) {
      const pickedUp = this.attemptPickup(attacker, targetSquare);
      if (!pickedUp) return; // failed pickup already bounced + turned over
    }

    this.checkForTouchdown(attackerId);
  }

  triggerTurnover(reason: string): void {
    // Charge! (kickoff 10) runs before the drive begins: a failure there
    // only ends the Charge, never the coming turn. The knockdown itself
    // aborts the sequence via the PlayerKnockedDown subscription.
    if (
      this.state.phase === GamePhase.KICKOFF ||
      this.kickoffEventManager.isChargeActive()
    ) {
      return;
    }
    // Only the first turnover of a resolution latches; later failures in the
    // same chain (bounce → dropped catch → …) are absorbed by it.
    if (!this.turnManager.checkTurnover(reason)) return;

    // Let the reaction chain fully settle (ball at rest, armour/injury rolls
    // done), give the turnover banner its moment, then end the turn once.
    this.flowManager
      .whenIdle()
      .then(() => this.delay(3000))
      .then(() => this.turnManager.completeTurnover());
  }

  isTurnoverInProgress(): boolean {
    return this.turnManager.isTurnoverInProgress();
  }

  blockPlayer(
    _attackerId: string,
    _defenderId: string
  ): { success: boolean; result?: string } {
    return { success: false, result: "Not implemented" };
  }

  /**
   * Start Pass Action (Replaces throwBall)
   * Queues a PassOperation in the FlowManager.
   */
  async throwBall(
    passerId: string,
    targetX: number,
    targetY: number
  ): Promise<{ success: boolean; result?: string }> {
    // NOTE: Signature kept async for compatibility, but it resolves immediately
    // while the operation runs in background/flow.

    if (this.state.phase !== GamePhase.PLAY) {
      return { success: false, result: "Not in play phase" };
    }

    console.log(
      `[GameService] Starting Pass Action: ${passerId} -> ${targetX},${targetY}`
    );

    // 1. Validation (Keep basic checks here or move to op?)
    // Basic checks for "Can I start this op?"
    const passer = this.getPlayerById(passerId);
    if (!passer || !passer.gridPosition) {
      return { success: false, result: "Player not found" };
    }

    const hasBall = this.ballManager.hasBall(passerId); // Use ball manager!
    if (!hasBall) {
      // Fallback check
      const ballPos = this.state.ballPosition;
      if (
        !ballPos ||
        ballPos.x !== passer.gridPosition.x ||
        ballPos.y !== passer.gridPosition.y
      ) {
        return { success: false, result: "Player does not have ball" };
      }
    }

    // 2. Queue Operation
    this.flowManager.add(new PassOperation(passerId, targetX, targetY));

    // 3. Return success (The flow takes over)
    return { success: true, result: "Pass Started" };
  }

  /**
   * Start Hand-off Action. Queues a HandoffOperation — no Passing Ability
   * Test, no scatter, no interception. The ball is placed directly in the
   * target team-mate's square and they make a single Catch attempt. Targets
   * a player id, not a square: a Hand-off targets a person.
   */
  async handOffBall(
    passerId: string,
    targetPlayerId: string
  ): Promise<{ success: boolean; result?: string }> {
    if (this.state.phase !== GamePhase.PLAY) {
      return { success: false, result: "Not in play phase" };
    }

    const passer = this.getPlayerById(passerId);
    if (!passer || !passer.gridPosition) {
      return { success: false, result: "Player not found" };
    }

    const hasBall = this.ballManager.hasBall(passerId);
    if (!hasBall) {
      const ballPos = this.state.ballPosition;
      if (
        !ballPos ||
        ballPos.x !== passer.gridPosition.x ||
        ballPos.y !== passer.gridPosition.y
      ) {
        return { success: false, result: "Player does not have ball" };
      }
    }

    const target = this.getPlayerById(targetPlayerId);
    if (!target || !target.gridPosition) {
      return { success: false, result: "Target not found" };
    }
    if (!isLegalHandoffTarget(passer, target)) {
      return { success: false, result: "Illegal hand-off target" };
    }

    this.flowManager.add(new HandoffOperation(passerId, targetPlayerId));
    return { success: true, result: "Hand-off Started" };
  }

  async puntBall(
    playerId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    const player = this.getPlayerById(playerId);
    if (
      !player?.gridPosition ||
      this.puntUsedThisTurn ||
      this.state.activePlayer?.id !== playerId ||
      this.state.activePlayer.action !== "punt" ||
      !hasSkill(player.skills, SkillType.PUNT) ||
      !this.ballManager.hasBall(playerId)
    ) {
      return;
    }
    this.puntUsedThisTurn = true;
    this.flowManager.add(new PuntOperation(playerId, facingX, facingY));
  }

  // No changes needed here, just removing the section below

  /**
   * Get player at a specific position
   */
  public getPlayerAt(x: number, y: number): Player | undefined {
    // Public now for Context access
    return (
      this.team1.players.find(
        (p) =>
          p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
      ) ||
      this.team2.players.find(
        (p) =>
          p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
      )
    );
  }

  // Public helper for context
  public getOpponents(teamId: string): Player[] {
    return teamId === this.team1.id ? this.team2.players : this.team1.players;
  }

  public getTeammates(playerId: string): Player[] {
    const player = this.getPlayerById(playerId);
    if (!player) return [];
    const team = player.teamId === this.team1.id ? this.team1 : this.team2;
    return team.players.filter((p) => p.id !== playerId && p.gridPosition);
  }

  /** Rooted ends when its player is Knocked Down or Placed Prone. */
  private onPlayerDowned(playerId: string): void {
    const player = this.getPlayerById(playerId);
    if (player && hasCondition(player, PlayerCondition.ROOTED)) {
      removeCondition(player, PlayerCondition.ROOTED);
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    }
  }

  /** Chomped ends the moment the chomper is no longer Marking the victim. */
  private sweepChomped(): void {
    for (const player of [...this.team1.players, ...this.team2.players]) {
      const chomp = (player.conditions ?? []).find(
        (c) => c.type === PlayerCondition.CHOMPED
      );
      if (!chomp) continue;
      const chomper = chomp.byPlayerId
        ? this.getPlayerById(chomp.byPlayerId)
        : undefined;
      const marking =
        !!chomper?.gridPosition &&
        !!player.gridPosition &&
        hasTackleZone(chomper) &&
        Math.abs(chomper.gridPosition.x - player.gridPosition.x) <= 1 &&
        Math.abs(chomper.gridPosition.y - player.gridPosition.y) <= 1 &&
        !(
          chomper.gridPosition.x === player.gridPosition.x &&
          chomper.gridPosition.y === player.gridPosition.y
        );
      if (!marking) {
        removeCondition(player, PlayerCondition.CHOMPED);
        this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      }
    }
  }

  /** End-of-opposition-turn trigger: fold the reacting team (Pick-Me-Up). */
  private handleTurnEnding(endingTeamId: string): void {
    // Cheering Fans: an unused owed Offensive Assist dies with its turn.
    const owed = getDriveEffects(this.state).owedAssists[endingTeamId];
    if (owed && owed.turn === this.turnManager.getTurnNumber(endingTeamId)) {
      delete getDriveEffects(this.state).owedAssists[endingTeamId];
      this.eventBus.emit(GameEventNames.DriveEffectExpired, {
        teamId: endingTeamId,
        effect: "offensive-assist",
        detail: "the Cheering Fans assist went unused",
      });
    }

    const reacting = endingTeamId === this.team1.id ? this.team2 : this.team1;
    const players = reacting.players.filter((p) => p.gridPosition);
    const ctx: TurnEndingContext = {
      endingTeamId,
      players,
      dice: this.diceController,
      rolledFor: new Set(),
      standUp: [],
      triggers: [],
    };
    foldTurnEnding(ctx, players);
    for (const id of ctx.standUp) {
      const p = this.getPlayerById(id);
      if (p && p.status === PlayerStatus.PRONE) {
        p.status = PlayerStatus.ACTIVE;
        this.eventBus.emit(GameEventNames.PlayerStoodUp, {
          playerId: id,
          cost: 0,
        });
        this.eventBus.emit(GameEventNames.PlayerStatusChanged, p);
      }
    }
    for (const t of ctx.triggers) {
      this.eventBus.emit(GameEventNames.SkillTriggered, t);
    }
  }

  passBall(
    passerId: string,
    targetSquare: { x: number; y: number }
  ): { success: boolean; result?: string } {
    this.throwBall(passerId, targetSquare.x, targetSquare.y);
    return { success: true, result: "Pass initiated" };
  }

  setBallPosition(x: number, y: number): void {
    this.state.ballPosition = { x, y };
    this.eventBus.emit(GameEventNames.BallPlaced, { x, y });
  }

  // ===== Score Management =====

  addTouchdown(teamId: string, scorerId?: string): void {
    this.state.score[teamId] = (this.state.score[teamId] || 0) + 1;

    this.state.phase = GamePhase.TOUCHDOWN;
    this.state.subPhase = SubPhase.SCORING;

    // Phase first, then the score: the TOUCHDOWN phase handler is installed
    // by the phase change and must already own the scene when the Touchdown
    // event it announces arrives.
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });
    this.eventBus.emit(GameEventNames.Touchdown, {
      teamId,
      score: this.state.score[teamId],
      scorerId,
    });

    // The celebration window is a queued operation, not a bare timer, so the
    // hand-off into the end-of-drive sequence is ordered against everything
    // else in flight (and paced identically headless).
    this.flowManager.add(new TouchdownCelebrationOperation(teamId));
  }

  /**
   * End of Drive Sequence (rulebook p.83): clear the pitch to the dugouts,
   * roll KO recovery, then restart with the given kicking team — no coin
   * flip after drive one. Runs as operations so the UI can pace each stage.
   */
  endDrive(reason: "touchdown" | "halftime", nextKickingTeamId: string): void {
    // A touchdown scored with no turns left in the half does not start a
    // further drive in that half: the sequence continues into halftime (or,
    // in the second half, to full time) instead.
    const halfOver =
      reason === "touchdown" && this.turnManager.isHalfExhausted();
    const halftimeKickingTeamId = halfOver
      ? this.turnManager.beginNextHalf()
      : nextKickingTeamId;

    this.flowManager.add(
      new ClearPitchOperation(
        halfOver ? "halftime" : reason,
        halftimeKickingTeamId ?? nextKickingTeamId
      )
    );
    this.flowManager.add(new KORecoveryOperation());
    // Null kicking team = full time; there is no next drive to set up.
    if (halftimeKickingTeamId === null) return;
    this.flowManager.add(new StartNextDriveOperation(halftimeKickingTeamId));
  }

  /**
   * Clear all drive state: players to dugouts (KO/Injured stay out),
   * placement bookkeeping reset, ball off the pitch.
   */
  resetDriveState(): void {
    this.setupManager.resetForNewDrive();
    this.state.ballPosition = null;
    this.state.activePlayer = null;

    // Kickoff-event effects never survive the drive (free re-roll, Dodgy
    // Snack modifiers, confinement); bribes persist — they are match-scoped.
    const driveEffects = getDriveEffects(this.state);
    if (!driveEffectsEmpty(driveEffects)) {
      for (const teamId of new Set([
        ...Object.keys(driveEffects.freeRerolls),
        ...Object.keys(driveEffects.owedAssists),
      ])) {
        this.eventBus.emit(GameEventNames.DriveEffectExpired, {
          teamId,
          effect: "drive-effects",
          detail: "kickoff effects expire as the drive ends",
        });
      }
      this.state.driveEffects = emptyDriveEffects();
    }

    // Activation state must not leak into the next drive's setup — stale
    // activatedPlayerIds left players "already gone" and blocked setup
    this.state.turn.activatedPlayerIds.clear();
    this.state.turn.movementUsed.clear();
    this.state.turn.hasBlitzed = false;
    this.state.turn.hasPassed = false;
    this.state.turn.hasHandedOff = false;
    this.state.turn.hasFouled = false;

    // A drive can end mid-activation (touchdown, halftime), which skips
    // finishActivation — clear the Blitz block guard at this boundary too.
    this.blitzBlockUsed.clear();

    // Conditions do not survive the drive (Rooted explicitly ends here)
    [...this.team1.players, ...this.team2.players].forEach((p) => {
      if (p.conditions?.length) p.conditions = [];
    });

    this.eventBus.emit(GameEventNames.RefreshBoard);
  }

  /**
   * Roll KO recovery one knocked-out player at a time (D6, 4+ recovers to
   * Reserves). Each roll is announced via KORecoveryRolled and shown for a
   * beat BEFORE the status change is applied, so the visible roll and the
   * record never disagree. `beat` paces the sequence (a real pause in the
   * browser, immediate headless); the returned promise resolves only once
   * every player has been rolled for and moved.
   */
  async rollKORecovery(
    beat: () => Promise<void> = () => Promise.resolve()
  ): Promise<void> {
    const knockedOut = [...this.team1.players, ...this.team2.players].filter(
      (p) => p.status === PlayerStatus.KO
    );

    for (const player of knockedOut) {
      const roll = this.diceController.rollD6("KO Recovery");
      const recovered = roll >= 4;
      this.eventBus.emit(GameEventNames.KORecoveryRolled, {
        playerId: player.id,
        roll,
        recovered,
      });
      await beat();
      if (recovered) {
        movePlayerToBox(player, { box: "reserves" }, this.eventBus);
      }
    }

    assertSinglePlayerLocation(
      [...this.team1.players, ...this.team2.players],
      "rollKORecovery"
    );
  }

  /**
   * Coin flip is only legal before the first drive of the match — never once
   * a kickoff has happened, a turn has been played, or a score exists
   * (scenario-started games count as underway).
   */
  /**
   * Score a touchdown if the player is standing in the end zone they score
   * in while holding the ball. Called after any event that can put a
   * ball-carrier there: movement steps, pickups, catches, pushes.
   */
  checkForTouchdown(playerId: string): boolean {
    if (this.state.phase !== GamePhase.PLAY) return false;
    const player = this.getPlayerById(playerId);
    if (!player || !player.gridPosition) return false;
    if (player.status !== PlayerStatus.ACTIVE) return false;
    if (!this.ballManager.hasBall(playerId)) return false;

    const side = player.teamId === this.team1.id ? 1 : 2;
    if (!isInEndZone(player.gridPosition, GameConfig.PITCH_WIDTH, side)) {
      return false;
    }
    this.addTouchdown(player.teamId, player.id);
    return true;
  }

  canCoinFlip(): boolean {
    if (this.turnManager.hasGameStarted()) return false;
    if (this.state.turn.turnNumber > 0) return false;
    if (Object.values(this.state.score).some((s) => s > 0)) return false;
    return true;
  }

  getScore(teamId: string): number {
    return this.state.score[teamId] || 0;
  }

  public getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  // ===== Movement Implementation =====

  getMovementUsed(playerId: string): number {
    return this.movementManager.getMovementUsed(playerId);
  }

  getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[] {
    return this.movementManager.getAvailableMovements(playerId);
  }

  async movePlayer(
    playerId: string,
    path: { x: number; y: number }[]
  ): Promise<void> {
    const context = this.getFlowContext();
    return this.movementManager.movePlayer(playerId, path, context);
  }

  dropBallWithFumblerooski(
    playerId: string,
    square: { x: number; y: number }
  ): boolean {
    const player = this.getPlayerById(playerId);
    const active = this.state.activePlayer;
    if (
      !player?.gridPosition ||
      active?.id !== playerId ||
      active.action !== "move" ||
      !hasSkill(player.skills, SkillType.FUMBLEROOSKI) ||
      !this.ballManager.hasBall(playerId)
    ) {
      return false;
    }
    const dx = Math.abs(player.gridPosition.x - square.x);
    const dy = Math.abs(player.gridPosition.y - square.y);
    if (Math.max(dx, dy) !== 1 || this.getPlayerAt(square.x, square.y)) {
      return false;
    }
    this.setBallPosition(square.x, square.y);
    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId,
      skill: SkillType.FUMBLEROOSKI,
      effect: "Fumblerooski: left the ball behind without causing a Turnover",
    });
    return true;
  }

  async standUp(playerId: string): Promise<void> {
    return this.movementManager.standUp(playerId);
  }

  async jumpPlayer(
    playerId: string,
    target: { x: number; y: number }
  ): Promise<void> {
    const context = this.getFlowContext();
    return this.movementManager.jumpPlayer(playerId, target, context);
  }

  declareAction(
    playerId: string,
    action: ActionType,
    requestedReplacement?: BlockReplacement
  ): boolean {
    // Charge! (kickoff 10): the current Charge player acts outside any turn
    if (this.kickoffEventManager.isChargeActive()) {
      return this.chargeDeclareAction(playerId, action);
    }

    // Must be activatable at all: active team, on-pitch, standing or prone,
    // and not already activated this turn (stunned recovery marks players
    // as activated). The browser checks this before calling; the headless
    // protocol relies on this guard.
    if (!this.canActivate(playerId)) return false;

    const activating = this.getPlayerById(playerId);
    if (!activating) return false;

    const directReplacement = blockReplacementForDirectAction(action);
    const blockReplacement = requestedReplacement ?? directReplacement;
    // A direct Special Action is a no-move declaration, exactly like a
    // standalone Block. Once this activation has spent movement the attack
    // must have been declared as a Blitz before the move began — refuse here
    // so a forged or stale command cannot bypass the availability gate.
    if (directReplacement) {
      const movementSpent =
        (this.state.turn.movementUsed.get(playerId) ?? 0) > 0;
      if (movementSpent) {
        const label = BLOCK_REPLACEMENT_DEFINITIONS[directReplacement].label;
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          `${activating.playerName} has already moved — ${label} must be declared as Blitz (with ${label}) before moving.`
        );
        return false;
      }
    }
    // Replacement declarations are immutable for the activation: neither a
    // forged replacement nor a normal action may swap one in or out after the
    // player has started. Preserve the engine's existing Move-then-Block
    // declaration compatibility for ordinary actions.
    if (
      this.state.activePlayer &&
      (this.state.activePlayer.blockReplacement || blockReplacement)
    ) {
      return false;
    }
    if (requestedReplacement && action !== "blitz") {
      if (directReplacement !== requestedReplacement) return false;
    }
    if (blockReplacement) {
      const definition = BLOCK_REPLACEMENT_DEFINITIONS[blockReplacement];
      if (!hasSkill(activating.skills, definition.skill)) return false;
      if (action === "blitz") {
        if (this.state.turn.hasBlitzed) return false;
        if (
          !hasReachableBlockReplacementTarget(
            activating,
            this.getOpponents(activating.teamId),
            this.getAvailableMovements(playerId),
            blockReplacement
          )
        ) {
          return false;
        }
      } else {
        if (action !== definition.directAction) return false;
        if (
          legalBlockReplacementTargets(
            activating,
            this.getOpponents(activating.teamId),
            blockReplacement
          ).length === 0
        ) {
          return false;
        }
      }
    }

    // Distracted expires when the player is next activated
    if (activating && hasCondition(activating, PlayerCondition.DISTRACTED)) {
      removeCondition(activating, PlayerCondition.DISTRACTED);
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, activating);
    }
    // Eye Gouged (cannot assist) also expires once the player is activated
    if (activating && hasCondition(activating, PlayerCondition.EYE_GOUGED)) {
      removeCondition(activating, PlayerCondition.EYE_GOUGED);
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, activating);
    }
    // A Rooted player may not leave their square, so no Move-type actions
    if (
      activating &&
      hasCondition(activating, PlayerCondition.ROOTED) &&
      (action === "move" || action === "secureBall")
    ) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `${activating.playerName} is Rooted and cannot Move!`
      );
      return false;
    }

    // A player who is down cannot plain-Block: standing up costs movement,
    // so a hit after rising is what Blitz is for. Jump Up is the exception —
    // it may declare a Block while Prone, with standing gated on an Agility
    // test (+1) resolved by the stand-up step. Multiple Block gets no such
    // exception.
    if (action === "block" || action === "multipleBlock") {
      const player = this.getPlayerById(playerId);
      if (!player) return false;
      const jumpUpProneBlock =
        action === "block" &&
        player.status === PlayerStatus.PRONE &&
        hasSkill(player.skills, SkillType.JUMP_UP);
      if (player.status !== PlayerStatus.ACTIVE && !jumpUpProneBlock) {
        return false;
      }
      if (
        action === "multipleBlock" &&
        !hasSkill(player.skills, SkillType.MULTIPLE_BLOCK)
      ) {
        return false;
      }
    }
    // A Stab Special Action needs the Stab trait and a Standing stabber
    if (action === "stab") {
      const player = this.getPlayerById(playerId);
      if (!player || player.status !== PlayerStatus.ACTIVE) return false;
      if (!hasSkill(player.skills, SkillType.STAB)) return false;
    }
    // A Throw / Kick Team-mate Action needs the trait and a Standing thrower
    if (action === "throwTeamMate") {
      const player = this.getPlayerById(playerId);
      if (!player || player.status !== PlayerStatus.ACTIVE) return false;
      if (
        !hasSkill(player.skills, SkillType.THROW_TEAM_MATE) &&
        !hasSkill(player.skills, SkillType.KICK_TEAM_MATE)
      ) {
        return false;
      }
    }
    // A Throw Bomb Special Action needs the Bombardier trait and a Standing thrower
    if (action === "throwBomb") {
      const player = this.getPlayerById(playerId);
      if (!player || player.status !== PlayerStatus.ACTIVE) return false;
      if (!hasSkill(player.skills, SkillType.BOMBARDIER)) return false;
    }
    if (action === "punt") {
      const player = this.getPlayerById(playerId);
      if (
        !player ||
        player.status !== PlayerStatus.ACTIVE ||
        !hasSkill(player.skills, SkillType.PUNT) ||
        this.puntUsedThisTurn
      ) {
        return false;
      }
    }
    // Ball & Chain: the trait needs a Standing Fanatic — and a Fanatic may
    // declare NOTHING else (the lurch is the only action available to them).
    {
      const player = this.getPlayerById(playerId);
      const isFanatic =
        !!player && hasSkill(player.skills, SkillType.BALL_AND_CHAIN);
      if (action === "ballAndChain") {
        if (!player || player.status !== PlayerStatus.ACTIVE) return false;
        if (!isFanatic) return false;
      } else if (isFanatic && player!.status === PlayerStatus.ACTIVE) {
        // A Standing Fanatic can only ever declare Ball & Chain.
        return false;
      }
    }
    // The other special actions likewise need their trait and a Standing player
    if (
      action === "breatheFire" ||
      action === "vomit" ||
      action === "gaze" ||
      action === "chomp" ||
      action === "chainsaw"
    ) {
      const player = this.getPlayerById(playerId);
      if (!player || player.status !== PlayerStatus.ACTIVE) return false;
      const needed =
        action === "breatheFire"
          ? SkillType.BREATHE_FIRE
          : action === "vomit"
            ? SkillType.PROJECTILE_VOMIT
            : action === "gaze"
              ? SkillType.HYPNOTIC_GAZE
              : action === "chainsaw"
                ? SkillType.CHAINSAW
                : SkillType.MONSTROUS_MOUTH;
      if (!hasSkill(player.skills, needed)) return false;
    }
    // Rules may refuse the declaration outright (Unsteady vs Secure the Ball)
    const declaring = this.getPlayerById(playerId);
    if (declaring) {
      const ctx: ActionDeclaredContext = {
        player: declaring,
        action,
        hasBall:
          !!this.state.ballPosition &&
          !!declaring.gridPosition &&
          this.state.ballPosition.x === declaring.gridPosition.x &&
          this.state.ballPosition.y === declaring.gridPosition.y,
        refused: false,
        triggers: [],
      };
      foldActionDeclared(ctx);
      for (const t of ctx.triggers) {
        this.eventBus.emit(GameEventNames.SkillTriggered, t);
      }
      if (ctx.refused) return false;
    }
    if (
      !this.playerActionManager.declareAction(
        playerId,
        action,
        blockReplacement
      )
    ) {
      return false;
    }
    // Negatraits roll between declaring and performing (Bone Head, …):
    // queued at the FRONT of the flow so the gate — decisions included —
    // resolves before the declared action can proceed
    if (
      declaring &&
      declaring.skills.some(
        (s) => SkillRegistry.get(s.type)?.onActivationDeclared
      )
    ) {
      this.flowManager.add(new ActivationGateOperation(playerId, action), true);
    }
    return true;
  }

  /**
   * Charge! declarations run through the normal action state but deliberately
   * do not touch the coming turn's action flags or activation ledger.
   */
  private chargeDeclareAction(
    playerId: string,
    action: import("@/types/events").ActionType
  ): boolean {
    const player = this.getPlayerById(playerId);
    if (
      !player ||
      player.status !== PlayerStatus.ACTIVE ||
      this.kickoffEventManager.getChargeActivePlayerId() !== playerId ||
      !this.kickoffEventManager.canChargeAct(playerId, action)
    ) {
      return false;
    }

    let teammateMode: "throw" | "kick" | undefined;
    if (action === "throwTeamMate") {
      const canThrow = hasSkill(player.skills, SkillType.THROW_TEAM_MATE);
      const canKick = hasSkill(player.skills, SkillType.KICK_TEAM_MATE);
      if (!canThrow && !canKick) return false;
      teammateMode = canKick && !canThrow ? "kick" : "throw";
    }

    this.state.activePlayer = { id: playerId, action };
    this.kickoffEventManager.noteChargeActionDeclared(action, teammateMode);
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Charge! action declared: ${action}`
    );
    return true;
  }

  cancelAction(playerId: string): boolean {
    return this.playerActionManager.cancelAction(playerId);
  }

  attemptPickup(player: Player, position: { x: number; y: number }): boolean {
    return this.ballManager.attemptPickup(player, position);
  }

  /** Throw-in from the square where the ball left the pitch (p.73). */
  throwInBall(from: { x: number; y: number }): void {
    this.ballManager.throwIn(from);
  }

  public getTeam(teamId: string): Team | undefined {
    if (this.team1.id === teamId) return this.team1;
    if (this.team2.id === teamId) return this.team2;
    return undefined;
  }

  public async foulPlayer(
    foulerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    if (this.state.phase !== GamePhase.PLAY) {
      return;
    }

    const fouler = this.getPlayerById(foulerId);
    if (!fouler || !fouler.gridPosition) {
      return;
    }

    this.flowManager.add(new FoulOperation(foulerId, targetX, targetY));
  }

  /**
   * Stab Special Action (2025 p.136): unmodifiable Armour Roll against an
   * adjacent Standing opponent; the activation ends after the stab. Legal
   * as the declared "stab" action, or during a Blitz in place of the Block.
   */
  public async stabPlayer(
    attackerId: string,
    targetId: string
  ): Promise<boolean> {
    const gate = await this.commitBlockReplacement(
      attackerId,
      targetId,
      "stab"
    );
    if (!gate.accepted) return false;
    if (!gate.proceed) return true;

    await this.blockManager.offerDumpOff(targetId);
    this.flowManager.add(new StabOperation(attackerId, targetId));
    return true;
  }

  /**
   * Throw / Kick Team-mate Action: a Standing player with the trait throws an
   * eligible team-mate (Right Stuff, ST 3 or less) at an aim square. Legal only
   * as the declared "throwTeamMate" action. `mode` picks Kick's harsher fumble;
   * when omitted it is inferred from the thrower's traits.
   */
  public async throwTeammate(
    throwerId: string,
    teammateId: string,
    x: number,
    y: number,
    mode?: "throw" | "kick"
  ): Promise<void> {
    if (
      this.state.phase !== GamePhase.PLAY &&
      !this.kickoffEventManager.isChargeActive()
    ) {
      return;
    }

    const thrower = this.getPlayerById(throwerId);
    if (!thrower || thrower.status !== PlayerStatus.ACTIVE) return;
    const canThrow = hasSkill(thrower.skills, SkillType.THROW_TEAM_MATE);
    const canKick = hasSkill(thrower.skills, SkillType.KICK_TEAM_MATE);
    if (!canThrow && !canKick) return;

    const declared =
      this.state.activePlayer?.id === throwerId
        ? this.state.activePlayer.action
        : undefined;
    if (declared !== "throwTeamMate") return;

    const resolved: "throw" | "kick" =
      mode ?? (canKick && !canThrow ? "kick" : "throw");

    this.flowManager.add(
      new ThrowTeammateOperation(throwerId, teammateId, x, y, resolved)
    );
  }

  /**
   * Throw Bomb Special Action (Bombardier): a Standing player with the trait
   * lobs a bomb at a target square, resolved like a Pass. Legal only as the
   * declared "throwBomb" action.
   */
  public async throwBomb(
    throwerId: string,
    x: number,
    y: number
  ): Promise<void> {
    if (this.state.phase !== GamePhase.PLAY) return;

    const thrower = this.getPlayerById(throwerId);
    if (!thrower || thrower.status !== PlayerStatus.ACTIVE) return;
    if (!hasSkill(thrower.skills, SkillType.BOMBARDIER)) return;

    const declared =
      this.state.activePlayer?.id === throwerId
        ? this.state.activePlayer.action
        : undefined;
    if (declared !== "throwBomb") return;

    this.flowManager.add(new BombardierOperation(throwerId, x, y));
  }

  /**
   * Ball & Chain Special Action (Fanatic): the player lurches up to its MA in a
   * chosen facing (a cardinal direction — an End Zone or a Sideline), deviating
   * each square by the Throw-in Template. Legal only as the declared
   * "ballAndChain" action.
   */
  public async ballAndChain(
    fanaticId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    if (this.state.phase !== GamePhase.PLAY) return;

    const fanatic = this.getPlayerById(fanaticId);
    if (!fanatic || fanatic.status !== PlayerStatus.ACTIVE) return;
    if (!hasSkill(fanatic.skills, SkillType.BALL_AND_CHAIN)) return;

    const declared =
      this.state.activePlayer?.id === fanaticId
        ? this.state.activePlayer.action
        : undefined;
    if (declared !== "ballAndChain") return;

    this.flowManager.add(
      new BallAndChainOperation(fanaticId, facingX, facingY)
    );
  }

  /**
   * Special activation actions (Breathe Fire, Projectile Vomit, Hypnotic
   * Gaze, Chomp): legal as their declared action, or — where the book says
   * so — during a Blitz in place of the Block. Hypnotic Gaze has its own
   * pre-move and never replaces a Blitz block.
   */
  public async performSpecialAction(
    kind: BlockReplacement | "gaze",
    attackerId: string,
    targetId: string
  ): Promise<boolean> {
    if (this.state.phase !== GamePhase.PLAY) return false;
    const attacker = this.getPlayerById(attackerId);
    if (!attacker || attacker.status !== PlayerStatus.ACTIVE) return false;

    if (kind !== "gaze") {
      const gate = await this.commitBlockReplacement(
        attackerId,
        targetId,
        kind
      );
      if (!gate.accepted) return false;
      if (!gate.proceed) return true;
    }

    const requirement =
      kind === "breatheFire"
        ? SkillType.BREATHE_FIRE
        : kind === "vomit"
          ? SkillType.PROJECTILE_VOMIT
          : kind === "gaze"
            ? SkillType.HYPNOTIC_GAZE
            : kind === "chainsaw"
              ? SkillType.CHAINSAW
              : SkillType.MONSTROUS_MOUTH;
    if (!hasSkill(attacker.skills, requirement)) return false;

    const declared =
      this.state.activePlayer?.id === attackerId
        ? this.state.activePlayer.action
        : undefined;
    if (kind === "gaze") {
      const target = this.getPlayerById(targetId);
      if (
        declared !== "gaze" ||
        !target ||
        !target.gridPosition ||
        target.teamId === attacker.teamId ||
        target.status !== PlayerStatus.ACTIVE ||
        !attacker.gridPosition ||
        Math.max(
          Math.abs(attacker.gridPosition.x - target.gridPosition.x),
          Math.abs(attacker.gridPosition.y - target.gridPosition.y)
        ) !== 1
      ) {
        return false;
      }
    }

    // Dump-Off is resolved before a directly-targeting opposition Special
    // Action, just as it is before a Block.
    const target = this.getPlayerById(targetId);
    if (target && target.teamId !== attacker.teamId) {
      await this.blockManager.offerDumpOff(targetId);
    }
    switch (kind) {
      case "breatheFire":
        this.flowManager.add(new BreatheFireOperation(attackerId, targetId));
        break;
      case "vomit":
        this.flowManager.add(
          new ProjectileVomitOperation(attackerId, targetId)
        );
        break;
      case "gaze":
        this.flowManager.add(new HypnoticGazeOperation(attackerId, targetId));
        break;
      case "chomp":
        this.flowManager.add(new ChompOperation(attackerId, targetId));
        break;
      case "chainsaw":
        this.flowManager.add(new ChainsawAttackOperation(attackerId, targetId));
        break;
    }
    return true;
  }

  /**
   * Validate and atomically commit the selected replacement before any roll
   * or target mutation. Invalid/stale commands leave the state untouched.
   */
  private async commitBlockReplacement(
    attackerId: string,
    targetId: string,
    replacement: BlockReplacement
  ): Promise<{ accepted: boolean; proceed: boolean }> {
    if (this.state.phase !== GamePhase.PLAY) {
      return { accepted: false, proceed: false };
    }
    const attacker = this.getPlayerById(attackerId);
    const target = this.getPlayerById(targetId);
    const active = this.state.activePlayer;
    const definition = BLOCK_REPLACEMENT_DEFINITIONS[replacement];
    if (
      !attacker ||
      !target ||
      !active ||
      active.id !== attackerId ||
      active.blockReplacement !== replacement ||
      active.blockReplacementUsed ||
      (active.action !== "blitz" &&
        active.action !== definition.directAction) ||
      !isLegalBlockReplacementTarget(attacker, target, replacement)
    ) {
      return { accepted: false, proceed: false };
    }

    const isBlitz = active.action === "blitz";
    let newMovementUsed: number | undefined;
    if (isBlitz) {
      if (!this.state.turn.hasBlitzed || this.blitzBlockUsed.has(attackerId)) {
        return { accepted: false, proceed: false };
      }
      const used = this.state.turn.movementUsed.get(attackerId) ?? 0;
      newMovementUsed = used + 1;
      if (newMovementUsed > moveAllowance(attacker)) {
        return { accepted: false, proceed: false };
      }
    }

    // Commitment boundary: all legality checks passed. From here the attack
    // and team Blitz are spent even if a required Rush subsequently fails.
    active.blockReplacementUsed = true;
    if (isBlitz && newMovementUsed !== undefined) {
      this.blitzBlockUsed.add(attackerId);
      this.state.turn.movementUsed.set(attackerId, newMovementUsed);
      if (newMovementUsed > attacker.stats.MA) {
        const check = await withRerollOffer(
          { gameService: this, eventBus: this.eventBus },
          attacker,
          "rush",
          () =>
            this.diceController.rollSkillCheck(
              "Rush (GFI)",
              2,
              0,
              attacker.playerName,
              attacker.teamId
            )
        );
        if (!check.success) {
          attacker.status = PlayerStatus.PRONE;
          this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
            playerId: attackerId,
          });
          this.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
          if (this.ballManager.hasBall(attackerId) && attacker.gridPosition) {
            this.flowManager.add(
              new BounceOperation({ ...attacker.gridPosition }),
              true
            );
          }
          this.flowManager.add(new ArmourOperation(attackerId), true);
          this.finishActivation(attackerId);
          this.triggerTurnover("Failed GFI on Blitz special attack");
          return { accepted: true, proceed: false };
        }
      }
    }
    return { accepted: true, proceed: true };
  }
}
