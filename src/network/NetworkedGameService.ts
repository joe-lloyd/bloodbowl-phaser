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
import { ActionType, GameEventNames } from "../types/events";
import { BlockReplacement } from "../types/BlockReplacement";
import { IEventBus } from "../services/EventBus";
import { movePlayerToBox } from "../game/rules/playerLocation";

type Dispatch = (command: HeadlessCommand) => Promise<CommandResponse>;

export class NetworkedGameService implements IGameService {
  /** followUpPush + finishActivation arrive as one decision on the wire */
  private swallowNextFinish: string | null = null;

  constructor(
    /** Passive replica: never executes rules, only holds synced state */
    private readonly inner: GameService,
    private readonly dispatch: Dispatch,
    private readonly pendingDecision: () => PendingDecision | null,
    /** Notifies callers (GameplayInteractionController) that a command it
     *  treated as optimistically successful was actually refused, so any
     *  local step-machine state built on that assumption can reconcile. */
    private readonly eventBus?: IEventBus
  ) {}

  private send(command: HeadlessCommand): void {
    void this.dispatch(command).then((response) => {
      if (!response.ok) {
        console.warn(
          `[Networked] host rejected ${command.type}: ${response.reason}`
        );
        // Sync-returning mutators below (declareAction, cancelAction, …)
        // already told their caller "true" before this response arrived —
        // that optimism only self-corrects the passive replica's DATA (via
        // the resync/snapshot every response carries). Nothing else corrects
        // UI-side state built directly on the optimistic return value, so
        // surface the rejection explicitly.
        const cmd = command as HeadlessCommand & {
          playerId?: string;
          attackerId?: string;
          action?: string;
        };
        this.eventBus?.emit(GameEventNames.NetworkCommandRejected, {
          commandType: command.type,
          playerId: cmd.playerId ?? cmd.attackerId,
          action: cmd.action,
          reason: response.reason ?? "unknown",
        });
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
  answerApothecary(accept: boolean): boolean {
    if (this.pendingDecision()?.type !== "apothecary") return false;
    this.send({ type: "use-apothecary", accept });
    return true;
  }
  commitInducements(
    profile: import("../types/Inducements").InducementRuleProfile,
    budgets: Record<string, number>,
    inventory: import("../types/Inducements").InducementInventoryEntry[]
  ): void {
    // Pregame inducements are resolved host-side via the authoritative
    // InducementSession/confirm-inducements command; the guest's replica
    // only ever reflects the resulting state through a synced snapshot.
    this.inner.commitInducements(profile, budgets, inventory);
  }
  getInducementOffer() {
    // Known limitation: the catalog/profile/budget always match the host
    // (pure functions of each team's TV, which does sync), but the
    // in-progress selections/confirmed flags are NOT part of GameSnapshot —
    // only the *committed* inventory is (GameState.inducements, post-
    // confirm). Pre-confirm, this reflects only this replica's own
    // never-mutated session, not the host's live in-progress picks. Real
    // Blood Bowl inducement selection is simultaneous/blind before reveal,
    // so a coach not seeing the opponent's uncommitted choices is correct
    // behavior; what is missing is this team's OWN selection echoing back
    // before the next snapshot, which the optimistic `select`/`remove`
    // return values above already paper over for the common case.
    return this.inner.getInducementOffer();
  }
  selectInducement(
    teamId: string,
    inducement: import("../types/Inducements").Inducement,
    quantity: number
  ): { ok: boolean; errors: string[] } {
    this.send({ type: "select-inducement", teamId, inducement, quantity });
    return { ok: true, errors: [] }; // optimistic; a rejection self-corrects on sync
  }
  removeInducement(
    teamId: string,
    inducement: import("../types/Inducements").Inducement
  ): { ok: boolean; errors: string[] } {
    this.send({ type: "remove-inducement", teamId, inducement });
    return { ok: true, errors: [] };
  }
  confirmInducements(teamId: string): { ok: boolean; errors: string[] } {
    this.send({ type: "confirm-inducements", teamId });
    return { ok: true, errors: [] };
  }
  isSetupComplete(teamId: string): boolean {
    return this.getSetupStatus(teamId)?.canConfirm ?? false;
  }
  getSetupStatus(teamId: string) {
    return this.inner.getState().setup?.teams[teamId];
  }
  getLastSetupError(): string | null {
    return this.inner.getLastSetupError();
  }
  getSetupZone(teamId: string) {
    return this.inner.getSetupZone(teamId);
  }
  isTouchbackPending(): boolean {
    return this.inner.isTouchbackPending();
  }
  getKickoffEventStep() {
    const pending = this.pendingDecision();
    if (pending?.type !== "kickoff-event") return null;
    return {
      event: pending.event,
      teamId: pending.chooserTeamId,
      selectionLimit: pending.selectionLimit,
      selectedPlayerIds: [...pending.selectedPlayerIds],
      movedPlayerIds: [...pending.movedPlayerIds],
      awaitingPlacement: [...pending.awaitingPlacement],
      landingSquare: pending.landingSquare
        ? { ...pending.landingSquare }
        : undefined,
      charge: pending.charge
        ? {
            queue: [...pending.charge.queue],
            budget: { ...pending.charge.budget },
            activePlayerId: pending.charge.activePlayerId,
            aborted: pending.charge.aborted,
          }
        : undefined,
    };
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
  brawlerRerollBlockDie(attackerId: string): void {
    this.send({ type: "brawler-reroll-block", attackerId });
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
    // Routed through movePlayerToBox (not a bare gridPosition assignment) so
    // `status` moves to ACTIVE in the same step: leaving status stale (still
    // Reserve, its value at the start of every setup) would make the guest's
    // own "trust my in-flight setup state" snapshot guard in OnlineMatch
    // restore that stale Reserve status forever, flipping a correctly-placed
    // player's dugout box back to Reserves for the rest of their turn.
    const player = this.inner.getPlayerById(playerId);
    if (player) movePlayerToBox(player, { box: "pitch", position: { x, y } });
    this.send({ type: "place-player", playerId, x, y });
    return true;
  }
  removePlayer(playerId: string): void {
    // See placePlayer: keep status in lockstep with gridPosition so the
    // guest's own optimistic state is never internally inconsistent.
    const player = this.inner.getPlayerById(playerId);
    if (player) movePlayerToBox(player, { box: "reserves" });
    this.send({ type: "remove-player", playerId });
  }
  swapPlayers(player1Id: string, player2Id: string): boolean {
    const a = this.inner.getPlayerById(player1Id);
    const b = this.inner.getPlayerById(player2Id);
    if (a && b) {
      const posA = a.gridPosition;
      const posB = b.gridPosition;
      if (posB) movePlayerToBox(a, { box: "pitch", position: posB });
      else movePlayerToBox(a, { box: "reserves" });
      if (posA) movePlayerToBox(b, { box: "pitch", position: posA });
      else movePlayerToBox(b, { box: "reserves" });
    }
    this.send({ type: "swap-players", player1Id, player2Id });
    return true;
  }
  confirmSetup(teamId: string): boolean {
    this.send({ type: "confirm-setup", teamId });
    return true;
  }
  applySetupFormation(
    teamId: string,
    formation: import("../types/SetupTypes").FormationPosition[]
  ): import("../types/SetupTypes").SetupFormationResult {
    const team = this.inner.getTeam(teamId);
    const placedPlayerIds: string[] = [];
    if (team) {
      // Only clear players actually on the pitch: routing every player
      // (including KO'd/injured/dead ones, who never hold a gridPosition)
      // through movePlayerToBox(reserves) would wrongly stamp them Reserve.
      team.players.forEach((player) => {
        if (player.gridPosition) movePlayerToBox(player, { box: "reserves" });
      });
      formation.slice(0, 7).forEach((position, index) => {
        const rosterIndex = Number.parseInt(position.playerId, 10);
        const player =
          team.players[Number.isNaN(rosterIndex) ? index : rosterIndex];
        if (!player) return;
        movePlayerToBox(player, {
          box: "pitch",
          position: { x: position.x, y: position.y },
        });
        placedPlayerIds.push(player.id);
      });
    }
    this.send({ type: "apply-formation", teamId, formation });
    return {
      placedPlayerIds,
      skipped: [],
      status: this.getSetupStatus(teamId) ?? {
        teamId,
        placedPlayerCount: placedPlayerIds.length,
        requiredPlayerCount: Math.min(7, team?.players.length ?? 0),
        availablePlayerCount: team?.players.length ?? 0,
        restrictions: [],
        canConfirm: false,
        concessionDecision: "not-offered",
      },
    };
  }
  resolveSetupConcession(teamId: string, concede: boolean): boolean {
    this.send({ type: "setup-concession", teamId, concede });
    return true;
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
  selectKickoffEventPlayer(playerId: string): boolean {
    this.send({ type: "kickoff-select-player", playerId });
    return true;
  }
  moveKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    this.send({ type: "kickoff-move-player", playerId, x, y });
    return true;
  }
  placeKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    this.send({ type: "kickoff-place-player", playerId, x, y });
    return true;
  }
  confirmKickoffEventStep(): boolean {
    this.send({ type: "kickoff-confirm" });
    return true;
  }
  skipKickoffEventStep(): boolean {
    this.send({ type: "kickoff-skip" });
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
  /** Engine-internal (fired from Operations, which only ever run host-side). */
  commitAction(_playerId: string): void {}
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
  async handOffBall(
    passerId: string,
    targetPlayerId: string
  ): Promise<{ success: boolean; result?: string }> {
    const response = await this.dispatch({
      type: "handoff",
      playerId: passerId,
      targetId: targetPlayerId,
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
  async rollKORecovery(): Promise<void> {}
  throwInBall(): void {}
  setBallPosition(): void {}
  attemptPickup(): boolean {
    return false;
  }
  checkForTouchdown(): boolean {
    return false;
  }
}
