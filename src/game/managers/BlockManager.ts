import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { ReactionDecisionAnswer } from "../../types/decisions";
import {
  BlockValidator,
  blockDiceForStrength,
} from "../validators/BlockValidator";
import {
  BlockResolutionService,
  BlockResult,
  BlockResultType,
  BlockRollData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { BounceOperation } from "../operations/BounceOperation";
import { CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { GameConfig } from "../../config/GameConfig";
import { DiceController } from "../controllers/DiceController";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import {
  foldBlockResult,
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  BlockResultContext,
  BlockDeclaredContext,
  BlockDiceRolledContext,
  PushContext,
} from "../skills";

/**
 * Offers the blocker the follow-up into the square their crowd-surfed
 * victim vacated. Queued at the BACK of the flow so the crowd injury and
 * throw-in chain fully settle (ball at rest) before the prompt; the
 * blocker's activation then ends with the follow-up reply, never before.
 */
class CrowdSurfFollowUpOperation extends GameOperation {
  public readonly name = "CrowdSurfFollowUp";

  constructor(
    private attackerId: string,
    private targetSquare: { x: number; y: number }
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: this.attackerId,
      targetSquare: this.targetSquare,
    });
  }
}

/**
 * Ends the blocker's activation once the push chain (and any armour/injury
 * rolls it queued) has fully settled. Queued at the BACK of the flow so the
 * turn only flips after those rolls apply — used when no follow-up prompt
 * will fire to end the activation (Fend denied the follow-up).
 */
class FinishActivationOperation extends GameOperation {
  public readonly name = "FinishActivation";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * Taunt (2025 rulebook p.136): the pushed player's coach made the blocker
 * Follow-up. Runs the free move without offering a choice; the activation
 * ends via a FinishActivationOperation queued at the back, once armour and
 * injury rolls have settled.
 */
class ForcedFollowUpOperation extends GameOperation {
  public readonly name = "ForcedFollowUp";

  constructor(
    private attackerId: string,
    private targetSquare: { x: number; y: number }
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    await context.gameService.followUpPush(this.attackerId, this.targetSquare);
  }
}

/**
 * Frenzy (2025 rulebook p.130): the blocker must follow up a Push Back, and
 * if the target is still Standing must throw a second Block Action at the same
 * player. Runs after the first push settles; the second block re-enters the
 * normal block flow (which will not Frenzy again — one extra block only).
 */
class FrenzyOperation extends GameOperation {
  public readonly name = "Frenzy";

  constructor(
    private manager: BlockManager,
    private attackerId: string,
    private defenderId: string,
    private vacatedSquare: { x: number; y: number },
    private targetStanding: boolean
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    // Frenzy forces the follow-up into the vacated square.
    await context.gameService.followUpPush(this.attackerId, this.vacatedSquare);
    await this.manager.frenzySecondBlock(
      this.attackerId,
      this.defenderId,
      this.targetStanding
    );
  }
}

/**
 * Hit and Run (2025 rulebook p.130): after fully resolving a Block, a still-
 * Standing player may move one free square (ignoring Tackle Zones) that leaves
 * them neither Marked by nor Marking any opponent. Offered as a yes/no
 * reaction; the free square is one that satisfies the constraint.
 */
class HitAndRunOperation extends GameOperation {
  public readonly name = "HitAndRun";

  constructor(
    private manager: BlockManager,
    private attackerId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    await this.manager.resolveHitAndRun(this.attackerId);
  }
}

export class BlockManager {
  private blockValidator: BlockValidator = new BlockValidator();

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private blockResolutionService: BlockResolutionService,
    private diceController: DiceController,
    private callbacks: {
      onTurnover: (reason: string) => void;
      getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;
    }
  ) {}

