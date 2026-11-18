import { assertPregamePurchasesComplete } from "@/game/inducements/pregame";
/**
 * GameService - Core game logic service
 *
 * Pure TypeScript implementation with no Phaser dependencies.
 * Manages game state, phase transitions, and turn management. The managers
 * it wires together are built in gameService/parts.ts; the longer steps
 * live beside it in gameService/.
 */

import { IGameService } from "./interfaces/IGameService.js";
import { IEventBus } from "./EventBus.js";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { ActionType, GameEventNames } from "../types/events";
import { Team } from "@/types/Team";
import { Player } from "@/types/Player";
import { BlockResult, BlockResolutionService } from "./BlockResolutionService";
import { NextHalf, TurnManagerState } from "../game/managers/TurnManager";
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
import { SwoopFacing } from "@/game/rules/throwTeammate";
import { BallAndChainSquare } from "@/game/operations/BallAndChainOperation";
import { FoulController } from "@/game/controllers/FoulController";
import { IRNGService } from "./rng/RNGService.js";
import { RerollArbiter, DecisionService } from "@/game/skills";
import { RerollSource } from "@/types/decisions";
import { Inducement, InducementOffer } from "@/types/Inducements";
import { BlockReplacement } from "@/types/BlockReplacement";
import { GameParts, createGameParts } from "./gameService/parts";
import { createInitialState, createMatchState } from "./gameService/matchStart";
import * as activation from "./gameService/activation";
import * as answers from "./gameService/decisionAnswers";
import * as ballActions from "./gameService/ballActions";
import * as blockActions from "./gameService/blockActions";
import * as declaration from "./gameService/declareAction";
import * as drive from "./gameService/driveLifecycle";
import * as inducements from "./gameService/inducements";
import * as matchStart from "./gameService/matchStart";
import * as moves from "./gameService/moveActions";
import * as roster from "./gameService/roster";
import * as specials from "./gameService/specialActions";

export class GameService implements IGameService {
  /** The managers and the state they share (gameService/parts.ts). */
  private readonly parts: GameParts;
  /** Blitzers whose one Block is spent this activation. */
  private readonly blitzBlockUsed: Set<string>;

  /** The opening state of a fresh match, teams readied (matchStart.ts). */
  public static createMatchState = createMatchState;
  /** A default initial state. */
  public static createInitialState = createInitialState;

  public diceController: DiceController;
  public flowManager: GameFlowManager;

  constructor(
    eventBus: IEventBus,
    team1: Team,
    team2: Team,
    rngService: IRNGService,
    blockResolutionService: BlockResolutionService,
    initialState?: GameState,
    delay: DelayProvider = realTimeDelay
  ) {
    this.parts = createGameParts({
      game: this,
      eventBus,
      team1,
      team2,
      initialState,
      rngService,
      blockResolutionService,
      delay,
    });
    this.diceController = this.parts.diceController;
    this.flowManager = this.parts.flowManager;
    this.blitzBlockUsed = this.parts.marks.blitzBlockUsed;

    // A headless/sandbox scenario may begin directly in PLAY, bypassing the
    // normal kickoff transition, so seed its half-level Leader bank here.
    if (this.parts.state.phase === GamePhase.PLAY) {
      this.parts.rerollArbiter.beginHalf([team1.id, team2.id]);
    }

    inducements.restoreMatchInducements(this.parts);
  }

  // ===== State Queries =====

  getState(): GameState {
    return this.parts.state;
  }

  getPhase(): GamePhase {
    return this.parts.state.phase;
  }

  getSubPhase(): SubPhase | undefined {
    return this.parts.state.subPhase;
  }

  getActiveTeamId(): string | null {
    return this.parts.state.activeTeamId;
  }
  public getPassController(): PassController {
    return this.parts.passController;
  }
  public getCatchController(): CatchController {
    return this.parts.catchController;
  }

  public getBallMovementController(): BallMovementController {
    return this.parts.ballManager.movementController;
  }

  public getDiceController(): DiceController {
    return this.diceController;
  }

  public getArmourController(): ArmourController {
    return this.parts.armourController;
  }

  public getInjuryController(): InjuryController {
    return this.parts.injuryController;
  }

  public getFoulController(): FoulController {
    return this.parts.foulController;
  }

  public getFlowContext(): import("@/game/core/GameFlowManager").FlowContext {
    return this.flowManager.context;
  }

  public getDecisionService(): DecisionService {
    return this.parts.decisionService;
  }

