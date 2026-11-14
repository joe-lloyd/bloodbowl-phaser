import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { ReactionDecisionAnswer } from "../../types/decisions";
import { BlockValidator } from "../validators/BlockValidator";
import { BlockAnalysis } from "../../types/Actions";
import { GameEventNames } from "../../types/events";
import { GameConfig } from "../../config/GameConfig";
import { PileDriverOperation } from "../operations/PileDriverOperation";
import {
  ContinueMultipleBlockOperation,
  CrowdSurfFollowUpOperation,
  FinishActivationOperation,
  ForcedFollowUpOperation,
  FrenzyOperation,
  HitAndRunOperation,
  driveOver,
} from "./BlockOperations";
import { BlockRerolls } from "./BlockRerolls";

/** Both players Standing and next to each other. */
const standingNeighbours = (a: Player, b: Player): boolean =>
  a.status === PlayerStatus.ACTIVE &&
  b.status === PlayerStatus.ACTIVE &&
  !!a.gridPosition &&
  !!b.gridPosition &&
  Math.abs(a.gridPosition.x - b.gridPosition.x) <= 1 &&
  Math.abs(a.gridPosition.y - b.gridPosition.y) <= 1;

const onPitch = (square: { x: number; y: number }): boolean =>
  square.x >= 0 &&
  square.x < GameConfig.PITCH_WIDTH &&
  square.y >= 0 &&
  square.y < GameConfig.PITCH_HEIGHT;

/**
 * What follows a resolved Block within the activation: Multiple Block's
 * second target, Frenzy's second Block, Pile Driver, Hit and Run, and the
 * end of the activation.
 */
export abstract class BlockActivation extends BlockRerolls {
  protected pileDriverTargets = new Map<string, string>();
  protected blockValidator: BlockValidator = new BlockValidator();
  protected multipleBlockState: {
    attackerId: string;
    defenderIds: [string, string];
    nextIndex: number;
    originalStrength: number;
    continuationQueued: boolean;
    /** Both Blocks' assists and strengths, analysed before either resolves. */
    analyses: Record<string, BlockAnalysis>;
    /** The board before either Block resolved, for a Trickster relocation. */
    board: Player[];
    /** Targets knocked down so far, offered to Pile Driver at the end. */
    pileDriverTargetIds: string[];
  } | null = null;

  /** The attacker mid-Frenzy-extra block, so it does not Frenzy a third time. */
  protected frenzyExtraFor: string | null = null;

  public abstract rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void>;

  /**
   * End the blocker's activation after a Block resolves — but if they are a
   * still-Standing Hit and Run player with a legal free square, queue the
   * Hit and Run move (which ends the activation itself). Currently wired into
   * the knockdown-in-place completion; the push/follow-up path is a further
   * increment. The Stab path goes through GameService.finishStabActivation.
   */
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
      this.offerPileDriver(attackerId, () =>
        this.endBlockActivation(attackerId)
      )
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

