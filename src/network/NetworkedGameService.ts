import { type IGameService } from "../services/interfaces/IGameService";
import { GameService } from "../services/GameService";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
} from "../headless/protocol";
import { GamePhase, type GameState, SubPhase } from "../types/GameState";
import { type Player } from "../types/Player";
import { type Team } from "../types/Team";
import { type BlockResult } from "../services/BlockResolutionService";
import { GameEventNames } from "../types/events";
import { type BlockReplacement } from "../types/BlockReplacement";
import { type IEventBus } from "../services/EventBus";
import type { KickoffEventStepState } from "../game/kickoff/KickoffEventManager";
import type { MoveStep } from "../headless/protocol";

type Dispatch = (command: HeadlessCommand) => Promise<CommandResponse>;

export class NetworkedGameService implements IGameService {
  readonly runsCommandsLater = true;

  private swallowNextFinish: string | null = null;

  private readonly inner: GameService;
  private readonly dispatch: Dispatch;
  private readonly pendingDecision: () => PendingDecision | null;
  private readonly eventBus: (IEventBus) | undefined;
  constructor({ inner, dispatch, pendingDecision, eventBus }: { inner: GameService; dispatch: Dispatch; pendingDecision: () => PendingDecision | null; eventBus?: IEventBus }) {
    this.inner = inner;
    this.dispatch = dispatch;
    this.pendingDecision = pendingDecision;
    this.eventBus = eventBus;
  }

  private send(command: HeadlessCommand): void {
    void this.run(command).catch((error: unknown) => {
      this.reportFailure(command, error);
    });
  }

  private async run(command: HeadlessCommand): Promise<CommandResponse> {
    const response = await this.dispatch(command);
    if (!response.ok) {
      console.warn(
        `[Networked] host rejected ${command.type}: ${String(response.reason)}`
      );
      this.reportRejected(command, response.reason ?? "unknown");
    }
    return response;
  }

  private reportFailure(command: HeadlessCommand, error: unknown): void {
    console.warn(`[Networked] ${command.type} could not run:`, error);
    this.reportRejected(
      command,
      error instanceof Error ? error.message : String(error)
    );
  }