  public getRerollArbiter(): RerollArbiter {
    return this.parts.rerollArbiter;
  }

  /** Answer a pending reroll decision (dialog or protocol reply). */
  public answerReroll(accept: boolean, source?: RerollSource): boolean {
    return answers.answerReroll(this.parts.decisionService, accept, source);
  }

  /** Answer a pending reaction decision (dialog or protocol reply). */
  public answerReaction(accept: boolean): boolean {
    return answers.answerReaction(this.parts.decisionService, accept);
  }

  /** Answer a pending Bloodlust bite-target decision; undefined bites nobody. */
  public answerBiteTarget(targetId?: string): boolean {
    return answers.answerBiteTarget(this.parts.decisionService, targetId);
  }

  /** Answer a pending interception decision; undefined declines. */
  public answerInterception(playerId?: string): boolean {
    return answers.answerInterception(this.parts.decisionService, playerId);
  }

  /** Answer a pending Apothecary decision (dialog or protocol reply). */
  public answerApothecary(accept: boolean): boolean {
    return answers.answerApothecary(this.parts.decisionService, accept);
  }

  /** Answer a pending Prayer or Desperate Measure choice. */
  public answerInducementChoice(
    answer: import("@/types/decisions").InducementChoiceDecisionAnswer
  ): boolean {
    return answers.answerInducementChoice(this.parts.decisionService, answer);
  }

  /** Answer a pending Foul assists decision with the assists that count. */
  public answerFoulAssists(count: number): boolean {
    return answers.answerFoulAssists(this.parts.decisionService, count);
  }

  /** Commit a confirmed pregame inducement selection into match state. */
  public commitInducements(
    profile: import("@/types/Inducements").InducementRuleProfile,
    budgets: Record<string, number>,
    inventory: import("@/types/Inducements").InducementInventoryEntry[]
  ): void {
    inducements.commitInducements(this.parts, profile, budgets, inventory);
  }

  getInducementOffer(): InducementOffer {
    return inducements.inducementOffer(this.parts);
  }

  selectInducement(
    teamId: string,
    inducement: Inducement,
    quantity: number
  ): { ok: boolean; errors: string[] } {
    return inducements.selectInducement(
      this.parts,
      teamId,
      inducement,
      quantity
    );
  }

  removeInducement(
    teamId: string,
    inducement: Inducement
  ): { ok: boolean; errors: string[] } {
    return inducements.selectInducement(this.parts, teamId, inducement, 0);
  }

  /** Confirm a team's pregame selection; commits the inventory once both have. */
  confirmInducements(teamId: string): { ok: boolean; errors: string[] } {
    return inducements.confirmInducements(this.parts, teamId);
  }

  getTurnNumber(teamId: string): number {
    return this.parts.turnManager.getTurnNumber(teamId);
  }

  seedTurnCounts(turnNumber: number): void {
    this.parts.turnManager.seedTurnCounts(turnNumber);
  }

  captureTurnManagerState(): TurnManagerState {
    return this.parts.turnManager.captureState();
  }

  restoreTurnManagerState(snapshot: TurnManagerState): void {
    this.parts.turnManager.restoreState(snapshot);
  }

  resyncSetupFromTeams(): void {
    this.parts.setupManager.resyncFromTeams();
  }

  // ===== Setup Phase =====
  startSetup(startingTeamId?: string): void {
    assertPregamePurchasesComplete(this.parts.state);
    matchStart.rollMasterChefs(this.parts);
    this.parts.setupManager.startSetup(startingTeamId);
  }

  placePlayer(playerId: string, x: number, y: number): boolean {
    return this.parts.setupManager.placePlayer(playerId, x, y);
  }

  removePlayer(playerId: string): void {
    this.parts.setupManager.removePlayer(playerId);
  }

  swapPlayers(player1Id: string, player2Id: string): boolean {
    return this.parts.setupManager.swapPlayers(player1Id, player2Id);
  }

  confirmSetup(teamId: string): boolean {
    return this.parts.setupManager.confirmSetup(teamId);
  }

  isSetupComplete(teamId: string): boolean {
    return this.parts.setupManager.isSetupComplete(teamId);
  }

  getSetupStatus(
    teamId: string
  ): import("../types/SetupTypes").SetupTeamStatus | undefined {
    return this.parts.setupManager.getSetupStatus(teamId);
  }

  getLastSetupError(): string | null {
    return this.parts.setupManager.getLastError();
  }