  /**
   * Pile Driver (p.133): once the Block has fully resolved, a blocker who
   * Knocked Down their target "may perform a free Foul Action" against it.
   * Queues the optional Foul and returns true; `resume` carries on with the
   * activation when the coach declines or the Foul is no longer possible.
   */
  public offerPileDriver(attackerId: string, resume: () => void): boolean {
    // A Multiple Block keeps its knockdowns for the offers after both Blocks.
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

  /**
   * Start a two-target Multiple Block. Both opponents must be different,
   * Standing, marked by the blocker, and opposing players when declared.
   */
  public async startMultipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defenders = [
      this.getPlayerById(defender1Id),
      this.getPlayerById(defender2Id),
    ];
    const adjacent = (defender: Player | undefined) =>
      !!attacker?.gridPosition &&
      !!defender?.gridPosition &&
      Math.max(
        Math.abs(attacker.gridPosition.x - defender.gridPosition.x),
        Math.abs(attacker.gridPosition.y - defender.gridPosition.y)
      ) === 1;

    if (!attacker || attacker.status !== PlayerStatus.ACTIVE) {
      throw new Error("illegal-multiple-block:attacker");
    }
    if (!hasSkill(attacker.skills, SkillType.MULTIPLE_BLOCK)) {
      throw new Error("illegal-multiple-block:skill");
    }
    if (defender1Id === defender2Id) {
      throw new Error("illegal-multiple-block:duplicate-target");
    }
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
    // The Blocks happen simultaneously, so each target's assists are counted
    // before either resolves, the other target included (May 2026 FAQ).
    const analyses: Record<string, BlockAnalysis> = {};
    for (const defender of defenders) {
      if (!defender) continue;
      analyses[defender.id] = this.blockValidator.analyzeBlock(
        attacker,
        defender,
        this.allPlayers(),
        this.state.activeTeamId
      );
    }
    this.multipleBlockState = {
      attackerId,
      defenderIds: [defender1Id, defender2Id],
      nextIndex: 1,
      originalStrength,
      continuationQueued: false,
      analyses,
      board: this.allPlayers().map((p) => ({
        ...p,
        gridPosition: p.gridPosition && { ...p.gridPosition },
        conditions: p.conditions && [...p.conditions],
      })),
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

  /** Continue with target two, or restore Strength and end after target two. */
  public async continueMultipleBlock(attackerId: string): Promise<void> {
    const state = this.multipleBlockState;
    if (!state || state.attackerId !== attackerId) return;
    state.continuationQueued = false;
    // The next Block's dice would forget this one's knockdown.
    const knockedDown = this.pileDriverTargets.get(attackerId);
    this.pileDriverTargets.delete(attackerId);
    if (knockedDown) state.pileDriverTargetIds.push(knockedDown);
    // A push that scored ends the drive, and the second Block with it.
    const scored = driveOver(this.state.phase);
    if (!scored && state.nextIndex < state.defenderIds.length) {
      const defenderId = state.defenderIds[state.nextIndex++];
      await this.startBlock(attackerId, defenderId);
      return;
    }

    const attacker = this.getPlayerById(attackerId);
    if (attacker) attacker.stats.ST = state.originalStrength;
    this.multipleBlockState = null;
    if (scored) return;
    // Pile Driver, once both Blocks have resolved: a declined Foul offers
    // the other knocked-down target, if any.
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

  /** Analyze and start a fresh Block Action (Frenzy's second block). */
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

  /** The Block as it stands, or as analysed when a Multiple Block began. */
  protected analyzeBlock(attacker: Player, defender: Player): BlockAnalysis {
    const declared =
      this.multipleBlockState?.attackerId === attacker.id
        ? this.multipleBlockState.analyses[defender.id]
        : undefined;
    return declared
      ? { ...declared }
      : this.blockValidator.analyzeBlock(
          attacker,
          defender,
          this.allPlayers(),
          this.state.activeTeamId
        );
  }

  /** Frenzy's second block, if the target is still standing and adjacent. */
  public async frenzySecondBlock(
    attackerId: string,
    defenderId: string,
    targetStanding: boolean
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);
    if (
      !targetStanding ||
      !attacker ||
      !defender ||
      !standingNeighbours(attacker, defender)
    ) {
      this.endBlockActivation(attackerId);
      return;
    }
    // During a Blitz the second block costs a square too, Rushing if
    // needed; without one there is no second block.
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
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

  /**
   * Defender surfed: the blocker is still offered the follow-up into
   * the vacated square. Queued at the BACK so the crowd injury +
   * throw-in settle first — the ball must be at rest and the follow-up
   * answered before the activation (and possibly the turn) ends
   */
  protected followUpCrowdSurf(
    attackerId: string,
    vacated: { x: number; y: number }
  ): void {
    const flowManager = this.callbacks.getFlowManager?.();
    const attacker = this.getPlayerById(attackerId);
    if (this.multipleBlockState?.attackerId === attackerId) {
      this.queueMultipleBlockContinuation(attackerId);
    } else if (attacker && this.isBallAndChain(attacker)) {
      // The Fanatic lurches on into the emptied square, no prompt
      flowManager?.add(new ForcedFollowUpOperation(attackerId, vacated));
      flowManager?.add(new FinishActivationOperation(this, attackerId));
    } else {
      flowManager?.add(new CrowdSurfFollowUpOperation(attackerId, vacated));
    }
  }

  /**
   * The push has landed: Frenzy's extra Block, a forced follow-up, or the
   * end of an activation no follow-up prompt will end.
   */
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
    // Frenzy's first block: force the follow-up into the vacated square and,
    // if the target is still Standing, throw a mandatory second Block at the
    // same player. Queued at the BACK so a POW's armour/injury settle first;
    // FrenzyOperation then follows up, blocks again if able, and ends the
    // activation (so it is NOT combined with the forceFollowUp branch below).
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
      // Taunt, or Frenzy's second (extra) block: run the free follow-up now
      // (at the FRONT) and end the activation once everything has settled —
      // no follow-up prompt will fire.
      flowManager?.add(
        new ForcedFollowUpOperation(attackerId, first.from),
        true
      );
      flowManager?.add(new FinishActivationOperation(this, attackerId));
    } else if (chain.preventFollowUp) {
      // Fend denied the blocker their follow-up: no follow-up prompt will
      // fire, so end the activation once any queued armour/injury rolls have
      // settled (queued at the BACK so the turn flips only after they apply).
      if (this.multipleBlockState?.attackerId === attackerId) {
        this.queueMultipleBlockContinuation(attackerId);
      } else {
        flowManager?.add(new FinishActivationOperation(this, attackerId));
      }
    }
  }

  /** Squares a Hit and Run move may end in (leaving nobody marked). */
  public hitAndRunSquares(player: Player): { x: number; y: number }[] {
    const from = player.gridPosition;
    if (!from) return [];
    const standingOpponents = this.allPlayers().filter(
      (p) => p.teamId !== player.teamId && p.status === PlayerStatus.ACTIVE
    );
    // Not Marked by / Marking: no standing opponent adjacent to the square.
    const free = (pos: { x: number; y: number }) =>
      onPitch(pos) &&
      !this.getPlayerAt(pos.x, pos.y) &&
      !standingOpponents.some(
        (o) =>
          o.gridPosition &&
          Math.abs(o.gridPosition.x - pos.x) <= 1 &&
          Math.abs(o.gridPosition.y - pos.y) <= 1
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

  /** Offer Hit and Run's free move, then end the activation. */
  public async resolveHitAndRun(attackerId: string): Promise<void> {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    const attacker = this.getPlayerById(attackerId);
    const squares = attacker ? this.hitAndRunSquares(attacker) : [];
    if (
      !attacker ||
      attacker.status !== PlayerStatus.ACTIVE ||
      !squares.length
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

    if (use) {
      this.freeMove(attacker, squares[0]);
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attackerId,
        skill: SkillType.HIT_AND_RUN,
        effect: "Hit and Run: one free square",
      });
    }
    gs?.finishActivation(attackerId);
  }

  /** Move a player to an adjacent square (no dice/cost), carrying the ball. */
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
      ballFrom: carriedBall ? from : undefined,
      ballPath: carriedBall ? [from, { ...to }] : undefined,
      ballJoinStep: 0,
    });
    this.callbacks
      .getFlowManager?.()
      ?.context.gameService.checkForTouchdown(player.id);
  }
}