  private reportRejected(command: HeadlessCommand, reason: string): void {
    const cmd: HeadlessCommand & {
      playerId?: string;
      attackerId?: string;
      action?: string;
    } = command;
    this.eventBus?.emit(GameEventNames.NetworkCommandRejected, {
      commandType: command.type,
      ...((cmd.playerId ?? cmd.attackerId) === undefined ? {} : { playerId: cmd.playerId ?? cmd.attackerId }),
      ...(cmd.action === undefined ? {} : { action: cmd.action }),
      reason,
    });
  }

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
  resyncSetupFromTeams(): void {
    this.inner.resyncSetupFromTeams();
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
    this.send({ type: "use-reroll", accept, ...(source === undefined ? {} : { source }) });
    return true;
  }
  answerReaction(accept: boolean): boolean {
    if (this.pendingDecision()?.type !== "reaction") return false;
    this.send({ type: "use-reaction", accept });
    return true;
  }
  answerBiteTarget(targetId?: string): boolean {
    const pending = this.pendingDecision();
    if (pending?.type !== "bite-target") return false;
    if (targetId !== undefined && !pending.targetIds.includes(targetId))
      return false;
    this.send({ type: "choose-bite-target", ...(targetId === undefined ? {} : { playerId: targetId }) });
    return true;
  }
  answerInterception(playerId?: string): boolean {
    if (this.pendingDecision()?.type !== "interception") return false;
    this.send({ type: "choose-interception", ...(playerId === undefined ? {} : { playerId }) });
    return true;
  }
  answerApothecary(accept: boolean): boolean {
    if (this.pendingDecision()?.type !== "apothecary") return false;
    this.send({ type: "use-apothecary", accept });
    return true;
  }
  answerInducementChoice(
    answer: import("../types/decisions").InducementChoiceDecisionAnswer
  ): boolean {
    if (this.pendingDecision()?.type !== "inducement-choice") return false;
    const { square, ...choice } = answer;
    this.send({ type: "choose-inducement", ...choice, ...square });
    return true;
  }
  answerFoulAssists(count: number): boolean {
    const pending = this.pendingDecision();
    if (pending?.type !== "foul-assists") return false;
    if (!Number.isInteger(count) || count < 0 || count > pending.available)
      return false;
    this.send({ type: "choose-foul-assists", count });
    return true;
  }
  commitInducements: IGameService["commitInducements"] = () => undefined;
  getInducementOffer() {
    return this.inner.getInducementOffer();
  }
  private async pregameCommand(command: HeadlessCommand) {
    const response = await this.run(command);
    return {
      ok: response.ok,
      errors: response.ok ? [] : [response.reason ?? "Purchase refused"],
    };
  }
  selectInducement(
    teamId: string,
    inducement: import("../types/Inducements").Inducement,
    quantity: number
  ) {
    return this.pregameCommand({
      type: "select-inducement",
      teamId,
      inducement,
      quantity,
    });
  }
  removeInducement(
    teamId: string,
    inducement: import("../types/Inducements").Inducement
  ) {
    return this.pregameCommand({
      type: "remove-inducement",
      teamId,
      inducement,
    });
  }
  confirmInducements(teamId: string) {
    return this.pregameCommand({ type: "confirm-inducements", teamId });
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
  isSetupEligible(playerId: string): boolean {
    return this.inner.isSetupEligible(playerId);
  }
  getSetupZone(teamId: string) {
    return this.inner.getSetupZone(teamId);
  }
  isTouchbackPending(): boolean {
    return this.inner.isTouchbackPending();
  }
  isKickoffTableResolving(): boolean {
    return this.inner.isKickoffTableResolving();
  }
  getKickoffEventStep(): KickoffEventStepState | null {
    const pending = this.pendingDecision();
    if (pending?.type !== "kickoff-event") return this.kickoffStepInFlight;
    return {
      event: pending.event,
      teamId: pending.chooserTeamId,
      selectionLimit: pending.selectionLimit,
      selectedPlayerIds: [...pending.selectedPlayerIds],
      movedPlayerIds: [...pending.movedPlayerIds],
      awaitingPlacement: [...pending.awaitingPlacement],
      ...(pending.landingSquare ? { landingSquare: { ...pending.landingSquare } } : {}),
      ...(pending.charge ? { charge: { ...pending.charge, queue: [...pending.charge.queue], budget: { ...pending.charge.budget } } } : {}),
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
  tossCoin(): string {
    throw new Error("The online coin toss runs outside the engine");
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
    this.finishActivation(playerId);
  }

  finishStabActivation: IGameService["finishStabActivation"] = () => Promise.resolve();
  chargeBlitzBlockSquare: IGameService["chargeBlitzBlockSquare"] = () => Promise.resolve(false);
  hasUsedBlitzBlock(playerId: string): boolean {
    return this.inner.hasUsedBlitzBlock(playerId);
  }
  keepBlockDice(attackerId: string): void {
    this.send({ type: "keep-block-dice", attackerId });
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
  veteranRerollBlock(attackerId: string): void {
    this.send({ type: "veteran-reroll-block", attackerId });
  }
  getTeam(teamId: string): Team | undefined {
    return this.inner.getTeam(teamId);
  }
  getTeams(): [Team, Team] {
    return this.inner.getTeams();
  }
  getMovementUsed(playerId: string): number {
    return this.inner.getMovementUsed(playerId);
  }
  getAvailableMovements(playerId: string) {
    return this.inner.getAvailableMovements(playerId);
  }

  previewBlock(attackerId: string, defenderId: string): void {
    this.inner.previewBlock(attackerId, defenderId);
  }

  startSetup(startingTeamId?: string): void {
    if (startingTeamId) {
      this.send({ type: "start-setup", kickingTeamId: startingTeamId });
    }
  }
  placePlayer(playerId: string, x: number, y: number): boolean {
    this.send({ type: "place-player", playerId, x, y });
    return true;
  }
  removePlayer(playerId: string): void {
    this.send({ type: "remove-player", playerId });
  }
  swapPlayers(player1Id: string, player2Id: string): boolean {
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
    formation.slice(0, 7).forEach((position, index) => {
      const rosterIndex = Number.parseInt(position.playerId, 10);
      const player =
        team?.players[Number.isNaN(rosterIndex) ? index : rosterIndex];
      if (player) placedPlayerIds.push(player.id);
    });
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
  async kickBall({ playerId, targetX, targetY }: Parameters<IGameService["kickBall"]>[0]
  ): Promise<void> {
    await this.run({
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

  private kickoffStepInFlight: KickoffEventStepState | null = null;

  private kickoffCommandsInFlight = 0;

  private sendKickoffStep(command: HeadlessCommand): boolean {
    this.kickoffStepInFlight = this.getKickoffEventStep();
    this.kickoffCommandsInFlight++;
    void this.run(command)
      .catch((error: unknown) => {
        this.reportFailure(command, error);
      })
      .finally(() => {
        if (--this.kickoffCommandsInFlight === 0)
          this.kickoffStepInFlight = null;
        this.eventBus?.emit(GameEventNames.KickoffEventStepChanged, undefined);
      });
    return true;
  }
  selectKickoffEventPlayer(playerId: string): boolean {
    return this.sendKickoffStep({ type: "kickoff-select-player", playerId });
  }
  moveKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    return this.sendKickoffStep({
      type: "kickoff-move-player",
      playerId,
      x,
      y,
    });
  }
  placeKickoffEventPlayer(playerId: string, x: number, y: number): boolean {
    return this.sendKickoffStep({
      type: "kickoff-place-player",
      playerId,
      x,
      y,
    });
  }
  confirmKickoffEventStep(): boolean {
    return this.sendKickoffStep({ type: "kickoff-confirm" });
  }
  skipKickoffEventStep(): boolean {
    return this.sendKickoffStep({ type: "kickoff-skip" });
  }
  declareAction({ playerId, action, blockReplacement, options = {} }: Parameters<IGameService["declareAction"]>[0]
  ): boolean {
    this.send({
      type: "declare-action",
      playerId,
      action,
      ...(blockReplacement === undefined ? {} : { blockReplacement }),
      ...(options.razzleDazzle ? { razzleDazzle: true } : {}),
    });
    return true;
  }
  cancelAction(playerId: string): boolean {
    this.send({ type: "cancel-action", playerId });
    return true;
  }

  commitAction: IGameService["commitAction"] = () => undefined;
  async movePlayer(
    playerId: string,
    path: MoveStep[]
  ): Promise<void> {
    await this.run({ type: "move", playerId, path });
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
    await this.run({ type: "jump", playerId, x: target.x, y: target.y });
  }
  async standUp(playerId: string): Promise<void> {
    await this.run({ type: "stand-up", playerId });
  }
  rollBlockDice({ attackerId, defenderId }: Parameters<IGameService["rollBlockDice"]>[0]
  ): void {
    this.send({ type: "block", attackerId, defenderId });
  }
  async multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    await this.run({
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
  executePush({ direction }: Parameters<IGameService["executePush"]>[0]
  ): void {
    this.send({
      type: "choose-push-direction",
      x: direction.x,
      y: direction.y,
    });
  }
  followUpPush: IGameService["followUpPush"] = (attackerId) => {
    this.swallowNextFinish = attackerId;
    this.send({ type: "choose-follow-up", followUp: true });
  };
  finishActivation(playerId: string): void {
    if (this.swallowNextFinish === playerId) {
      this.swallowNextFinish = null;
      return;
    }
    if (this.pendingDecision()?.type === "follow-up") {
      this.send({ type: "choose-follow-up", followUp: false });
      return;
    }
    this.send({ type: "end-activation", playerId });
  }
  async throwBall({ passerId, targetX, targetY, hailMary = false }: Parameters<IGameService["throwBall"]>[0]
  ): Promise<{ success: boolean; result?: string }> {
    const response = await this.run({
      type: "pass",
      playerId: passerId,
      x: targetX,
      y: targetY,
      ...(hailMary ? { hailMary } : {}),
    });
    return { success: response.ok, ...(response.reason === undefined ? {} : { result: response.reason }) };
  }
  async handOffBall(
    passerId: string,
    targetPlayerId: string
  ): Promise<{ success: boolean; result?: string }> {
    const response = await this.run({
      type: "handoff",
      playerId: passerId,
      targetId: targetPlayerId,
    });
    return { success: response.ok, ...(response.reason === undefined ? {} : { result: response.reason }) };
  }
  async puntBall(
    playerId: string,
    facingX: number,
    facingY: number
  ): Promise<void> {
    await this.run({
      type: "punt",
      playerId,
      x: facingX,
      y: facingY,
    });
  }
  async stabPlayer(attackerId: string, targetId: string): Promise<boolean> {
    const response = await this.run({
      type: "stab",
      attackerId,
      defenderId: targetId,
    });
    return response.ok;
  }
  async throwTeammate({ throwerId, teammateId, x, y, mode, swoopFacing }: Parameters<IGameService["throwTeammate"]>[0]
  ): Promise<void> {
    await this.run({
      type: "throw-teammate",
      throwerId,
      teammateId,
      x,
      y,
      ...(swoopFacing ? { swoopFacing } : {}),
      ...(mode === undefined ? {} : { mode }),
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
    const response = await this.run({
      type: "special-action",
      action: kind,
      attackerId,
      defenderId: targetId,
    });
    return response.ok;
  }
  async throwBomb(throwerId: string, x: number, y: number): Promise<void> {
    await this.run({
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
    await this.run({
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
    await this.run({
      type: "foul",
      playerId: foulerId,
      x: targetX,
      y: targetY,
    });
  }
  endTurn(): void {
    this.send({ type: "end-turn" });
  }

  startKickoff: IGameService["startKickoff"] = () => undefined;
  rollKickoff: IGameService["rollKickoff"] = () => undefined;
  readyForWeather(teamId: string): boolean {
    this.send({ type: "ready-weather", teamId });
    return true;
  }
  beginCoinFlip: IGameService["beginCoinFlip"] = () => undefined;
  startGame: IGameService["startGame"] = () => undefined;
  startTurn: IGameService["startTurn"] = () => undefined;
  triggerTurnover: IGameService["triggerTurnover"] = () => undefined;

  ballAndChainCollision: IGameService["ballAndChainCollision"] = () => Promise.resolve();
  endDrive: IGameService["endDrive"] = () => undefined;
  resetDriveState: IGameService["resetDriveState"] = () => undefined;
  rollKORecovery: IGameService["rollKORecovery"] = () => Promise.resolve();
  throwInBall: IGameService["throwInBall"] = () => undefined;
  kickoffBounceTouchback(): boolean {
    return false;
  }
  setBallPosition: IGameService["setBallPosition"] = () => undefined;
  attemptPickup(): boolean {
    return false;
  }
  checkForTouchdown(): boolean {
    return false;
  }
}
