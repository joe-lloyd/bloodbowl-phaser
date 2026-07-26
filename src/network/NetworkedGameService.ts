/**
 * NetworkedGameService - the guest's IGameService.
 *
 * The entire browser UI (scene, HUD, interaction controllers) drives the
 * game through IGameService, so this proxy is the whole guest client:
 * reads are answered from a passive local replica (kept fresh by snapshot
 * application in OnlineMatch), mutations become protocol commands sent to
 * the host, and engine-flow methods are no-ops — the host's engine drives
 * the flow and its results arrive as broadcast events/snapshots.
 *
 * Sync-returning mutators answer optimistically; the host's response (or
 * rejection) corrects the view within the same exchange.
 */

import { IGameService } from "../services/interfaces/IGameService";
import { GameService } from "../services/GameService";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
} from "../headless/protocol";
import { GamePhase, GameState, SubPhase } from "../types/GameState";
import { Player } from "../types/Player";
import { Team } from "../types/Team";
import { BlockResult } from "../services/BlockResolutionService";
import { ActionType } from "../types/events";
import { BlockReplacement } from "../types/BlockReplacement";

type Dispatch = (command: HeadlessCommand) => Promise<CommandResponse>;

export class NetworkedGameService implements IGameService {
  /** followUpPush + finishActivation arrive as one decision on the wire */
  private swallowNextFinish: string | null = null;

  constructor(
    /** Passive replica: never executes rules, only holds synced state */
    private readonly inner: GameService,
    private readonly dispatch: Dispatch,
    private readonly pendingDecision: () => PendingDecision | null
  ) {}

  private send(command: HeadlessCommand): void {
    void this.dispatch(command).then((response) => {
      if (!response.ok) {
        console.warn(
          `[Networked] host rejected ${command.type}: ${response.reason}`
        );
      }
    });
  }

  // ===== Reads: answered from the replica =====

  getState(): GameState {
    return this.inner.getState();
  }
  getPhase(): GamePhase {
    return this.inner.getPhase();
  }
  getSubPhase(): SubPhase | undefined {
    return this.inner.getSubPhase();
  }
  getActiveTeamId(): string | null {
    return this.inner.getActiveTeamId();
  }
  getTurnNumber(teamId: string): number {
    return this.inner.getTurnNumber(teamId);
  }
  seedTurnCounts(turnNumber: number): void {
    this.inner.seedTurnCounts(turnNumber);
  }
  captureTurnManagerState() {
    return this.inner.captureTurnManagerState();
  }
  restoreTurnManagerState(
    snapshot: import("../game/managers/TurnManager").TurnManagerState
  ): void {
    this.inner.restoreTurnManagerState(snapshot);
  }
  isTurnoverInProgress(): boolean {
    return this.inner.isTurnoverInProgress();
  }
  getPassController() {
    return this.inner.getPassController();
  }
  getCatchController() {
    return this.inner.getCatchController();
  }
  getBallMovementController() {
    return this.inner.getBallMovementController();
  }
  getDiceController() {
    return this.inner.getDiceController();
  }
  getArmourController() {
    return this.inner.getArmourController();
  }
  getInjuryController() {
    return this.inner.getInjuryController();
  }
  getFoulController() {
    return this.inner.getFoulController();
  }
  getFlowContext() {
    return this.inner.getFlowContext();
  }
  getDecisionService() {
    return this.inner.getDecisionService();
  }
  getRerollArbiter() {
    return this.inner.getRerollArbiter();
  }
  answerReroll(
    accept: boolean,
    source?: import("../types/decisions").RerollSource
  ): boolean {
    if (this.pendingDecision()?.type !== "reroll") return false;
    this.send({ type: "use-reroll", accept, source });
    return true;
  }
  answerReaction(accept: boolean): boolean {
    if (this.pendingDecision()?.type !== "reaction") return false;
    this.send({ type: "use-reaction", accept });
    return true;
  }
  answerInterception(playerId?: string): boolean {
    if (this.pendingDecision()?.type !== "interception") return false;
    this.send({ type: "choose-interception", playerId });
    return true;
  }
  isSetupComplete(teamId: string): boolean {
    // The replica's SetupManager.placedPlayers map is never populated on the
    // guest (placements are optimistic on the team objects + snapshot-applied),
    // so count placed players from grid positions instead. Mirrors
    // SetupManager.isSetupComplete's eligibility rule.
    const team = this.inner.getTeam(teamId);
    if (!team) return false;
    const eligible = team.players.filter(
      (p) => p.status !== "KO" && p.status !== "Injured" && p.status !== "Dead"
    );
    const available = Math.min(7, eligible.length);
    const placed = eligible.filter((p) => p.gridPosition).length;
    return placed === available;
  }
  getSetupZone(teamId: string) {
    return this.inner.getSetupZone(teamId);
  }
  isTouchbackPending(): boolean {
    return this.inner.isTouchbackPending();
  }
  canActivate(playerId: string): boolean {
    return this.inner.canActivate(playerId);
  }
  hasPlayerActed(playerId: string): boolean {
    return this.inner.hasPlayerActed(playerId);
  }
  canCoinFlip(): boolean {
    return this.inner.canCoinFlip();
  }
  getPlayerById(playerId: string): Player | undefined {
    return this.inner.getPlayerById(playerId);
  }
  getPlayerAt(x: number, y: number): Player | undefined {
    return this.inner.getPlayerAt(x, y);
  }
  getOpponents(teamId: string): Player[] {
    return this.inner.getOpponents(teamId);
  }
  getTeammates(playerId: string): Player[] {
    return this.inner.getTeammates(playerId);
  }
  finishBlockActivation(playerId: string): void {
    // Online Blitz continuation is not wired; end the activation as before.
    this.finishActivation(playerId);
  }
  hasUsedBlitzBlock(playerId: string): boolean {
    return this.inner.hasUsedBlitzBlock(playerId);
  }
  teamRerollBlock(attackerId: string): void {
    this.send({ type: "team-reroll-block", attackerId });
  }
  proRerollBlockDie(attackerId: string, dieIndex: number): void {
    this.send({ type: "pro-reroll-block", attackerId, dieIndex });
  }
  getTeam(teamId: string): Team | undefined {
    return this.inner.getTeam(teamId);
  }
  getMovementUsed(playerId: string): number {
    return this.inner.getMovementUsed(playerId);
  }
  getAvailableMovements(playerId: string) {
    return this.inner.getAvailableMovements(playerId);
  }
  /** Local preview only — no dice, no state change */
  previewBlock(attackerId: string, defenderId: string): void {
    this.inner.previewBlock(attackerId, defenderId);
  }