  public previewBlock(attackerId: string, defenderId: string): void {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    if (!attacker || !defender) {
      console.error("Player not found for block");
      return;
    }

    const allPlayers = [...this.team1.players, ...this.team2.players];
    const analysis = this.blockValidator.analyzeBlock(
      attacker,
      defender,
      allPlayers,
      this.state.activeTeamId
    );

    this.eventBus.emit(GameEventNames.UI_BlockDialog, {
      attackerId,
      defenderId,
      analysis,
    });
  }

  /**
   * Roll block dice and emit results
   */
  public async rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    // Trigger point: block declared — rules may adjust strength/dice, roll a
    // pre-block die, or cancel the block before any block dice are rolled.
    if (attacker && defender) {
      const analysis = this.blockValidator.analyzeBlock(
        attacker,
        defender,
        this.allPlayers(),
        this.state.activeTeamId
      );
      const ctx: BlockDeclaredContext = {
        attacker,
        defender,
        diceCount: numDice,
        isAttackerChoice,
        attackerStrength: analysis.attackerST,
        defenderStrength: analysis.defenderST,
        isBlitz:
          this.state.activePlayer?.action === "blitz" &&
          this.state.activePlayer?.id === attacker.id,
        cancelled: false,
        decisions: this.decisions(),
        flow: this.callbacks.getFlowManager?.(),
        dice: this.diceController,
        triggers: [],
      };
      await foldTrigger(
        "onBlockDeclared",
        this.blockParticipants(attacker, defender),
        ctx
      );
      this.announce(ctx.triggers);

      if (ctx.cancelled) {
        // Foul Appearance et al: the block never happens; end the activation.
        this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
        this.callbacks
          .getFlowManager?.()
          ?.context.gameService.finishActivation(attacker.id);
        return;
      }

      // Recompute the dice if a rule changed the effective strengths.
      if (
        ctx.attackerStrength !== analysis.attackerST ||
        ctx.defenderStrength !== analysis.defenderST
      ) {
        const recomputed = blockDiceForStrength(
          ctx.attackerStrength,
          ctx.defenderStrength
        );
        ctx.diceCount = recomputed.diceCount;
        ctx.isAttackerChoice = !recomputed.isUphill;
      }

      numDice = ctx.diceCount;
      isAttackerChoice = ctx.isAttackerChoice;
    }

    const teamId = attackerId.split("-")[0];
    const results = this.diceController.rollBlockDice(numDice, teamId);

    // Trigger point: dice rolled — a rule may reroll dice in place (Brawler's
    // single Both Down) before the coach selects a result.
    if (attacker && defender) {
      const ctx: BlockDiceRolledContext = {
        attacker,
        defender,
        results,
        isAttackerChoice,
        decisions: this.decisions(),
        flow: this.callbacks.getFlowManager?.(),
        dice: this.diceController,
        triggers: [],
      };
      await foldTrigger(
        "onBlockDiceRolled",
        this.blockParticipants(attacker, defender),
        ctx
      );
      this.announce(ctx.triggers);
    }

    const rollData: BlockRollData = {
      attackerId,
      defenderId,
      numDice,
      isAttackerChoice,
      results,
    };