  isSetupEligible(playerId: string): boolean {
    return this.parts.setupManager.isAvailable(playerId);
  }

  applySetupFormation(
    teamId: string,
    formation: import("../types/SetupTypes").FormationPosition[]
  ): import("../types/SetupTypes").SetupFormationResult {
    return this.parts.setupManager.applyFormation(teamId, formation);
  }

  resolveSetupConcession(teamId: string, concede: boolean): boolean {
    return this.parts.setupManager.resolveConcession(teamId, concede);
  }

  getSetupZone(
    teamId: string
  ): import("../types/SetupTypes").SetupZone | undefined {
    return this.parts.setupManager.getSetupZone(teamId);
  }

  // ===== Kickoff Phase =====

  startKickoff(): void {
    drive.startKickoff(this.parts);
  }

  selectKicker(playerId: string): void {
    drive.selectKicker(this.parts, playerId);
  }

  async kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    await this.parts.ballManager.kickBall(
      isTeam1Kicking,
      playerId,
      targetX,
      targetY
    );
  }

  rollKickoff(): void {
    void this.parts.ballManager.rollKickoff();
  }

  resolveBallPlacement(): void {
    this.parts.ballManager.resolveBallPlacement();
  }

  /** Touchback: receiving coach hands the ball to one of their players. */
  awardTouchback(playerId: string): boolean {
    return this.parts.ballManager.awardTouchback(playerId);
  }

  isTouchbackPending(): boolean {
    return this.parts.ballManager.isTouchbackPending();
  }

  kickoffBounceTouchback(to: { x: number; y: number }): boolean {
    return this.parts.ballManager.kickoffBounceTouchback(to);
  }

  isKickoffTableResolving(): boolean {
    return this.parts.kickoffEventManager.isResolving();
  }

  getKickoffEventStep():
    | import("@/game/kickoff/KickoffEventManager").KickoffEventStepState
    | null {
    return this.parts.kickoffEventManager.getStep();
  }

  selectKickoffEventPlayer(playerId: string): boolean {
    return this.parts.kickoffEventManager.togglePlayerSelection(playerId);
  }

  moveKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    return this.parts.kickoffEventManager.movePlayer(playerId, x, y);
  }

  placeKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    return this.parts.kickoffEventManager.placePlayer(playerId, x, y);
  }

  confirmKickoffEventStep(): boolean {
    return this.parts.kickoffEventManager.confirmStep();
  }

  skipKickoffEventStep(): boolean {
    return this.parts.kickoffEventManager.skipStep();
  }

  // ===== Sub-Phase Helpers =====

  /** The opening is done (teams introduced, weather shown): toss the coin. */
  beginCoinFlip(): void {
    matchStart.beginCoinFlip(this.parts);
  }

  readyForWeather(teamId: string): boolean {
    return matchStart.readyForWeather(this.parts, teamId);
  }

  // ===== Turn Management =====
  setCoinFlipWinner(winningTeamId: string): void {
    this.startSetup(winningTeamId);
  }

  startGame(kickingTeamId: string): void {
    matchStart.startGame(this.parts, kickingTeamId);
  }

  startTurn(teamId: string): void {
    this.parts.turnManager.startTurn(teamId);
  }

  endTurn(): void {
    activation.endTurn(this.parts);
  }

  endHalf(): void {
    this.parts.turnManager.endHalf();
  }

  finishActivation(playerId: string): void {
    activation.finishActivation(this.parts, playerId);
  }

  public hasUsedBlitzBlock(playerId: string): boolean {
    if (!this.blitzBlockUsed.has(playerId)) return false;
    // The guard only means anything INSIDE the Blitz that spent the block.
    // A flag surviving an earlier activation must never refuse a later
    // Block — that is what produced "this Blitz has already used its Block"
    // on a plain Block the player was entitled to make.
    return (
      this.parts.state.activePlayer?.id === playerId &&
      this.parts.state.activePlayer?.action === "blitz"
    );
  }

  public finishBlockActivation(attackerId: string): void {
    activation.finishBlockActivation(this.parts, attackerId);
  }

  public finishStabActivation(attackerId: string): Promise<void> {
    return activation.finishStabActivation(this.parts, attackerId);
  }

  canActivate(playerId: string): boolean {
    return activation.canActivate(this.parts, playerId);
  }

  playerAction(playerId: string): boolean {
    return this.canActivate(playerId);
  }

  hasPlayerActed(playerId: string): boolean {
    return activation.hasPlayerActed(this.parts, playerId);
  }

  // ===== Action Methods =====

  previewBlock(attackerId: string, defenderId: string): void {
    if (activation.awaitingSecondAction(this.parts, attackerId)) return;
    this.parts.blockManager.previewBlock(attackerId, defenderId);
  }

  multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    return blockActions.multipleBlock(
      this.parts,
      attackerId,
      defender1Id,
      defender2Id
    );
  }

  rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void> {
    return blockActions.rollBlockDice(
      this.parts,
      attackerId,
      defenderId,
      numDice,
      isAttackerChoice
    );
  }

  public chargeBlitzBlockSquare(attackerId: string): Promise<boolean> {
    return blockActions.chargeBlitzBlockSquare(this.parts, attackerId);
  }

  resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    return blockActions.resolveBlock(
      this.parts,
      attackerId,
      defenderId,
      result
    );
  }

  /** Keep an uphill roll without a re-roll; the defender then picks. */
  keepBlockDice(attackerId: string): void {
    this.parts.blockManager.keepBlockDice(attackerId);
  }

  /** Team Re-roll on a block: re-roll all the dice. */
  teamRerollBlock(attackerId: string): void {
    this.parts.blockManager.teamRerollBlock(attackerId);
  }

  /** Pro on a block: re-roll a single die (3+ to use). */
  proRerollBlockDie(attackerId: string, dieIndex: number): void {
    this.parts.blockManager.proRerollBlockDie(attackerId, dieIndex);
  }

  /** Brawler on a block: re-roll the single Both Down die. */
  brawlerRerollBlockDie(attackerId: string): void {
    this.parts.blockManager.brawlerRerollBlockDie(attackerId);
  }

  /** Veteran on a block: re-roll all the dice, once per game (D8). */
  veteranRerollBlock(attackerId: string): void {
    this.parts.blockManager.veteranRerollBlock(attackerId);
  }

  public executePush(
    attackerId: string,
    defenderId: string,
    direction: { x: number; y: number },
    resultType: string,
    followUp: boolean
  ): Promise<void> {
    return blockActions.executePush(this.parts, attackerId, defenderId, {
      direction,
      resultType,
      followUp,
    });
  }

  public followUpPush(
    attackerId: string,
    targetSquare: { x: number; y: number }
  ): Promise<void> {
    return blockActions.followUpPush(this.parts, attackerId, targetSquare);
  }

  triggerTurnover(reason: string): void {
    activation.triggerTurnover(this.parts, reason);
  }

  isTurnoverInProgress(): boolean {
    return this.parts.turnManager.isTurnoverInProgress();
  }

  blockPlayer(
    _attackerId: string,
    _defenderId: string
  ): { success: boolean; result?: string } {
    return { success: false, result: "Not implemented" };
  }

  throwBall(
    passerId: string,
    targetX: number,
    targetY: number,
    hailMary = false
  ): Promise<{ success: boolean; result?: string }> {
    return ballActions.throwBall(
      this.parts,
      passerId,
      { x: targetX, y: targetY },
      hailMary
    );
  }

  handOffBall(
    passerId: string,
    targetPlayerId: string
  ): Promise<{ success: boolean; result?: string }> {
    return ballActions.handOffBall(this.parts, passerId, targetPlayerId);
  }

  puntBall(playerId: string, facingX: number, facingY: number): Promise<void> {
    return ballActions.puntBall(this.parts, playerId, facingX, facingY);
  }

  public getPlayerAt(x: number, y: number): Player | undefined {
    return roster.playerAt(this.parts, x, y);
  }

  public getOpponents(teamId: string): Player[] {
    return roster.opponentsOf(this.parts, teamId);
  }

  public getTeammates(playerId: string): Player[] {
    return roster.teammatesOf(this.parts, playerId);
  }

  passBall(
    passerId: string,
    targetSquare: { x: number; y: number }
  ): { success: boolean; result?: string } {
    this.throwBall(passerId, targetSquare.x, targetSquare.y);
    return { success: true, result: "Pass initiated" };
  }

  setBallPosition(x: number, y: number): void {
    this.parts.state.ballPosition = { x, y };
    this.parts.eventBus.emit(GameEventNames.BallPlaced, { x, y });
  }

  // ===== Score Management =====

  addTouchdown(teamId: string, scorerId?: string): void {
    drive.addTouchdown(this.parts, teamId, scorerId);
  }

  endDrive(reason: "touchdown" | "halftime", next: NextHalf): void {
    drive.endDrive(this.parts, reason, next);
  }

  resetDriveState(): void {
    drive.resetDriveState(this.parts);
  }

  rollKORecovery(
    beat: () => Promise<void> = () => Promise.resolve()
  ): Promise<void> {
    return drive.rollKORecovery(this.parts, beat);
  }

  checkForTouchdown(playerId: string): boolean {
    return drive.checkForTouchdown(this.parts, playerId);
  }

  /** The pre-match toss on the seeded RNG: team 1 is heads. Returns the winner's id. */
  tossCoin(): string {
    assertPregamePurchasesComplete(this.parts.state);
    return this.diceController.tossCoin(this.parts.team1, this.parts.team2);
  }

  canCoinFlip(): boolean {
    return matchStart.canCoinFlip(this.parts);
  }

  getScore(teamId: string): number {
    return this.parts.state.score[teamId] || 0;
  }

  public getPlayerById(playerId: string): Player | undefined {
    return roster.playerById(this.parts, playerId);
  }

  // ===== Movement Implementation =====

  getMovementUsed(playerId: string): number {
    return this.parts.movementManager.getMovementUsed(playerId);
  }

  getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[] {
    return this.parts.movementManager.getAvailableMovements(playerId);
  }

  movePlayer(
    playerId: string,
    path: { x: number; y: number }[]
  ): Promise<void> {
    return moves.movePlayer(this.parts, playerId, path);
  }

  dropBallWithFumblerooski(
    playerId: string,
    square: { x: number; y: number }
  ): boolean {
    return moves.dropBallWithFumblerooski(this.parts, playerId, square);
  }

  standUp(playerId: string): Promise<void> {
    return moves.standUp(this.parts, playerId);
  }

  jumpPlayer(
    playerId: string,
    target: { x: number; y: number }
  ): Promise<void> {
    return moves.jumpPlayer(this.parts, playerId, target);
  }

  declareAction(
    playerId: string,
    action: ActionType,
    requestedReplacement?: BlockReplacement,
    options: { razzleDazzle?: boolean } = {}
  ): boolean {
    return declaration.declareAction(
      this.parts,
      playerId,
      action,
      requestedReplacement,
      options
    );
  }

  cancelAction(playerId: string): boolean {
    return this.parts.playerActionManager.cancelAction(playerId);
  }

  commitAction(playerId: string): void {
    this.parts.playerActionManager.commitAction(playerId);
  }

  attemptPickup(player: Player, position: { x: number; y: number }): boolean {
    return this.parts.ballManager.attemptPickup(player, position);
  }

  /** Throw-in from the square where the ball left the pitch (p.73). */
  throwInBall(from: { x: number; y: number }): void {
    this.parts.ballManager.throwIn(from);
  }

  public getTeam(teamId: string): Team | undefined {
    return roster.teamById(this.parts, teamId);
  }

  /** Both teams in `team1`, `team2` order — the order snapshots use. */
  public getTeams(): [Team, Team] {
    return [this.parts.team1, this.parts.team2];
  }

  public foulPlayer(
    foulerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    return specials.foulPlayer(this.parts, foulerId, targetX, targetY);
  }

  public stabPlayer(attackerId: string, targetId: string): Promise<boolean> {
    return specials.stabPlayer(this.parts, attackerId, targetId);
  }

  public throwTeammate(
    throwerId: string,
    teammateId: string,
    x: number,
    y: number,
    mode?: "throw" | "kick",
    swoopFacing?: SwoopFacing
  ): Promise<void> {
    return specials.throwTeammate(this.parts, {
      throwerId,
      teammateId,
      x,
      y,
      mode,
      swoopFacing,
    });
  }

  public throwBomb(throwerId: string, x: number, y: number): Promise<void> {
    return specials.throwBomb(this.parts, throwerId, x, y);
  }

  public ballAndChain(
    fanaticId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    return specials.ballAndChain(this.parts, fanaticId, facingX, facingY);
  }

  public ballAndChainCollision(
    square: BallAndChainSquare,
    targetId: string
  ): Promise<void> {
    return specials.ballAndChainCollision(this.parts, square, targetId);
  }

  public performSpecialAction(
    kind: BlockReplacement | "gaze",
    attackerId: string,
    targetId: string
  ): Promise<boolean> {
    return specials.performSpecialAction(
      this.parts,
      kind,
      attackerId,
      targetId
    );
  }
}
