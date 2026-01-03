/**
 * GameService - Core game logic service
 *
 * Pure TypeScript implementation with no Phaser dependencies.
 * Manages game state, phase transitions, and turn management.
 */

import { IGameService } from "./interfaces/IGameService.js";
import { IEventBus } from "./EventBus.js";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "../types/events";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { BlockResult } from "./BlockResolutionService";
import { ActivationValidator } from "../game/validators/ActivationValidator.js";

import { SetupManager } from "../game/managers/SetupManager";
import { TurnManager } from "../game/managers/TurnManager";
import { BallManager } from "../game/managers/BallManager";
import { MovementManager } from "../game/managers/MovementManager";
import { BlockManager } from "../game/managers/BlockManager";
import { WeatherManager } from "../game/managers/WeatherManager";

import { PlayerActionManager } from "../game/managers/PlayerActionManager";
import { PassController } from "../game/controllers/PassController";
import { CatchController } from "../game/controllers/CatchController";
import { DiceController } from "../game/controllers/DiceController";
import { ArmourController } from "../game/controllers/ArmourController";
import { InjuryController } from "../game/controllers/InjuryController";

import { GameFlowManager } from "@/game/core/GameFlowManager";
import { PassOperation } from "@/game/operations/PassOperation";

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
    };
  }
  private playerActionManager: PlayerActionManager;
  private passController: PassController;
  private catchController: CatchController;
  public diceController: DiceController;
  private armourController: ArmourController;
  private injuryController: InjuryController;

  // Game Flow Manager
  public flowManager: GameFlowManager;

  // Validators
  private activationValidator: ActivationValidator = new ActivationValidator();

  constructor(
    private eventBus: IEventBus,
    team1: Team,
    team2: Team,
    initialState?: GameState
  ) {
    this.team1 = team1;
    this.team2 = team2;

    this.state = initialState || GameService.createInitialState(team1, team2);

    // If starting a fresh game (no initial state), ensure teams are clean
    if (!initialState) {
      SetupManager.sanitizeTeam(team1);
      SetupManager.sanitizeTeam(team2);
    }

    // Initialize Flow Manager (Pass 'this' as context)
    this.flowManager = new GameFlowManager({
      gameService: this,
      eventBus: eventBus,
    });
    // Recursive injection if needed or access via gameService in context
    (this.flowManager as any).context.flowManager = this.flowManager;

    // Initialize Managers
    this.weatherService = new WeatherManager(eventBus, this.state);

    this.setupManager = new SetupManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.weatherService,
      {
        onKickoffRequested: () => this.startKickoff(),
      }
    );

    this.turnManager = new TurnManager(eventBus, this.state, team1, team2, {
      onPhaseChanged: (phase, subPhase) =>
        this.eventBus.emit(GameEventNames.PhaseChanged, { phase, subPhase }),
    });

    this.ballManager = new BallManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.weatherService,
      {
        onTurnover: (reason) => this.triggerTurnover(reason),
        onPhaseChange: (phase, subPhase) =>
          this.eventBus.emit(GameEventNames.PhaseChanged, { phase, subPhase }),
        onBallPlaced: (x, y) =>
          this.eventBus.emit(GameEventNames.BallPlaced, { x, y }),
      }
    );

    this.playerActionManager = new PlayerActionManager(eventBus, this.state);

    this.passController = new PassController(
      eventBus,
      this.ballManager.movementController
    );
    this.diceController = new DiceController(eventBus);
    this.catchController = new CatchController(eventBus, this.diceController);
    this.armourController = new ArmourController();
    this.injuryController = new InjuryController();

    this.movementManager = new MovementManager(
      eventBus,
      this.state,
      team1,
      team2,
      this.ballManager,
      {
        onTurnover: (reason) => this.triggerTurnover(reason),
        onActivationFinished: (playerId) => this.finishActivation(playerId),
      }
    );

    this.blockManager = new BlockManager(eventBus, this.state, team1, team2, {
      onTurnover: (reason) => this.triggerTurnover(reason),
      getFlowManager: () => this.flowManager,
    });
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

  public getDiceController(): DiceController {
    return this.diceController;
  }

  public getArmourController(): ArmourController {
    return this.armourController;
  }

  public getInjuryController(): InjuryController {
    return this.injuryController;
  }

  public getFlowContext(): any {
    return (this.flowManager as any).context;
  }

  getTurnNumber(teamId: string): number {
    return this.turnManager.getTurnNumber(teamId);
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

  confirmSetup(teamId: string): void {
    this.setupManager.confirmSetup(teamId);
  }

  isSetupComplete(teamId: string): boolean {
    return this.setupManager.isSetupComplete(teamId);
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

  kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): void {
    this.ballManager.kickBall(isTeam1Kicking, playerId, targetX, targetY);
  }

  rollKickoff(): void {
    this.ballManager.rollKickoff();
  }

  resolveBallPlacement(): void {
    this.ballManager.resolveBallPlacement();
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

  // ===== Turn Management =====
  setCoinFlipWinner(winningTeamId: string): void {
    this.startSetup(winningTeamId);
  }

  startGame(kickingTeamId: string): void {
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
    this.turnManager.finishActivation(playerId);
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

  rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): void {
    this.blockManager.rollBlockDice(
      attackerId,
      defenderId,
      numDice,
      isAttackerChoice
    );
  }

  resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): void {
    this.blockManager.resolveBlock(attackerId, defenderId, result);
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

  triggerTurnover(reason: string): void {
    this.turnManager.checkTurnover(reason);
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get player at a specific position
   */
  public getPlayerAt(x: number, y: number): Player | undefined {
    // Public now for Context access
    return (
      this.team1.players.find(
        (p) =>
          p.gridPosition &&
          p.gridPosition.x === x &&
          p.gridPosition.y === y &&
          p.status === PlayerStatus.ACTIVE
      ) ||
      this.team2.players.find(
        (p) =>
          p.gridPosition &&
          p.gridPosition.x === x &&
          p.gridPosition.y === y &&
          p.status === PlayerStatus.ACTIVE
      )
    );
  }

  // Public helper for context
  public getOpponents(teamId: string): Player[] {
    return teamId === this.team1.id ? this.team2.players : this.team1.players;
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

  addTouchdown(teamId: string): void {
    this.state.score[teamId] = (this.state.score[teamId] || 0) + 1;

    this.state.phase = GamePhase.TOUCHDOWN;
    this.state.subPhase = SubPhase.SCORING;

    this.eventBus.emit(GameEventNames.Touchdown, {
      teamId,
      score: this.state.score[teamId],
    });
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.SCORING,
    });

    setTimeout(() => this.startEndDriveSequence(), 2000);
  }

  startEndDriveSequence(): void {
    this.state.subPhase = SubPhase.RECOVER_KO;
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.RECOVER_KO,
    });
    this.recoverKO();
  }

  recoverKO(): void {
    setTimeout(() => {
      this.state.subPhase = SubPhase.SECRET_WEAPONS;
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.TOUCHDOWN,
        subPhase: SubPhase.SECRET_WEAPONS,
      });

      setTimeout(() => {
        this.resetForKickoff();
      }, 1000);
    }, 1000);
  }

  resetForKickoff(): void {
    const scoringTeamId = this.state.activeTeamId;
    if (scoringTeamId) {
      this.startSetup(scoringTeamId);
    } else {
      this.startSetup(
        this.turnManager.getDriveKickingTeamId() || this.team1.id
      );
    }
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

  async standUp(playerId: string): Promise<void> {
    return this.movementManager.standUp(playerId);
  }

  declareAction(
    playerId: string,
    action: import("@/types/events").ActionType
  ): boolean {
    return this.playerActionManager.declareAction(playerId, action);
  }

  attemptPickup(player: Player, position: { x: number; y: number }): boolean {
    return this.ballManager.attemptPickup(player, position);
  }

  public getTeam(teamId: string): Team | undefined {
    if (this.team1.id === teamId) return this.team1;
    if (this.team2.id === teamId) return this.team2;
    return undefined;
  }
}