    this.eventBus.emit(GameEventNames.BlockDiceRolled, rollData);
  }

  /**
   * Resolve block with selected result
   */
  public async resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    if (!attacker || !defender) {
      console.error("Player not found for block resolution");
      return;
    }

    switch (result.type) {
      case "skull":
        this.handleSkull(attacker);
        break;
      case "both-down":
        await this.handleBothDown(attacker, defender);
        break;
      case "push":
      case "pow":
      case "pow-dodge": {
        // Trigger point: block result — rules may cancel the knockdown
        // (Dodge turns a Defender Stumbles into a plain push unless the
        // attacker has Tackle)
        const resultCtx: BlockResultContext = {
          attacker,
          defender,
          resultType: result.type,
          isBlitz: this.isBlitzBlock(attacker),
          attackerKnockedDown: false,
          defenderKnockedDown:
            result.type === "pow" || result.type === "pow-dodge",
          decisions: this.decisions(),
          flow: this.callbacks.getFlowManager?.(),
          triggers: [],
        };
        await foldBlockResult(resultCtx, this.allPlayers());
        this.announce(resultCtx.triggers);

        await this.beginPush(
          attacker,
          defender,
          result.type,
          resultCtx.defenderKnockedDown
        );
        break;
      }
    }
  }

  /** Is this block the block at the end of the active player's Blitz? */
  private isBlitzBlock(attacker: Player): boolean {
    return (
      this.state.activePlayer?.action === "blitz" &&
      this.state.activePlayer?.id === attacker.id
    );
  }

  /**
   * Fold the push reactions (Stand Firm / Fend / Strip Ball / Grab) and start
   * the (possibly chained) push, or resolve it in place if refused. Shared by
   * plain push/POW results and by Juggernaut converting a Both Down.
   */
  private async beginPush(
    attacker: Player,
    defender: Player,
    resultType: BlockResultType,
    knockDownDefender: boolean
  ): Promise<void> {
    const pushCtx: PushContext = {
      attacker,
      pushed: defender,
      resultType,
      isBlitz: this.isBlitzBlock(attacker),
      pushedHasBall: this.isOnBall(defender),
      blockerIgnoresReactions: false,
      refused: false,
      preventFollowUp: false,
      stripBall: false,
      grabPush: false,
      sideStepPush: false,
      forceFollowUp: false,
      decisions: this.decisions(),
      flow: this.callbacks.getFlowManager?.(),
      triggers: [],
    };
    await foldTrigger(
      "onPush",
      this.blockParticipants(attacker, defender),
      pushCtx
    );
    this.announce(pushCtx.triggers);

    if (pushCtx.refused) {
      this.resolveRefusedPush(attacker, defender, knockDownDefender);
      return;
    }

    // Start a (possibly chained) push: the chain is decided link by link,
    // applied only once fully chosen (rulebook p.55)
    this.chain = {
      attackerId: attacker.id,
      resultType,
      knockDownDefender,
      preventFollowUp: pushCtx.preventFollowUp,
      stripBall: pushCtx.stripBall,
      grabPush: pushCtx.grabPush,
      sideStepPush: pushCtx.sideStepPush,
      forceFollowUp: pushCtx.forceFollowUp,
      links: [],
    };
    this.requestPushDecision(attacker.gridPosition!, defender);
  }

  /**
   * A refused push (Stand Firm): nobody moves, so there is no chain and no
   * follow-up. POW results still knock the defender down — in place.
   */
  private resolveRefusedPush(
    attacker: Player,
    defender: Player,
    knockDownDefender: boolean
  ): void {
    const flowManager = this.callbacks.getFlowManager?.();

    if (knockDownDefender) {
      this.knockDownPlayer(defender);
      if (flowManager) {
        flowManager.add(new ArmourOperation(defender.id, attacker.id), true);
        const pos = defender.gridPosition;
        if (
          pos &&
          this.state.ballPosition &&
          this.state.ballPosition.x === pos.x &&
          this.state.ballPosition.y === pos.y
        ) {
          flowManager.add(new BounceOperation(pos), true);
        }
      }
    }

    // No square was vacated, so the follow-up prompt never fires — end the
    // blocker's activation directly
    flowManager?.context.gameService.finishActivation(attacker.id);
  }

  /** Pending chain-push state between push-direction decisions */
  private chain: {
    attackerId: string;
    resultType: BlockResultType;
    /** Whether the original defender goes down (skills may have cancelled) */
    knockDownDefender?: boolean;
    /** Fend denied the blocker their follow-up */
    preventFollowUp?: boolean;
    /** Strip Ball: the pushed carrier drops the ball where they land */
    stripBall?: boolean;
    /** Grab: the blocker picks any unoccupied square adjacent to the target */
    grabPush?: boolean;
    /** Sidestep: the PUSHED player's coach picks any adjacent unoccupied square */
    sideStepPush?: boolean;
    /** Taunt: the blocker must follow up — no follow-up choice is offered */
    forceFollowUp?: boolean;
    links: {
      playerId: string;
      from: { x: number; y: number };
      to: { x: number; y: number } | null; // null = pushed into the crowd
    }[];
  } | null = null;

  /** The attacker mid-Frenzy-extra block, so it does not Frenzy a third time. */
  private frenzyExtraFor: string | null = null;

  /** Analyze and start a fresh Block Action (Frenzy's second block). */
  public async startBlock(
    attackerId: string,
    defenderId: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);
    if (!attacker || !defender) return;
    const analysis = this.blockValidator.analyzeBlock(
      attacker,
      defender,
      this.allPlayers(),
      this.state.activeTeamId
    );
    await this.rollBlockDice(
      attackerId,
      defenderId,
      analysis.diceCount,
      !analysis.isUphill
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
    const adjacent =
      !!attacker?.gridPosition &&
      !!defender?.gridPosition &&
      Math.abs(attacker.gridPosition.x - defender.gridPosition.x) <= 1 &&
      Math.abs(attacker.gridPosition.y - defender.gridPosition.y) <= 1;

    if (
      targetStanding &&
      attacker?.status === PlayerStatus.ACTIVE &&
      defender?.status === PlayerStatus.ACTIVE &&
      adjacent
    ) {
      this.frenzyExtraFor = attackerId;
      await this.startBlock(attackerId, defenderId);
    } else {
      this.callbacks
        .getFlowManager?.()
        ?.context.gameService.finishActivation(attackerId);
    }
  }

  /** Squares a Hit and Run move may end in (leaving nobody marked). */
  public hitAndRunSquares(player: Player): { x: number; y: number }[] {
    if (!player.gridPosition) return [];
    const opponents = this.allPlayers().filter(
      (p) => p.teamId !== player.teamId
    );
    const squares: { x: number; y: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const pos = {
          x: player.gridPosition.x + dx,
          y: player.gridPosition.y + dy,
        };
        if (
          pos.x < 0 ||
          pos.x >= GameConfig.PITCH_WIDTH ||
          pos.y < 0 ||
          pos.y >= GameConfig.PITCH_HEIGHT
        )
          continue;
        if (this.getPlayerAt(pos.x, pos.y)) continue;
        // Not Marked by / Marking: no standing opponent adjacent to the square.
        const marked = opponents.some(
          (o) =>
            o.status === PlayerStatus.ACTIVE &&
            o.gridPosition &&
            Math.abs(o.gridPosition.x - pos.x) <= 1 &&
            Math.abs(o.gridPosition.y - pos.y) <= 1
        );
        if (!marked) squares.push(pos);
      }
    }
    return squares;
  }

  /** Offer Hit and Run's free move, then end the activation. */
  public async resolveHitAndRun(attackerId: string): Promise<void> {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    const attacker = this.getPlayerById(attackerId);
    const squares = attacker ? this.hitAndRunSquares(attacker) : [];
    if (!attacker || attacker.status !== PlayerStatus.ACTIVE || !squares.length) {
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
    const carriedBall =
      !!this.state.ballPosition &&
      this.state.ballPosition.x === from.x &&
      this.state.ballPosition.y === from.y;
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

  private requestPushDecision(
    pusherPos: { x: number; y: number },
    pushed: Player
  ): void {
    const isOccupied = (x: number, y: number) =>
      this.getPlayerAt(x, y) !== undefined;

    // Grab / Sidestep (first push only): any unoccupied square adjacent to
    // the target — Grab hands the choice to the blocker, Sidestep to the
    // PUSHED player's coach. Both fall back to the normal push if the
    // target is fully boxed in (the skill "cannot be used").
    const anyAdjacent =
      (this.chain?.grabPush || this.chain?.sideStepPush) &&
      this.chain.links.length === 0
        ? this.blockResolutionService.getGrabPushOptions(
            pushed.gridPosition!,
            isOccupied
          )
        : [];

    const { options, tier } =
      anyAdjacent.length > 0
        ? { options: anyAdjacent, tier: "open" as const }
        : this.blockResolutionService.getPushOptions(
            pusherPos,
            pushed.gridPosition!,
            isOccupied
          );

    const sideStepApplies =
      !!this.chain?.sideStepPush &&
      this.chain.links.length === 0 &&
      anyAdjacent.length > 0;
    const attacker = this.getPlayerById(this.chain!.attackerId);

    this.eventBus.emit(GameEventNames.UI_SelectPushDirection, {
      defenderId: pushed.id,
      validDirections: options,
      canFollowUp:
        this.blockResolutionService.allowsFollowUp(this.chain!.resultType) &&
        !this.chain!.preventFollowUp,
      resultType: this.chain!.resultType,
      attackerId: this.chain!.attackerId,
      // The blocker's coach chooses — except a Sidestep push, which the
      // pushed player's coach places
      chooserTeamId: sideStepApplies ? pushed.teamId : attacker?.teamId,
      pushTier: tier,
    });
  }

  private getPlayerAt(x: number, y: number): Player | undefined {
    return [...this.team1.players, ...this.team2.players].find(
      (p) =>
        p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
    );
  }

  /**
   * Record the chosen push direction for the currently awaited player.
   * Occupied target: the occupant is pushed onward (chain, rulebook p.55).
   * Off-pitch target: pushed into the crowd. Otherwise the chain is
   * complete and all links apply, innermost first.
   */
  public executePush(
    attackerId: string,
    defenderId: string,
    direction: { x: number; y: number },
    resultType: string,
    followUp: boolean
  ): void {
    const defender = this.getPlayerById(defenderId);
    if (!defender || !defender.gridPosition) return;

    if (!this.chain) {
      // Direct call without resolveBlock (tests/tools): start a chain now
      this.chain = {
        attackerId,
        resultType: resultType as BlockResultType,
        knockDownDefender: resultType === "pow" || resultType === "pow-dodge",
        links: [],
      };
    }

    const from = { ...defender.gridPosition };
    const onPitch =
      direction.x >= 0 &&
      direction.x < GameConfig.PITCH_WIDTH &&
      direction.y >= 0 &&
      direction.y < GameConfig.PITCH_HEIGHT;

    if (!onPitch) {
      // Pushed into the crowd: chain ends at this link
      this.chain.links.push({ playerId: defenderId, from, to: null });
      this.applyChain(followUp);
      return;
    }

    this.chain.links.push({ playerId: defenderId, from, to: direction });

    const occupant = this.getPlayerAt(direction.x, direction.y);
    if (occupant && occupant.id !== defenderId) {
      // Chain push: the occupant is pushed as if by the incoming player;
      // the blocking coach keeps choosing directions
      this.requestPushDecision(from, occupant);
      return;
    }

    this.applyChain(followUp);
  }

  /** Apply all chain links innermost-first, then knockdown/follow-up. */
  private applyChain(followUp: boolean): void {
    if (!this.chain) return;
    const {
      attackerId,
      resultType,
      links,
      preventFollowUp,
      stripBall,
      forceFollowUp,
    } = this.chain;
    const knockDownDefender =
      this.chain.knockDownDefender ??
      (resultType === "pow" || resultType === "pow-dodge");
    this.chain = null;

    const flowManager = this.callbacks.getFlowManager?.();

    for (let i = links.length - 1; i >= 0; i--) {
      const link = links[i];
      const player = this.getPlayerById(link.playerId);
      if (!player) continue;

      if (link.to === null) {
        // Crowd surf: off the pitch; injury without armour, ball throw-in
        // and turnover handled by the operation. Whether it's a turnover is
        // decided NOW — by the time the operation runs the turn may have
        // ended (auto end-turn on the blocker's last activation)
        player.gridPosition = undefined;
        this.eventBus.emit(GameEventNames.PlayerPushedIntoCrowd, {
          playerId: link.playerId,
          exitSquare: link.from,
        });
        if (flowManager) {
          const isTurnover =
            player.teamId === flowManager.context.gameService.getActiveTeamId();
          flowManager.add(
            new CrowdInjuryOperation(link.playerId, link.from, isTurnover),
            true
          );
        }
        continue;
      }

      player.gridPosition = { ...link.to };

      // A pushed player keeps hold of the ball
      const carriedBall =
        this.state.ballPosition &&
        this.state.ballPosition.x === link.from.x &&
        this.state.ballPosition.y === link.from.y;
      if (carriedBall) {
        this.state.ballPosition = { ...link.to };
        this.eventBus.emit(GameEventNames.BallPlaced, { ...link.to });
      }

      const isOriginalDefender = i === 0;
      this.eventBus.emit(GameEventNames.PlayerMoved, {
        playerId: link.playerId,
        from: link.from,
        to: link.to,
        path: [link.from, link.to],
        ballFrom: carriedBall ? link.from : undefined,
        ballPath: carriedBall ? [link.from, link.to] : undefined,
        ballJoinStep: 0,
        followUpData:
          isOriginalDefender && !followUp && !preventFollowUp && !forceFollowUp
            ? { attackerId, targetSquare: link.from }
            : undefined,
      });

      // A standing carrier pushed into their scoring end zone still scores
      // (the original defender falls on POW, so no score for them)
      const knockedDown = isOriginalDefender && knockDownDefender;
      if (!knockedDown) {
        flowManager?.context.gameService.checkForTouchdown(link.playerId);
      }
    }

    // Knockdown applies only to the original defender on POW results
    const first = links[0];
    if (first && first.to === null) {
      // Defender surfed: the blocker is still offered the follow-up into
      // the vacated square. Queued at the BACK so the crowd injury +
      // throw-in settle first — the ball must be at rest and the follow-up
      // answered before the activation (and possibly the turn) ends
      flowManager?.add(new CrowdSurfFollowUpOperation(attackerId, first.from));
      return;
    }
    if (first && first.to !== null && knockDownDefender) {
      const defender = this.getPlayerById(first.playerId);
      if (defender) {
        this.knockDownPlayer(defender);
        if (flowManager) {
          // A knocked-down carrier drops the ball where they landed
          // (added after ArmourOperation so the bounce resolves first)
          flowManager.add(new ArmourOperation(first.playerId, attackerId), true);
          if (
            this.state.ballPosition &&
            this.state.ballPosition.x === first.to.x &&
            this.state.ballPosition.y === first.to.y
          ) {
            flowManager.add(new BounceOperation(first.to), true);
          }
        }
      }
    }

    // Strip Ball: a still-standing carrier who was Pushed Back drops the ball
    // where they land, which then bounces (a POW carrier drops it above).
    if (
      stripBall &&
      !knockDownDefender &&
      flowManager &&
      first &&
      first.to !== null &&
      this.state.ballPosition &&
      this.state.ballPosition.x === first.to.x &&
      this.state.ballPosition.y === first.to.y
    ) {
      flowManager.add(new BounceOperation(first.to), true);
    }

    // Taunt forced the blocker's follow-up: run the free move now (at the
    // FRONT, before any queued armour/injury rolls) and end the activation
    // once everything has settled — no follow-up prompt will fire.
    if (forceFollowUp && first && first.to !== null) {
      flowManager?.add(
        new ForcedFollowUpOperation(attackerId, first.from),
        true
      );
      flowManager?.add(new FinishActivationOperation(attackerId));
    }

    // Fend denied the blocker their follow-up: no follow-up prompt will fire,
    // so end the activation once any queued armour/injury rolls have settled
    // (queued at the BACK so the turn flips only after they apply).
    if (preventFollowUp && first && first.to !== null) {
      flowManager?.add(new FinishActivationOperation(attackerId));
    }
  }

  /**
   * Handle skull result (attacker down)
   */
  private handleSkull(attacker: Player): void {
    this.knockDownPlayer(attacker);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      flowManager.add(new ArmourOperation(attacker.id), true);
    }

    this.callbacks.onTurnover("Attacker Down (Skull)");
  }

  /**
   * Handle both down result
   */
  private async handleBothDown(
    attacker: Player,
    defender: Player
  ): Promise<void> {
    // Skill hook: rules may cancel a knock-down (Block ignores Both Down)
    // or choose both-prone-no-armour (Wrestle, a reacting-team decision).
    const ctx: BlockResultContext = {
      attacker,
      defender,
      resultType: "both-down",
      isBlitz: this.isBlitzBlock(attacker),
      attackerKnockedDown: true,
      defenderKnockedDown: true,
      decisions: this.decisions(),
      flow: this.callbacks.getFlowManager?.(),
      triggers: [],
    };
    await foldBlockResult(ctx, this.allPlayers());
    this.announce(ctx.triggers);

    // Juggernaut on a Blitz may treat the Both Down as a Push Back instead:
    // nobody is knocked down and there is no turnover.
    if (ctx.treatAsPush) {
      await this.beginPush(attacker, defender, "push", false);
      return;
    }

    const attackerHadBall = this.isOnBall(attacker);

    if (ctx.attackerKnockedDown) this.knockDownPlayer(attacker);
    if (ctx.defenderKnockedDown) this.knockDownPlayer(defender);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      // A downed carrier drops the ball (prone players can't hold it)
      [defender, attacker].forEach((p) => {
        const down =
          p === attacker ? ctx.attackerKnockedDown : ctx.defenderKnockedDown;
        if (down && this.isOnBall(p)) {
          flowManager.add(new BounceOperation(p.gridPosition!), true);
        }
      });

      // Only the players actually knocked down roll armour — none at all
      // when a rule placed them prone (Wrestle). Attacker runs first
      // (added last to the front of the queue). Only the attacker "caused"
      // a knockdown (2025 Mighty Blow: the defender performed no block).
      if (!ctx.placedProne) {
        if (ctx.defenderKnockedDown) {
          flowManager.add(new ArmourOperation(defender.id, attacker.id), true);
        }
        if (ctx.attackerKnockedDown) {
          flowManager.add(new ArmourOperation(attacker.id), true);
        }
      }
    }

    if (ctx.attackerKnockedDown) {
      if (!ctx.placedProne) {
        // A turnover happens only if the active player (the attacker) went
        // down.
        this.callbacks.onTurnover("Both Down");
      } else if (attackerHadBall) {
        // Placed Prone (p.42): a turnover only if the active player was
        // carrying the ball; otherwise just the activation ends
        this.callbacks.onTurnover("Ball carrier placed prone");
      } else {
        flowManager?.context.gameService.finishActivation(attacker.id);
      }
    }
  }

  private isOnBall(player: Player): boolean {
    return (
      !!player.gridPosition &&
      !!this.state.ballPosition &&
      this.state.ballPosition.x === player.gridPosition.x &&
      this.state.ballPosition.y === player.gridPosition.y
    );
  }

  /**
   * Knock down a player
   */
  private knockDownPlayer(player: Player): void {
    player.status = PlayerStatus.PRONE;
    this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: player.id,
    });
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  private allPlayers(): Player[] {
    return [...this.team1.players, ...this.team2.players];
  }

  private decisions() {
    return this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getDecisionService();
  }

  /** Attacker → defender → players adjacent to either, by position. */
  private blockParticipants(attacker: Player, defender: Player): Player[] {
    const all = this.allPlayers();
    const adjacents = [
      ...(attacker.gridPosition
        ? adjacentStanding(attacker.gridPosition, all)
        : []),
      ...(defender.gridPosition
        ? adjacentStanding(defender.gridPosition, all)
        : []),
    ];
    return gatherParticipants(attacker, defender, adjacents);
  }

  private announce(
    triggers: { playerId: string; skill: string; effect: string }[]
  ): void {
    triggers.forEach((t) =>
      this.eventBus.emit(GameEventNames.SkillTriggered, t)
    );
  }
}