  // ===== Mutations: become protocol commands =====

  startSetup(startingTeamId?: string): void {
    if (startingTeamId) {
      this.send({ type: "start-setup", kickingTeamId: startingTeamId });
    }
  }
  placePlayer(playerId: string, x: number, y: number): boolean {
    // Optimistic: place immediately on the local replica so the board never
    // flashes back to the dugout while the command round-trips. The host's
    // response snapshot corrects/rolls back if the placement was illegal.
    const player = this.inner.getPlayerById(playerId);
    if (player) player.gridPosition = { x, y };
    this.send({ type: "place-player", playerId, x, y });
    return true;
  }
  removePlayer(playerId: string): void {
    const player = this.inner.getPlayerById(playerId);
    if (player) player.gridPosition = undefined;
    this.send({ type: "remove-player", playerId });
  }
  swapPlayers(player1Id: string, player2Id: string): boolean {
    const a = this.inner.getPlayerById(player1Id);
    const b = this.inner.getPlayerById(player2Id);
    if (a && b) {
      const tmp = a.gridPosition;
      a.gridPosition = b.gridPosition;
      b.gridPosition = tmp;
    }
    this.send({ type: "swap-players", player1Id, player2Id });
    return true;
  }
  confirmSetup(teamId: string): void {
    this.send({ type: "confirm-setup", teamId });
  }
  selectKicker(playerId: string): void {
    this.send({ type: "select-kicker", playerId });
  }
  async kickBall(
    _isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    await this.dispatch({
      type: "kick-ball",
      playerId,
      x: targetX,
      y: targetY,
    });
  }
  awardTouchback(playerId: string): boolean {
    this.send({ type: "touchback", playerId });
    return true;
  }
  declareAction(
    playerId: string,
    action: ActionType,
    blockReplacement?: BlockReplacement
  ): boolean {
    this.send({
      type: "declare-action",
      playerId,
      action,
      blockReplacement,
    });
    return true;
  }
  cancelAction(playerId: string): boolean {
    this.send({ type: "cancel-action", playerId });
    return true;
  }
  async movePlayer(
    playerId: string,
    path: { x: number; y: number }[]
  ): Promise<void> {
    await this.dispatch({ type: "move", playerId, path });
  }
  dropBallWithFumblerooski(
    playerId: string,
    square: { x: number; y: number }
  ): boolean {
    this.send({
      type: "fumblerooski",
      playerId,
      x: square.x,
      y: square.y,
    });
    return true;
  }
  async jumpPlayer(
    playerId: string,
    target: { x: number; y: number }
  ): Promise<void> {
    await this.dispatch({ type: "jump", playerId, x: target.x, y: target.y });
  }
  async standUp(playerId: string): Promise<void> {
    await this.dispatch({ type: "stand-up", playerId });
  }
  rollBlockDice(
    attackerId: string,
    defenderId: string,
    _numDice: number,
    _isAttackerChoice: boolean
  ): void {
    // The host recomputes dice count and choice from the board
    this.send({ type: "block", attackerId, defenderId });
  }
  async multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    await this.dispatch({
      type: "multiple-block",
      attackerId,
      defender1Id,
      defender2Id,
    });
  }
  resolveBlock(
    _attackerId: string,
    _defenderId: string,
    result: BlockResult
  ): void {
    const pending = this.pendingDecision();
    if (pending?.type !== "block-dice") return;
    const wanted = JSON.stringify(result);
    const index = pending.options.findIndex(
      (option) => JSON.stringify(option) === wanted
    );
    this.send({ type: "choose-block-result", index: Math.max(0, index) });
  }
  executePush(
    _attackerId: string,
    _defenderId: string,
    direction: { x: number; y: number },
    _resultType: string,
    _followUp: boolean
  ): void {
    this.send({
      type: "choose-push-direction",
      x: direction.x,
      y: direction.y,
    });
  }
  followUpPush(
    attackerId: string,
    _targetSquare: { x: number; y: number }
  ): void {
    // On the wire, follow-up choice + activation end are one command
    this.swallowNextFinish = attackerId;
    this.send({ type: "choose-follow-up", followUp: true });
  }
  finishActivation(playerId: string): void {
    if (this.swallowNextFinish === playerId) {
      this.swallowNextFinish = null;
      return;
    }
    if (this.pendingDecision()?.type === "follow-up") {
      // Declining the follow-up ends the activation host-side
      this.send({ type: "choose-follow-up", followUp: false });
      return;
    }
    this.send({ type: "end-activation", playerId });
  }
  async throwBall(
    passerId: string,
    targetX: number,
    targetY: number
  ): Promise<{ success: boolean; result?: string }> {
    const response = await this.dispatch({
      type: "pass",
      playerId: passerId,
      x: targetX,
      y: targetY,
    });
    return { success: response.ok, result: response.reason };
  }
  async puntBall(
    playerId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    await this.dispatch({
      type: "punt",
      playerId,
      x: facingX,
      y: facingY,
    });
  }
  async stabPlayer(attackerId: string, targetId: string): Promise<boolean> {
    const response = await this.dispatch({
      type: "stab",
      attackerId,
      defenderId: targetId,
    });
    return response.ok;
  }
  async throwTeammate(
    throwerId: string,
    teammateId: string,
    x: number,
    y: number,
    mode?: "throw" | "kick"
  ): Promise<void> {
    await this.dispatch({
      type: "throw-teammate",
      throwerId,
      teammateId,
      x,
      y,
      mode,
    });
  }
  async performSpecialAction(
    kind: BlockReplacement | "gaze",
    attackerId: string,
    targetId: string
  ): Promise<boolean> {
    if (kind === "stab") {
      return this.stabPlayer(attackerId, targetId);
    }
    const response = await this.dispatch({
      type: "special-action",
      action: kind,
      attackerId,
      defenderId: targetId,
    });
    return response.ok;
  }
  async throwBomb(throwerId: string, x: number, y: number): Promise<void> {
    await this.dispatch({
      type: "throw-bomb",
      throwerId,
      x,
      y,
    });
  }
  async ballAndChain(
    fanaticId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    await this.dispatch({
      type: "ball-and-chain",
      playerId: fanaticId,
      x: facingX,
      y: facingY,
    });
  }
  async foulPlayer(
    foulerId: string,
    targetX: number,
    targetY: number
  ): Promise<void> {
    await this.dispatch({
      type: "foul",
      playerId: foulerId,
      x: targetX,
      y: targetY,
    });
  }
  endTurn(): void {
    this.send({ type: "end-turn" });
  }

  // ===== Engine flow: the host drives these; results arrive as broadcasts =====

  startKickoff(): void {}
  rollKickoff(): void {}
  rollInitialWeather(): void {} // host rolls; guest gets weather via snapshot
  startGame(_kickingTeamId: string): void {}
  startTurn(_teamId: string): void {}
  triggerTurnover(_reason: string): void {}
  endDrive(): void {}
  resetDriveState(): void {}
  rollKORecovery(): void {}
  throwInBall(): void {}
  setBallPosition(): void {}
  attemptPickup(): boolean {
    return false;
  }
  checkForTouchdown(): boolean {
    return false;
  }
}
