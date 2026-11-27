import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import { BlockValidator } from "../validators/BlockValidator";
import { type BlockAnalysis } from "../../types/Actions";
import { GameEventNames } from "../../types/events";
import { PileDriverOperation } from "../operations/PileDriverOperation";
import {
  ContinueMultipleBlockOperation,
  CrowdSurfFollowUpOperation,
  FinishBlockOperation,
  ForcedFollowUpOperation,
  FrenzyOperation,
  HitAndRunOperation,
  driveOver,
} from "./BlockOperations";
import { BlockRerolls } from "./BlockRerolls";
import { isStandableSquare } from "../rules/pitchSquares";

const standingNeighbours = (a: Player, b: Player): boolean =>
  a.status === PlayerStatus.ACTIVE &&
  b.status === PlayerStatus.ACTIVE &&
  !!a.gridPosition &&
  !!b.gridPosition &&
  Math.abs(a.gridPosition.x - b.gridPosition.x) <= 1 &&
  Math.abs(a.gridPosition.y - b.gridPosition.y) <= 1;

const onPitch = (square: { x: number; y: number }): boolean =>
  isStandableSquare(square);

export abstract class BlockActivation extends BlockRerolls {
  protected pileDriverTargets = new Map<string, string>();
  protected blockValidator: BlockValidator = new BlockValidator();
  protected multipleBlockState: {
    attackerId: string;
    defenderIds: [string, string];
    nextIndex: number;
    originalStrength: number;
    continuationQueued: boolean;

    analyses: Record<string, BlockAnalysis>;

    board: Player[];

    pileDriverTargetIds: string[];
  } | null = null;

  protected frenzyExtraFor: string | null = null;

  public abstract rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void>;

  public endBlockActivation(attackerId: string): void {
    if (this.multipleBlockState?.attackerId === attackerId) {
      this.queueMultipleBlockContinuation(attackerId);
      return;
    }
    const flowManager = this.callbacks.getFlowManager?.();
    if (!flowManager) {
      this.callbacks
        .getFlowManager?.()
        ?.context.gameService.finishActivation(attackerId);
      return;
    }
    if (
      this.offerPileDriver(attackerId, () => {
        this.endBlockActivation(attackerId);
      })
    ) {
      return;
    }
    const attacker = this.getPlayerById(attackerId);
    if (
      attacker &&
      attacker.status === PlayerStatus.ACTIVE &&
      hasSkill(attacker.skills, SkillType.HIT_AND_RUN) &&
      this.hitAndRunSquares(attacker).length > 0
    ) {
      flowManager.add(new HitAndRunOperation(this, attackerId));
      return;
    }
    flowManager.context.gameService.finishActivation(attackerId);
  }

  public offerPileDriver(attackerId: string, resume: () => void): boolean {
    if (this.multipleBlockState?.attackerId === attackerId) return false;
    const targetId = this.pileDriverTargets.get(attackerId);
    this.pileDriverTargets.delete(attackerId);
    const flowManager = this.callbacks.getFlowManager?.();
    const attacker = this.getPlayerById(attackerId);
    if (!targetId || !flowManager || attacker?.status !== PlayerStatus.ACTIVE) {
      return false;
    }
    flowManager.add(new PileDriverOperation(attackerId, targetId, resume));
    return true;
  }

  public async startMultipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    if (!attacker || attacker.status !== PlayerStatus.ACTIVE) {
      throw new Error("illegal-multiple-block:attacker");
    }
    if (!hasSkill(attacker.skills, SkillType.MULTIPLE_BLOCK)) {
      throw new Error("illegal-multiple-block:skill");
    }
    if (defender1Id === defender2Id) {
      throw new Error("illegal-multiple-block:duplicate-target");
    }
    const adjacent = (defender: Player | undefined) =>
      !!attacker.gridPosition &&
      !!defender?.gridPosition &&
      Math.max(
        Math.abs(attacker.gridPosition.x - defender.gridPosition.x),
        Math.abs(attacker.gridPosition.y - defender.gridPosition.y)
      ) === 1;
    const defenders = [
      this.getPlayerById(defender1Id),
      this.getPlayerById(defender2Id),
    ];
    if (
      defenders.some(
        (defender) =>
          !defender ||
          defender.teamId === attacker.teamId ||
          defender.status !== PlayerStatus.ACTIVE ||
          !adjacent(defender)
      )
    ) {
      throw new Error("illegal-multiple-block:targets");
    }
    if (
      this.state.activePlayer?.id !== attackerId ||
      this.state.activePlayer.action !== "multipleBlock"
    ) {
      throw new Error("multiple-block-not-declared");
    }

