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
  getPassController() {
    return this.inner.getPassController();
  }
  getCatchController() {
    return this.inner.getCatchController();
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
  isSetupComplete(teamId: string): boolean {
    return this.inner.isSetupComplete(teamId);
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
    this.send({ type: "place-player", playerId, x, y });
    return true; // optimistic; host response corrects the board if illegal
  }
  removePlayer(playerId: string): void {
    this.send({ type: "remove-player", playerId });
  }
  swapPlayers(player1Id: string, player2Id: string): boolean {
    this.send({ type: "swap-players", player1Id, player2Id });
    return true;
  }
  confirmSetup(teamId: string): void {
    this.send({ type: "confirm-setup", teamId });
  }
  selectKicker(playerId: string): void {
    this.send({ type: "select-kicker", playerId });
  }
  kickBall(
    _isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): void {
    this.send({ type: "kick-ball", playerId, x: targetX, y: targetY });
  }
  awardTouchback(playerId: string): boolean {
    this.send({ type: "touchback", playerId });
    return true;
  }
  declareAction(playerId: string, action: ActionType): boolean {
    this.send({ type: "declare-action", playerId, action });
    return true;
  }
  async movePlayer(
    playerId: string,
    path: { x: number; y: number }[]
  ): Promise<void> {
    await this.dispatch({ type: "move", playerId, path });
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
