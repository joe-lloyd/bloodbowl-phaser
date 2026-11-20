import { invokeCommand } from "./gameService/commandPromise";
import type * as SetupTypes from "@/types/SetupTypes";
import type * as InducementTypes from "@/types/Inducements";
import { assertPregamePurchasesComplete } from "@/game/inducements/pregame";

import { type IGameService } from "./interfaces/IGameService.js";
import { type IEventBus } from "./EventBus.js";
import { type GameState, GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "../types/events";
import { type Team } from "@/types/Team";
import { type Player } from "@/types/Player";
import {
  type BlockResult,
  BlockResolutionService,
} from "./BlockResolutionService";
import {
  type NextHalf,
  type TurnManagerState,
} from "../game/managers/TurnManager";
import { PassController } from "../game/controllers/PassController";
import { CatchController } from "../game/controllers/CatchController";
import { BallMovementController } from "../game/controllers/BallMovementController";
import { DiceController } from "../game/controllers/DiceController";
import { ArmourController } from "../game/controllers/ArmourController";
import { InjuryController } from "../game/controllers/InjuryController";
import {
  GameFlowManager,
  type DelayProvider,
  realTimeDelay,
} from "@/game/core/GameFlowManager";
import { type BallAndChainSquare } from "@/game/operations/BallAndChainOperation";
import { FoulController } from "@/game/controllers/FoulController";
import { type IRNGService } from "./rng/RNGService.js";
import { RerollArbiter, DecisionService } from "@/game/skills";
import { type RerollSource } from "@/types/decisions";
import { Inducement, type InducementOffer } from "@/types/Inducements";
import { type BlockReplacement } from "@/types/BlockReplacement";
import { type GameParts, createGameParts } from "./gameService/parts";
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
  private readonly parts: GameParts;

  private readonly blitzBlockUsed: Set<string>;

  public static createMatchState = createMatchState;

  public static createInitialState = createInitialState;

  public diceController: DiceController;
  public flowManager: GameFlowManager;

  constructor({
    eventBus,
    team1,
    team2,
    rngService,
    blockResolutionService,
    initialState,
    delay = realTimeDelay,
  }: {
    eventBus: IEventBus;
    team1: Team;
    team2: Team;
    rngService: IRNGService;
    blockResolutionService: BlockResolutionService;
    initialState?: GameState;
    delay?: DelayProvider;
  }) {
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

    if (this.parts.state.phase === GamePhase.PLAY) {
      this.parts.rerollArbiter.beginHalf([team1.id, team2.id]);
    }

    inducements.restoreMatchInducements(this.parts);
  }

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

  public answerReroll(accept: boolean, source?: RerollSource): boolean {
    return answers.answerReroll(this.parts.decisionService, accept, source);
  }

  public answerReaction(accept: boolean): boolean {
    return answers.answerReaction(this.parts.decisionService, accept);
  }

  public answerBiteTarget(targetId?: string): boolean {
    return answers.answerBiteTarget(this.parts.decisionService, targetId);
  }

  public answerInterception(playerId?: string): boolean {
    return answers.answerInterception(this.parts.decisionService, playerId);
  }

  public answerApothecary(accept: boolean): boolean {
    return answers.answerApothecary(this.parts.decisionService, accept);
  }

  public answerInducementChoice(
    answer: import("@/types/decisions").InducementChoiceDecisionAnswer
  ): boolean {
    return answers.answerInducementChoice(this.parts.decisionService, answer);
  }

  public answerFoulAssists(count: number): boolean {
    return answers.answerFoulAssists(this.parts.decisionService, count);
  }

  public commitInducements(
    profile: InducementTypes.InducementRuleProfile,
    budgets: Record<string, number>,
    inventory: InducementTypes.InducementInventoryEntry[]
  ): void {
    inducements.commitInducements({
      parts: this.parts,
      profile,
      budgets,
      inventory,
    });
  }

  getInducementOffer(): InducementOffer {
    return inducements.inducementOffer(this.parts);
  }

  selectInducement(
    teamId: string,
    inducement: Inducement,
    quantity: number
  ): { ok: boolean; errors: string[] } {
    return inducements.selectInducement({
      parts: this.parts,
      teamId,
      inducement,
      quantity,
    });
  }

  removeInducement(
    teamId: string,
    inducement: Inducement
  ): { ok: boolean; errors: string[] } {
    return inducements.selectInducement({
      parts: this.parts,
      teamId,
      inducement,
      quantity: 0,
    });
  }

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

  getSetupStatus(teamId: string): SetupTypes.SetupTeamStatus | undefined {
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
    formation: SetupTypes.FormationPosition[]
  ): SetupTypes.SetupFormationResult {
    return this.parts.setupManager.applyFormation(teamId, formation);
  }

  resolveSetupConcession(teamId: string, concede: boolean): boolean {
    return this.parts.setupManager.resolveConcession(teamId, concede);
  }

  getSetupZone(teamId: string): SetupTypes.SetupZone | undefined {
    return this.parts.setupManager.getSetupZone(teamId);
  }

  startKickoff(): void {
    drive.startKickoff(this.parts);
  }

  selectKicker(playerId: string): void {
    drive.selectKicker(this.parts, playerId);
  }

  async kickBall({
    isTeam1Kicking,
    playerId,
    targetX,
    targetY,
  }: Parameters<IGameService["kickBall"]>[0]): Promise<void> {
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

  beginCoinFlip(): void {
    matchStart.beginCoinFlip(this.parts);
  }

  readyForWeather(teamId: string): boolean {
    return matchStart.readyForWeather(this.parts, teamId);
  }

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

    return (
      this.parts.state.activePlayer?.id === playerId &&
      this.parts.state.activePlayer.action === "blitz"
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

  hasPlayerActed(playerId: string): boolean {
    return activation.hasPlayerActed(this.parts, playerId);
  }

  previewBlock(attackerId: string, defenderId: string): void {
    if (activation.awaitingSecondAction(this.parts, attackerId)) return;
    this.parts.blockManager.previewBlock(attackerId, defenderId);
  }

  multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    return blockActions.multipleBlock({
      parts: this.parts,
      attackerId,
      defender1Id,
      defender2Id,
    });
  }

  rollBlockDice({
    attackerId,
    defenderId,
    numDice,
    isAttackerChoice,
  }: Parameters<IGameService["rollBlockDice"]>[0]): Promise<void> {
    return blockActions.rollBlockDice({
      parts: this.parts,
      attackerId,
      defenderId,
      numDice,
      isAttackerChoice,
    });
  }

  public chargeBlitzBlockSquare(attackerId: string): Promise<boolean> {
    return blockActions.chargeBlitzBlockSquare(this.parts, attackerId);
  }

  resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    return blockActions.resolveBlock({
      parts: this.parts,
      attackerId,
      defenderId,
      result,
    });
  }

  keepBlockDice(attackerId: string): void {
    this.parts.blockManager.keepBlockDice(attackerId);
  }

  teamRerollBlock(attackerId: string): void {
    this.parts.blockManager.teamRerollBlock(attackerId);
  }

  proRerollBlockDie(attackerId: string, dieIndex: number): void {
    this.parts.blockManager.proRerollBlockDie(attackerId, dieIndex);
  }

  brawlerRerollBlockDie(attackerId: string): void {
    this.parts.blockManager.brawlerRerollBlockDie(attackerId);
  }

  veteranRerollBlock(attackerId: string): void {
    this.parts.blockManager.veteranRerollBlock(attackerId);
  }

  public executePush({
    attackerId,
    defenderId,
    direction,
    resultType,
    followUp,
  }: Parameters<IGameService["executePush"]>[0]): Promise<void> {
    return blockActions.executePush({
      parts: this.parts,
      attackerId,
      defenderId,
      push: {
        direction,
        resultType,
        followUp,
      },
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

  throwBall({
    passerId,
    targetX,
    targetY,
    hailMary = false,
  }: Parameters<IGameService["throwBall"]>[0]): Promise<{
    success: boolean;
    result?: string;
  }> {
    return invokeCommand(() =>
      ballActions.throwBall({
        parts: this.parts,
        passerId,
        target: { x: targetX, y: targetY },
        hailMary,
      })
    );
  }

  handOffBall(
    passerId: string,
    targetPlayerId: string
  ): Promise<{ success: boolean; result?: string }> {
    return invokeCommand(() =>
      ballActions.handOffBall(this.parts, passerId, targetPlayerId)
    );
  }

  puntBall(playerId: string, facingX: number, facingY: number): Promise<void> {
    return invokeCommand(() => {
      ballActions.puntBall({
        parts: this.parts,
        playerId,
        facingX,
        facingY,
      });
    });
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

  setBallPosition(x: number, y: number): void {
    this.parts.state.ballPosition = { x, y };
    this.parts.eventBus.emit(GameEventNames.BallPlaced, { x, y });
  }

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

  tossCoin(): string {
    assertPregamePurchasesComplete(this.parts.state);
    return this.diceController.tossCoin(this.parts.team1, this.parts.team2);
  }

  canCoinFlip(): boolean {
    return matchStart.canCoinFlip(this.parts);
  }

  public getPlayerById(playerId: string): Player | undefined {
    return roster.playerById(this.parts, playerId);
  }

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

  declareAction({
    playerId,
    action,
    blockReplacement: requestedReplacement,
    options = {},
  }: Parameters<IGameService["declareAction"]>[0]): boolean {
    return declaration.declareAction({
      parts: this.parts,
      playerId,
      action,
      ...(requestedReplacement === undefined
        ? {}
        : { blockReplacement: requestedReplacement }),
      options,
    });
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

  throwInBall(
    from: { x: number; y: number },
    toward?: { x: number; y: number },
    kickoff?: boolean
  ): void {
    this.parts.ballManager.throwIn(from, toward, kickoff);
  }

  public getTeam(teamId: string): Team | undefined {
    return roster.teamById(this.parts, teamId);
  }

  public getTeams(): [Team, Team] {
    return [this.parts.team1, this.parts.team2];
  }

  public foulPlayer(
    foulerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    return specials.foulPlayer({
      parts: this.parts,
      foulerId,
      targetX,
      targetY,
    });
  }

  public stabPlayer(attackerId: string, targetId: string): Promise<boolean> {
    return specials.stabPlayer(this.parts, attackerId, targetId);
  }

  public throwTeammate({
    throwerId,
    teammateId,
    x,
    y,
    mode,
    swoopFacing,
  }: Parameters<IGameService["throwTeammate"]>[0]): Promise<void> {
    return invokeCommand(() => {
      specials.throwTeammate(this.parts, {
        throwerId,
        teammateId,
        x,
        y,
        ...(mode === undefined ? {} : { mode }),
        ...(swoopFacing === undefined ? {} : { swoopFacing }),
      });
    });
  }

  public throwBomb(throwerId: string, x: number, y: number): Promise<void> {
    return invokeCommand(() => {
      specials.throwBomb({
        parts: this.parts,
        throwerId,
        x,
        y,
      });
    });
  }

  public ballAndChain(
    fanaticId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    return invokeCommand(() => {
      specials.ballAndChain({
        parts: this.parts,
        fanaticId,
        facingX,
        facingY,
      });
    });
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
    return specials.performSpecialAction({
      parts: this.parts,
      kind,
      attackerId,
      targetId,
    });
  }
}