    const originalStrength = attacker.stats.ST;
    attacker.stats.ST = Math.max(1, attacker.stats.ST - 2);

    const analyses: Record<string, BlockAnalysis> = {};
    for (const defender of defenders) {
      if (!defender) continue;
      analyses[defender.id] = this.blockValidator.analyzeBlock({ attacker: attacker, defender: defender, allPlayers: this.allPlayers(), activeTeamId: this.state.activeTeamId });
    }
    this.multipleBlockState = {
      attackerId,
      defenderIds: [defender1Id, defender2Id],
      nextIndex: 1,
      originalStrength,
      continuationQueued: false,
      analyses,
      board: this.allPlayers().map((element) => snapshotPlayer(element)),
      pileDriverTargetIds: [],
    };
    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attackerId,
      skill: SkillType.MULTIPLE_BLOCK,
      effect: "Multiple Block: two Blocks at -2 Strength with no Follow-up",
    });
    await this.startBlock(attackerId, defender1Id);
  }

  protected queueMultipleBlockContinuation(attackerId: string): void {
    const state = this.multipleBlockState;
    if (!state || state.attackerId !== attackerId || state.continuationQueued) {
      return;
    }
    state.continuationQueued = true;
    const flow = this.callbacks.getFlowManager?.();
    if (flow) {
      flow.add(new ContinueMultipleBlockOperation(this, attackerId));
    } else {
      void this.continueMultipleBlock(attackerId);
    }
  }

  public async continueMultipleBlock(attackerId: string): Promise<void> {
    const state = this.multipleBlockState;
    if (!state || state.attackerId !== attackerId) return;
    state.continuationQueued = false;

    const knockedDown = this.pileDriverTargets.get(attackerId);
    this.pileDriverTargets.delete(attackerId);
    if (knockedDown) state.pileDriverTargetIds.push(knockedDown);

    const scored = driveOver(this.state.phase);
    const blocker = this.getPlayerById(attackerId);
    const next = this.getPlayerById(state.defenderIds[state.nextIndex] ?? "");
    const canBlock =
      blocker?.status === PlayerStatus.ACTIVE &&
      !!blocker.gridPosition &&
      next?.status === PlayerStatus.ACTIVE &&
      !!next.gridPosition;
    const defenderId = state.defenderIds[state.nextIndex];
    if (!scored && canBlock && defenderId !== undefined) {
      state.nextIndex++;
      await this.startBlock(attackerId, defenderId);
      return;
    }

    const attacker = this.getPlayerById(attackerId);
    if (attacker) attacker.stats.ST = state.originalStrength;
    this.multipleBlockState = null;
    if (scored) return;

    const offerNext = (): void => {
      const targetId = state.pileDriverTargetIds.shift();
      if (targetId) {
        this.pileDriverTargets.set(attackerId, targetId);
        if (this.offerPileDriver(attackerId, offerNext)) return;
      }
      this.callbacks
        .getFlowManager?.()
        ?.context.gameService.finishActivation(attackerId);
    };
    offerNext();
  }

  public async startBlock(
    attackerId: string,
    defenderId: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);
    if (!attacker || !defender) return;
    const analysis = this.analyzeBlock(attacker, defender);
    await this.rollBlockDice(
      attackerId,
      defenderId,
      analysis.diceCount,
      !analysis.isUphill
    );
  }

  protected analyzeBlock(attacker: Player, defender: Player): BlockAnalysis {
    const declared =
      this.multipleBlockState?.attackerId === attacker.id
        ? this.multipleBlockState.analyses[defender.id]
        : undefined;
    return declared
      ? { ...declared }
      : this.blockValidator.analyzeBlock({ attacker: attacker, defender: defender, allPlayers: this.allPlayers(), activeTeamId: this.state.activeTeamId });
  }

  public async frenzySecondBlock(
    attackerId: string,
    defenderId: string,
    targetStanding: boolean
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    if (
      !targetStanding ||
      !attacker ||
      !defender ||
      !standingNeighbours(attacker, defender)
    ) {
      gs?.finishBlockActivation(attackerId);
      return;
    }

    if (
      this.isBlitzBlock(attacker) &&
      gs &&
      !(await gs.chargeBlitzBlockSquare(attackerId))
    ) {
      if (attacker.status === PlayerStatus.ACTIVE) {
        gs.finishActivation(attackerId);
      }
      return;
    }
    this.frenzyExtraFor = attackerId;
    await this.startBlock(attackerId, defenderId);
  }

  protected followUpCrowdSurf(
    attackerId: string,
    vacated: { x: number; y: number }
  ): void {
    const flowManager = this.callbacks.getFlowManager?.();
    const attacker = this.getPlayerById(attackerId);
    if (this.multipleBlockState?.attackerId === attackerId) {
      this.queueMultipleBlockContinuation(attackerId);
    } else if (attacker && this.isBallAndChain(attacker)) {
      flowManager?.add(new ForcedFollowUpOperation(attackerId, vacated));
      flowManager?.add(new FinishBlockOperation(attackerId));
    } else {
      flowManager?.add(new CrowdSurfFollowUpOperation(attackerId, vacated));
    }
  }

  protected endPushedBlock(
    chain: {
      attackerId: string;
      frenzy?: boolean;
      forceFollowUp?: boolean;
      preventFollowUp?: boolean;
    },
    first: { playerId: string; from: { x: number; y: number } },
    targetStanding: boolean
  ): void {
    const { attackerId } = chain;
    const flowManager = this.callbacks.getFlowManager?.();

    if (chain.frenzy) {
      flowManager?.add(
        new FrenzyOperation(
          this,
          attackerId,
          first.playerId,
          first.from,
          targetStanding
        )
      );
    } else if (chain.forceFollowUp) {
      flowManager?.add(
        new ForcedFollowUpOperation(attackerId, first.from),
        true
      );
      flowManager?.add(new FinishBlockOperation(attackerId));
    } else if (chain.preventFollowUp) {
      if (this.multipleBlockState?.attackerId === attackerId) {
        this.queueMultipleBlockContinuation(attackerId);
      } else {
        flowManager?.add(new FinishBlockOperation(attackerId));
      }
    }
  }

  public hitAndRunSquares(player: Player): { x: number; y: number }[] {
    const from = player.gridPosition;
    if (!from) return [];
    const standingOpponents = this.allPlayers().filter(
      (p) => p.teamId !== player.teamId && p.status === PlayerStatus.ACTIVE
    );

    const free = (pos: { x: number; y: number }) =>
      onPitch(pos) &&
      !this.getPlayerAt(pos.x, pos.y) &&
      standingOpponents.every(
        (o) =>
          !(o.gridPosition &&
          Math.abs(o.gridPosition.x - pos.x) <= 1 &&
          Math.abs(o.gridPosition.y - pos.y) <= 1)
      );
    const squares: { x: number; y: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const pos = { x: from.x + dx, y: from.y + dy };
        if ((dx !== 0 || dy !== 0) && free(pos)) squares.push(pos);
      }
    }
    return squares;
  }

  public async resolveHitAndRun(attackerId: string): Promise<void> {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    const attacker = this.getPlayerById(attackerId);
    const squares = attacker ? this.hitAndRunSquares(attacker) : [];
    if (
      !attacker ||
      attacker.status !== PlayerStatus.ACTIVE ||
      squares.length === 0
    ) {
      gs?.finishActivation(attackerId);
      return;
    }

    const decisions = this.decisions();
    let use = true;
    if (decisions) {
      const answer = (await decisions.request({
        type: "reaction",
        playerId: attackerId,
        chooserTeamId: attacker.teamId,
        skill: SkillType.HIT_AND_RUN,
        prompt: `${attacker.playerName} may Hit and Run one free square — use it?`,
      })) as ReactionDecisionAnswer;
      use = answer.accept;
    }

    const square = squares[0];
    if (use && square) {
      this.freeMove(attacker, square);
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attackerId,
        skill: SkillType.HIT_AND_RUN,
        effect: "Hit and Run: one free square",
      });
    }
    gs?.finishActivation(attackerId);
  }

  private freeMove(player: Player, to: { x: number; y: number }): void {
    const from = { ...player.gridPosition! };
    player.gridPosition = { ...to };
    const carriedBall = this.ballAt(from);
    if (carriedBall) {
      this.state.ballPosition = { ...to };
      this.eventBus.emit(GameEventNames.BallPlaced, { ...to });
    }
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: player.id,
      from,
      to: { ...to },
      path: [from, { ...to }],
      ...(carriedBall && { ballFrom: from, ballPath: [from, { ...to }] }),
      ballJoinStep: 0,
    });
    this.callbacks
      .getFlowManager?.()
      ?.context.gameService.checkForTouchdown(player.id);
  }
}

function snapshotPlayer(player: Player): Player {
  const { gridPosition, conditions, ...rest } = player;
  return {
    ...rest,
    ...(gridPosition && { gridPosition: { ...gridPosition } }),
    ...(conditions && { conditions: [...conditions] }),
  };
}
