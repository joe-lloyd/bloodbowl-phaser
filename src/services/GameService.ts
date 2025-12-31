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
  private playerActionManager: PlayerActionManager;
  private passController: PassController;
  private catchController: CatchController;

  // Validators
  private activationValidator: ActivationValidator = new ActivationValidator();
  // private actionValidator: ActionValidator = new ActionValidator();

  constructor(
    private eventBus: IEventBus,
    team1: Team,
    team2: Team,
    initialState?: GameState
  ) {
    this.team1 = team1;
    this.team2 = team2;

    this.state = initialState || {
      phase: GamePhase.SETUP,
      subPhase: SubPhase.WEATHER, // Start with Weather
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
      ballPosition: null,
      activePlayer: null,
    };

    // If starting a fresh game (no initial state), ensure teams are clean
    // This prevents dirty state from previous sessions (e.g. Sandbox) leaking in
    if (!initialState) {
      SetupManager.sanitizeTeam(team1);
      SetupManager.sanitizeTeam(team2);
    }

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
    // Inject centralized movement controller into PassController
    this.passController = new PassController(
      eventBus,
      this.ballManager.movementController
    );
    this.catchController = new CatchController(eventBus);

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
    this.state.subPhase = SubPhase.SETUP_KICKOFF;
    this.eventBus.emit(GameEventNames.KickoffStarted);
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.SETUP_KICKOFF,
    });
  }

  selectKicker(playerId: string): void {
    // Just emit selection, no phase change needed.
    // Logic for "Target Selection" is now just part of the same phase.
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
    // Trigger Setup Kicking
    this.startSetup(winningTeamId);
  }

  // ===== Game Phase =====

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

  // Legacy / simple wrapper
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
    // return this.blockManager.blockPlayer(attackerId, defenderId);
    return { success: false, result: "Not implemented" };
  }

  /**
   * Execute a pass action
   */
  /**
   * Execute a pass action
   */
  async throwBall(
    passerId: string,
    targetX: number,
    targetY: number
  ): Promise<{ success: boolean; result?: string }> {
    if (this.state.phase !== GamePhase.PLAY)
      return { success: false, result: "Not in Play phase" };

    const passer = this.getPlayerById(passerId);
    if (!passer || !passer.gridPosition) {
      return { success: false, result: "Player not found or not on pitch" };
    }

    // Check if player has the ball
    const hasBall =
      this.state.ballPosition &&
      this.state.ballPosition.x === passer.gridPosition.x &&
      this.state.ballPosition.y === passer.gridPosition.y;

    if (!hasBall) {
      return { success: false, result: "Player does not have the ball" };
    }

    // Count marking opponents for pass
    const opponentTeam =
      passer.teamId === this.team1.id ? this.team2 : this.team1;
    const markingOpponents = this.catchController.countMarkingOpponents(
      passer.gridPosition,
      opponentTeam.players
    );

    // Emit pass declared event
    // SceneOrchestrator should listen to this and Zoom In on Passer
    this.eventBus.emit(GameEventNames.PassDeclared, {
      playerId: passerId,
      targetX,
      targetY,
    });

    // Wait for camera zoom/pan (Simulating the user looking at the passer)
    await this.delay(800);

    // --- 1. ATTEMPT PASS ---
    const passResult = this.passController.attemptPass(
      passer,
      passer.gridPosition,
      { x: targetX, y: targetY },
      markingOpponents
    );

    // Handle fumbled pass
    if (passResult.fumbled) {
      this.state.ballPosition = passResult.finalPosition;
      await this.delay(1000); // Wait for fumble animation

      this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
      this.triggerTurnover("Fumbled Pass");
      return { success: false, result: "Pass fumbled" };
    }

    // --- 2. INTERCEPTIONS ---
    const interceptors = this.passController.checkInterceptions(
      passer.gridPosition,
      { x: targetX, y: targetY },
      opponentTeam.players,
      passResult.accurate
    );

    if (interceptors.length > 0) {
      // Small pause before checking interceptions
      await this.delay(500);
    }

    for (const interceptor of interceptors) {
      const interceptingPlayer = this.getPlayerById(interceptor.playerId);
      if (!interceptingPlayer || !interceptingPlayer.gridPosition) continue;

      const markingPasser = this.catchController.countMarkingOpponents(
        interceptingPlayer.gridPosition,
        passer.teamId === this.team1.id
          ? this.team1.players
          : this.team2.players
      );

      const intercepted = this.passController.attemptInterception(
        interceptingPlayer,
        interceptor.modifier,
        markingPasser
      );

      if (intercepted) {
        this.state.ballPosition = interceptingPlayer.gridPosition;
        this.eventBus.emit(GameEventNames.PassIntercepted, {
          passerId: passerId,
          interceptorId: interceptor.playerId,
          position: interceptingPlayer.gridPosition,
        });
        await this.delay(1000); // Wait for interception animation

        this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
        this.triggerTurnover("Pass Intercepted");
        return { success: false, result: "Pass intercepted" };
      }
    }

    // --- 3. BALL LANDING & CATCH ---

    // Calculate flight time based on scatter or direct
    // For Inaccurate pass, logic now implies direct flight visual (even if 3 D8s rolled logic-wise)
    // passResult.scatterPath might exist, but we might visualize it fast or direct.
    // If PassController was updated to emit direct path for visual, flightDuration calculation here
    // depends on what SceneOrchestrator does.
    // Assuming SceneOrchestrator plays one long arc for direct flight.
    const flightDuration = 1000;
    await this.delay(flightDuration);

    this.state.ballPosition = passResult.finalPosition;

    // Check for player at landing position
    const receivingPlayer = this.getPlayerAtPosition(passResult.finalPosition);

    if (receivingPlayer) {
      // --- 4. CATCH ATTEMPT ---
      await this.delay(300); // Brief pause before catch attempt

      const markingCatch = this.catchController.countMarkingOpponents(
        passResult.finalPosition,
        receivingPlayer.teamId === this.team1.id
          ? this.team2.players
          : this.team1.players
      );

      this.eventBus.emit(GameEventNames.CatchAttempted, {
        playerId: receivingPlayer.id,
        position: passResult.finalPosition,
      });

      const catchResult = this.passController.attemptCatch(
        receivingPlayer,
        passResult.accurate, // +1 modifier if accurate
        markingCatch
      );

      await this.delay(500); // Wait for roll result visualization

      if (catchResult.success) {
        // SUCCESS
        this.eventBus.emit(GameEventNames.PassCompleted, {
          playerId: passerId,
          catcherId: receivingPlayer.id,
          position: passResult.finalPosition,
        });

        if (receivingPlayer.teamId !== passer.teamId) {
          await this.delay(1000);
          this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
          this.triggerTurnover("Ball Caught by Opponent");
        } else {
          // Success! Passer finished.
          this.finishActivation(passerId);
          await this.delay(500);
          this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
        }

        return { success: true, result: "Pass completed" };
      } else {
        // --- 5. FAILED CATCH -> BOUNCE ---
        const bouncePos = this.passController.bounceBall(
          passResult.finalPosition
        );
        this.state.ballPosition = bouncePos;

        this.eventBus.emit(GameEventNames.PassFumbled, {
          playerId: receivingPlayer.id,
          position: passResult.finalPosition,
          bouncePosition: bouncePos,
        });

        await this.delay(800); // Wait for bounce

        // Check bounce catch (placeholder)
        // ...

        this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
        this.triggerTurnover("Failed Catch");
        return { success: false, result: "Catch failed" };
      }
    }

    // --- 6. BALL ON GROUND (Empty Square) ---
    // Ball lands in empty square -> One final bounce
    const bouncePos = this.passController.bounceBall(passResult.finalPosition);
    this.state.ballPosition = bouncePos;

    // Reuse PassFumbled handling for bounce visual
    // We pass passerId as the source of "fumble" (inaccurate pass)
    this.eventBus.emit(GameEventNames.PassFumbled, {
      playerId: passerId,
      position: passResult.finalPosition,
      bouncePosition: bouncePos,
    });

    await this.delay(800); // Wait for bounce animation

    this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
    this.triggerTurnover("Ball not caught");
    return { success: false, result: "Pass Incomplete" };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get player at a specific position
   */
  private getPlayerAtPosition(position: {
    x: number;
    y: number;
  }): Player | undefined {
    return (
      this.team1.players.find(
        (p) =>
          p.gridPosition &&
          p.gridPosition.x === position.x &&
          p.gridPosition.y === position.y &&
          p.status === PlayerStatus.ACTIVE
      ) ||
      this.team2.players.find(
        (p) =>
          p.gridPosition &&
          p.gridPosition.x === position.x &&
          p.gridPosition.y === position.y &&
          p.status === PlayerStatus.ACTIVE
      )
    );
  }

  passBall(
    passerId: string,
    targetSquare: { x: number; y: number }
  ): { success: boolean; result?: string } {
    // Legacy method - redirect to throwBall
    // Note: This is async but returning sync for backwards compatibility
    // Consider refactoring callers to use throwBall directly
    this.throwBall(passerId, targetSquare.x, targetSquare.y);
    return { success: true, result: "Pass initiated" };
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

    // Auto-proceed to End Drive after delay? Or wait for UI?
    // Let's providing a method to proceed
    setTimeout(() => this.startEndDriveSequence(), 2000);
  }

  startEndDriveSequence(): void {
    // End of Drive
    // 1. Recover KO
    this.state.subPhase = SubPhase.RECOVER_KO;
    this.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.TOUCHDOWN,
      subPhase: SubPhase.RECOVER_KO,
    });

    // Auto-resolve KO for now (or placeholder)
    this.recoverKO();
  }

  recoverKO(): void {
    // TODO: Roll for each KO player
    // For now, just skip to Secret Weapons or Reset
    setTimeout(() => {
      this.state.subPhase = SubPhase.SECRET_WEAPONS;
      this.eventBus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.TOUCHDOWN,
        subPhase: SubPhase.SECRET_WEAPONS,
      });

      // Done with drive, new kick off
      setTimeout(() => {
        this.resetForKickoff();
      }, 1000);
    }, 1000);
  }

  resetForKickoff(): void {
    // Prepare for new drive
    // Swap kicking/receiving roles? Usually receiving team now kicks.
    // The team that SCORED kicks off next.
    // Assuming we know who scored from 'activeTeamId' or pass it.
    // Actually Touchdown event has it.

    // Let's assume the ACTIVE team scored (usually true).
    const scoringTeamId = this.state.activeTeamId;
    if (scoringTeamId) {
      this.startSetup(scoringTeamId); // Scorer kicks off
    } else {
      // Fallback
      this.startSetup(
        this.turnManager.getDriveKickingTeamId() || this.team1.id
      );
    }
  }

  getScore(teamId: string): number {
    return this.state.score[teamId] || 0;
  }

  // ===== Private Helper Methods =====
  // Scenario loading delegated to ScenarioLoader service

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
    return this.movementManager.movePlayer(playerId, path);
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
