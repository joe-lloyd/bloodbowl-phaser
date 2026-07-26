import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { ReactionDecisionAnswer } from "../../types/decisions";
import {
  BlockValidator,
  blockDiceForStrength,
} from "../validators/BlockValidator";
import { BlockAnalysis } from "../../types/Actions";
import {
  consumeOffensiveAssist,
  offensiveAssistBonus,
} from "../kickoff/driveEffects";
import {
  BlockResolutionService,
  BlockResult,
  BlockResultType,
  BlockRollData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { BounceOperation } from "../operations/BounceOperation";
import { CatchOperation } from "../operations/CatchOperation";
import { CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { GameConfig } from "../../config/GameConfig";
import { DiceController } from "../controllers/DiceController";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { PileDriverOperation } from "../operations/PileDriverOperation";
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
import { PassController } from "../controllers/PassController";

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
    // Let the Push Back animation land before the blocker follows up…
    await context.delay(300);
    // Frenzy forces the follow-up into the vacated square.
    await context.gameService.followUpPush(this.attackerId, this.vacatedSquare);
    // …and let that follow-up move finish before the second Block window opens.
    await context.delay(450);
    await this.manager.frenzySecondBlock(
      this.attackerId,
      this.defenderId,
      this.targetStanding
    );
  }
}

/**
 * Advances a Multiple Block only after the first block's complete push,
 * armour, injury, and ball chain has settled. A latched Turnover waits for
 * this operation too, so the second Block is still resolved in full.
 */
class ContinueMultipleBlockOperation extends GameOperation {
  public readonly name = "ContinueMultipleBlock";

  constructor(
    private manager: BlockManager,
    private attackerId: string
  ) {
    super();
  }

  async execute(_context: FlowContext): Promise<void> {
    await this.manager.continueMultipleBlock(this.attackerId);
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

  async execute(_context: FlowContext): Promise<void> {
    await this.manager.resolveHitAndRun(this.attackerId);
  }
}

export class BlockManager {
  private pileDriverTargets = new Map<string, string>();
  private blockValidator: BlockValidator = new BlockValidator();
  private multipleBlockState: {
    attackerId: string;
    defenderIds: [string, string];
    nextIndex: number;
    originalStrength: number;
    continuationQueued: boolean;
  } | null = null;

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

  /**
   * Cheering Fans: an owed Offensive Assist adds +1 ST to the team's first
   * Block of the turn it was granted for. Returns 0 outside that window.
   */
  private owedAssistBonus(teamId: string): 0 | 1 {
    if (!this.state.turn) return 0;
    return offensiveAssistBonus(
      this.state,
      teamId,
      this.state.turn.teamId === teamId ? this.state.turn.turnNumber : -1
    );
  }

  /** Apply the owed-assist bonus to an analysis (ST and dice re-derived). */
  private applyOwedAssist(attacker: Player, analysis: BlockAnalysis): boolean {
    if (!this.owedAssistBonus(attacker.teamId)) return false;
    analysis.attackerST += 1;
    const recomputed = blockDiceForStrength(
      analysis.attackerST,
      analysis.defenderST
    );
    analysis.diceCount = recomputed.diceCount;
    analysis.isUphill = recomputed.isUphill;
    return true;
  }

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
    this.applyOwedAssist(attacker, analysis);

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

    // Dump-Off interrupts the declaration and completes its Quick Pass before
    // the targeting Block proceeds to its dice.
    if (attacker && defender && attacker.teamId !== defender.teamId) {
      await this.offerDumpOff(defender.id);
    }

    // Trigger point: block declared — rules may adjust strength/dice, roll a
    // pre-block die, or cancel the block before any block dice are rolled.
    if (attacker && defender) {
      const analysis = this.blockValidator.analyzeBlock(
        attacker,
        defender,
        this.allPlayers(),
        this.state.activeTeamId
      );
      // Cheering Fans: the owed assist lands on this first Block of the turn
      if (this.applyOwedAssist(attacker, analysis)) {
        consumeOffensiveAssist(
          this.state,
          attacker.teamId,
          this.state.turn.turnNumber
        );
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Cheering Fans: +1 Offensive Assist on the first Block!"
        );
      }
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
        allPlayers: this.allPlayers(),
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

      // Trickster: the defender relocated before the dice are determined —
      // re-run the assist analysis from the new square
      if (ctx.relocateDefenderTo && defender.gridPosition) {
        const from = { ...defender.gridPosition };
        defender.gridPosition = { ...ctx.relocateDefenderTo };
        this.eventBus.emit(GameEventNames.PlayerMoved, {
          playerId: defender.id,
          from,
          to: { ...ctx.relocateDefenderTo },
        });
        const moved = this.blockValidator.analyzeBlock(
          attacker,
          defender,
          this.allPlayers(),
          this.state.activeTeamId
        );
        ctx.attackerStrength = moved.attackerST;
        ctx.defenderStrength = moved.defenderST;
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
      ...this.blockRerollAvailability(attacker),
    };

    this.pendingBlockRoll = rollData;
    this.eventBus.emit(GameEventNames.BlockDiceRolled, rollData);
  }

  /** The block roll awaiting the coach's result choice (for re-rolls). */
  private pendingBlockRoll: BlockRollData | null = null;

  /**
   * Dump-Off: an opposition-targeted ball carrier may make an immediate
   * Quick Pass. It never causes a Turnover because it is an interruption
   * during the opponent's action, not the reacting team's turn.
   *
   * The current decision channel is yes/no, so the deterministic legal target
   * is the nearest on-pitch team-mate (board order breaks ties), or the nearest
   * empty Quick Pass square when no team-mate is in range. This keeps
   * browser/headless/online resolution identical until the target-picker
   * decision gains a payload.
   */
  public async offerDumpOff(targetId: string): Promise<void> {
    const passer = this.getPlayerById(targetId);
    const flow = this.callbacks.getFlowManager?.();
    const gs = flow?.context.gameService;
    if (
      !passer ||
      !passer.gridPosition ||
      !flow ||
      !gs ||
      !hasSkill(passer.skills, SkillType.DUMP_OFF) ||
      !this.isOnBall(passer)
    ) {
      return;
    }

    const from = { ...passer.gridPosition };
    const quickTargets = this.allPlayers()
      .filter(
        (candidate) =>
          candidate.id !== passer.id &&
          candidate.teamId === passer.teamId &&
          candidate.status === PlayerStatus.ACTIVE &&
          !!candidate.gridPosition &&
          PassController.rangeValue(from, candidate.gridPosition) === 0
      )
      .sort((a, b) => {
        const ad = Math.max(
          Math.abs(a.gridPosition!.x - from.x),
          Math.abs(a.gridPosition!.y - from.y)
        );
        const bd = Math.max(
          Math.abs(b.gridPosition!.x - from.x),
          Math.abs(b.gridPosition!.y - from.y)
        );
        return (
          ad - bd ||
          a.gridPosition!.y - b.gridPosition!.y ||
          a.gridPosition!.x - b.gridPosition!.x
        );
      });
    const receiver = quickTargets[0];
    const emptyQuickPassSquares: Array<{ x: number; y: number }> = [];
    if (!receiver?.gridPosition) {
      for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
        for (let x = 0; x < GameConfig.PITCH_WIDTH; x++) {
          const square = { x, y };
          if (
            (x !== from.x || y !== from.y) &&
            !gs.getPlayerAt(x, y) &&
            PassController.rangeValue(from, square) === 0
          ) {
            emptyQuickPassSquares.push(square);
          }
        }
      }
      emptyQuickPassSquares.sort(
        (a, b) =>
          Math.max(Math.abs(a.x - from.x), Math.abs(a.y - from.y)) -
            Math.max(Math.abs(b.x - from.x), Math.abs(b.y - from.y)) ||
          a.y - b.y ||
          a.x - b.x
      );
    }
    const targetSquare = receiver?.gridPosition
      ? { ...receiver.gridPosition }
      : emptyQuickPassSquares[0];
    if (!targetSquare) return;

    const answer = (await gs.getDecisionService().request({
      type: "reaction",
      playerId: passer.id,
      chooserTeamId: passer.teamId,
      skill: SkillType.DUMP_OFF,
      prompt: `${passer.playerName} may make an immediate Quick Pass before the action resolves — use Dump-Off?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return;

    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: passer.id,
      skill: SkillType.DUMP_OFF,
      effect: `Dump-Off: Quick Pass to ${
        receiver?.playerName ?? `(${targetSquare.x}, ${targetSquare.y})`
      } before the targeting action`,
    });

    const opponents = gs.getOpponents(passer.teamId);
    const marking = gs
      .getCatchController()
      .countMarkingOpponents(from, opponents);
    const result = await gs
      .getPassController()
      .attemptPass(passer, from, targetSquare, marking, {
        gameService: gs,
        eventBus: this.eventBus,
      });

    this.eventBus.emit(GameEventNames.PassAttempted, {
      playerId: passer.id,
      from,
      to: { ...targetSquare },
      passType: result.passType,
      accurate: result.accurate,
      finalPosition: result.finalPosition,
      scatterPath: result.scatterPath,
    });

    gs.setBallPosition(result.finalPosition.x, result.finalPosition.y);
    if (result.fumbled) {
      flow.add(new BounceOperation(from), true);
      return;
    }
    const landingPlayer = gs.getPlayerAt(
      result.finalPosition.x,
      result.finalPosition.y
    );
    if (landingPlayer) {
      await new CatchOperation(landingPlayer.id, false, {
        origin: "pass",
        isPassTarget:
          !!receiver && landingPlayer.id === receiver.id && result.accurate,
      }).execute(flow.context);
    } else {
      flow.add(new BounceOperation(result.finalPosition), true);
    }
  }

  /** Which block-dice re-rolls the attacker may use right now. */
  private blockRerollAvailability(attacker?: Player): {
    teamRerollAvailable: boolean;
    proAvailable: boolean;
  } {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    const arbiter = gs?.getRerollArbiter();
    if (!attacker || !gs || !arbiter) {
      return { teamRerollAvailable: false, proAvailable: false };
    }
    return {
      teamRerollAvailable: arbiter.teamRerollAvailable(attacker.teamId),
      proAvailable:
        hasSkill(attacker.skills, SkillType.PRO) &&
        gs.getState().activePlayer?.id === attacker.id &&
        arbiter.onceAvailable(attacker, SkillType.PRO),
    };
  }

  /**
   * Team Re-roll on a block: re-roll ALL the dice. One re-roll per block, so
   * Pro is locked out afterwards.
   */
  public teamRerollBlock(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    const attacker = this.getPlayerById(attackerId);
    const arbiter = this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter();
    if (
      !attacker ||
      !arbiter ||
      !arbiter.teamRerollAvailable(attacker.teamId)
    ) {
      return;
    }
    arbiter.consumeTeamReroll(attacker.teamId);
    pending.results = this.diceController.rollBlockDice(
      pending.numDice,
      attacker.teamId
    );
    this.eventBus.emit(GameEventNames.RerollUsed, {
      playerId: attackerId,
      source: "team",
      rollKind: "block",
      before: 0,
      after: 0,
    });
    pending.teamRerollAvailable = false;
    pending.proAvailable = false;
    this.eventBus.emit(GameEventNames.BlockDiceRolled, pending);
  }

  /**
   * Pro on a block: re-roll a SINGLE die (3+ to use). Once attempted, no
   * other re-roll source may be used on this block (rulebook p.133).
   */
  public proRerollBlockDie(attackerId: string, dieIndex: number): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    if (dieIndex < 0 || dieIndex >= pending.results.length) return;
    const attacker = this.getPlayerById(attackerId);
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    const arbiter = gs?.getRerollArbiter();
    if (!attacker || !gs || !arbiter) return;
    if (!hasSkill(attacker.skills, SkillType.PRO)) return;
    if (gs.getState().activePlayer?.id !== attacker.id) return;
    if (!arbiter.onceAvailable(attacker, SkillType.PRO)) return;

    // Once Pro is attempted the die is committed to Pro — no other source.
    arbiter.consumeOnce(attacker, SkillType.PRO);
    const gate = this.diceController.rollSkillCheck(
      "Pro",
      3,
      0,
      attacker.playerName
    );
    if (gate.success) {
      pending.results[dieIndex] = this.diceController.rollBlockDice(
        1,
        attacker.teamId
      )[0];
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attackerId,
        skill: SkillType.PRO,
        effect: "Pro: re-rolled a block die",
      });
    } else {
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attackerId,
        skill: SkillType.PRO,
        effect: "Pro: the attempt fails — no other re-roll may be used",
      });
    }
    pending.proAvailable = false;
    pending.teamRerollAvailable = false;
    this.eventBus.emit(GameEventNames.BlockDiceRolled, pending);
  }

  /**
   * Resolve block with selected result
   */
  public async resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    this.pendingBlockRoll = null; // the coach committed to a result
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
          dice: this.diceController,
          triggers: [],
        };
        await foldBlockResult(resultCtx, this.allPlayers());
        this.announce(resultCtx.triggers);

        if (resultCtx.saboteurExploded) {
          const flowManager = this.callbacks.getFlowManager?.();
          this.knockDownPlayer(attacker);
          this.eventBus.emit(GameEventNames.PlayerStatusChanged, defender);
          if (flowManager) {
            flowManager.add(new ArmourOperation(attacker.id), true);
            if (this.isOnBall(attacker) && attacker.gridPosition) {
              flowManager.add(new BounceOperation(attacker.gridPosition), true);
              this.callbacks.onTurnover("Ball carrier hit by Saboteur");
            }
          }
          this.endBlockActivation(attacker.id);
          break;
        }

        await this.beginPush(
          attacker,
          defender,
          result.type,
          resultCtx.defenderKnockedDown
        );
        break;
      }
    }

    // Push results continue once their complete chain settles. Non-push
    // results can advance immediately (at the back of the flow queue).
    if (this.multipleBlockState?.attackerId === attackerId && !this.chain) {
      this.queueMultipleBlockContinuation(attackerId);
    }

    // A Frenzy extra block is now resolved (beginPush already read the flag);
    // clear it so this player Frenzies again on their next Block Action.
    if (this.frenzyExtraFor === attackerId) this.frenzyExtraFor = null;
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

    // Rooted players cannot be Pushed Back for any reason — a condition,
    // not a skill reaction, so Juggernaut's cancel does not apply
    if (hasCondition(defender, PlayerCondition.ROOTED)) {
      pushCtx.refused = true;
      this.announce([
        {
          playerId: defender.id,
          skill: SkillType.TAKE_ROOT,
          effect: "Rooted: cannot be pushed back",
        },
      ]);
    }
    // A Rooted attacker may never follow up
    if (hasCondition(attacker, PlayerCondition.ROOTED)) {
      pushCtx.preventFollowUp = true;
    }
    if (this.multipleBlockState?.attackerId === attacker.id) {
      // Multiple Block never permits a Follow-up and cannot combine with
      // Frenzy's forced follow-up/extra block.
      pushCtx.preventFollowUp = true;
      pushCtx.forceFollowUp = false;
    }

    // Frenzy: the blocker MUST follow up a Push Back, and — on the first block
    // only — must throw a second Block at the same player if they are still
    // Standing. `frenzyExtraFor` marks the second (extra) block so it doesn't
    // spawn a third.
    const frenzy =
      hasSkill(attacker.skills, SkillType.FRENZY) &&
      this.multipleBlockState?.attackerId !== attacker.id &&
      this.frenzyExtraFor !== attacker.id &&
      !pushCtx.preventFollowUp;
    if (
      hasSkill(attacker.skills, SkillType.FRENZY) &&
      this.multipleBlockState?.attackerId !== attacker.id &&
      !pushCtx.preventFollowUp
    ) {
      pushCtx.forceFollowUp = true; // both the first and the extra block
    }

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
      frenzy,
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
      if (hasSkill(attacker.skills, SkillType.PILE_DRIVER)) {
        this.pileDriverTargets.set(attacker.id, defender.id);
      }
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
    // blocker's activation directly (Hit and Run may take a free square first).
    this.endBlockActivation(attacker.id);
  }

  /**
   * End the blocker's activation after a Block resolves — but if they are a
   * still-Standing Hit and Run player with a legal free square, queue the
   * Hit and Run move (which ends the activation itself). Currently wired into
   * the knockdown-in-place completion; the push/follow-up and Stab paths are
   * a further increment.
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
    const attacker = this.getPlayerById(attackerId);
    const pileDriverTarget = this.pileDriverTargets.get(attackerId);
    this.pileDriverTargets.delete(attackerId);
    if (
      attacker &&
      pileDriverTarget &&
      attacker.status === PlayerStatus.ACTIVE
    ) {
      flowManager.add(new PileDriverOperation(attackerId, pileDriverTarget));
      return;
    }
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
    /** Taunt / Frenzy: the blocker must follow up — no follow-up choice offered */
    forceFollowUp?: boolean;
    /** Frenzy's FIRST block: force follow-up + a mandatory second block. */
    frenzy?: boolean;
    links: {
      playerId: string;
      from: { x: number; y: number };
      to: { x: number; y: number } | null; // null = pushed into the crowd
    }[];
  } | null = null;

  /** The attacker mid-Frenzy-extra block, so it does not Frenzy a third time. */
  private frenzyExtraFor: string | null = null;

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

    this.multipleBlockState = {
      attackerId,
      defenderIds: [defender1Id, defender2Id],
      nextIndex: 1,
      originalStrength: attacker.stats.ST,
      continuationQueued: false,
    };
    attacker.stats.ST = Math.max(1, attacker.stats.ST - 2);
    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attackerId,
      skill: SkillType.MULTIPLE_BLOCK,
      effect: "Multiple Block: two Blocks at -2 Strength with no Follow-up",
    });
    await this.startBlock(attackerId, defender1Id);
  }

  private queueMultipleBlockContinuation(attackerId: string): void {
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
    if (state.nextIndex < state.defenderIds.length) {
      const defenderId = state.defenderIds[state.nextIndex++];
      await this.startBlock(attackerId, defenderId);
      return;
    }

    const attacker = this.getPlayerById(attackerId);
    if (attacker) attacker.stats.ST = state.originalStrength;
    this.multipleBlockState = null;
    this.callbacks
      .getFlowManager?.()
      ?.context.gameService.finishActivation(attackerId);
  }

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
      (p) => p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
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
      frenzy,
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
      if (this.multipleBlockState?.attackerId === attackerId) {
        this.queueMultipleBlockContinuation(attackerId);
      } else {
        flowManager?.add(
          new CrowdSurfFollowUpOperation(attackerId, first.from)
        );
      }
      return;
    }
    if (first && first.to !== null && knockDownDefender) {
      const defender = this.getPlayerById(first.playerId);
      if (defender) {
        this.knockDownPlayer(defender);
        const attacker = this.getPlayerById(attackerId);
        if (attacker && hasSkill(attacker.skills, SkillType.PILE_DRIVER)) {
          this.pileDriverTargets.set(attackerId, defender.id);
        }
        if (flowManager) {
          // A knocked-down carrier drops the ball where they landed
          // (added after ArmourOperation so the bounce resolves first)
          flowManager.add(
            new ArmourOperation(first.playerId, attackerId),
            true
          );
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

    // Frenzy's first block: force the follow-up into the vacated square and,
    // if the target is still Standing, throw a mandatory second Block at the
    // same player. Queued at the BACK so a POW's armour/injury settle first;
    // FrenzyOperation then follows up, blocks again if able, and ends the
    // activation (so it is NOT combined with the forceFollowUp branch below).
    if (frenzy && first && first.to !== null) {
      flowManager?.add(
        new FrenzyOperation(
          this,
          attackerId,
          first.playerId,
          first.from,
          !knockDownDefender
        )
      );
    } else if (forceFollowUp && first && first.to !== null) {
      // Taunt, or Frenzy's second (extra) block: run the free follow-up now
      // (at the FRONT) and end the activation once everything has settled —
      // no follow-up prompt will fire.
      flowManager?.add(
        new ForcedFollowUpOperation(attackerId, first.from),
        true
      );
      flowManager?.add(new FinishActivationOperation(attackerId));
    } else if (preventFollowUp && first && first.to !== null) {
      // Fend denied the blocker their follow-up: no follow-up prompt will
      // fire, so end the activation once any queued armour/injury rolls have
      // settled (queued at the BACK so the turn flips only after they apply).
      if (this.multipleBlockState?.attackerId === attackerId) {
        this.queueMultipleBlockContinuation(attackerId);
      } else {
        flowManager?.add(new FinishActivationOperation(attackerId));
      }
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
      // A downed carrier drops the ball (prone players can't hold it) — Safe
      // Pair of Hands places it in an adjacent empty square instead of bouncing.
      [defender, attacker].forEach((p) => {
        const down =
          p === attacker ? ctx.attackerKnockedDown : ctx.defenderKnockedDown;
        if (down && this.isOnBall(p)) {
          this.dropCarrierBall(p, flowManager);
        }
      });

      // Only the players actually knocked down roll armour — none at all
      // when a rule placed them prone (Wrestle). Attacker runs first
      // (added last to the front of the queue). On Both Down each player
      // knocked the other down as part of the Block Action, so either can
      // earn casualty SPP even though only the attacker declared the Block.
      if (!ctx.placedProne) {
        if (ctx.defenderKnockedDown) {
          flowManager.add(new ArmourOperation(defender.id, attacker.id), true);
        }
        if (ctx.attackerKnockedDown) {
          flowManager.add(new ArmourOperation(attacker.id, defender.id), true);
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
   * A knocked-down carrier drops the ball. Safe Pair of Hands (2025 p.126)
   * places it in an adjacent unoccupied square instead of Bouncing; otherwise
   * the ball Bounces from the carrier's square as normal.
   */
  private dropCarrierBall(
    player: Player,
    flowManager: import("../core/GameFlowManager").GameFlowManager
  ): void {
    const pos = player.gridPosition!;
    if (hasSkill(player.skills, SkillType.SAFE_PAIR_OF_HANDS)) {
      const spot = this.adjacentEmptySquare(pos);
      if (spot) {
        flowManager.context.gameService.setBallPosition(spot.x, spot.y);
        this.eventBus.emit(GameEventNames.BallPlaced, spot);
        this.eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: SkillType.SAFE_PAIR_OF_HANDS,
          effect: "Safe Pair of Hands: places the ball in an adjacent square",
        });
        return;
      }
    }
    flowManager.add(new BounceOperation(pos), true);
  }

  /** First unoccupied on-pitch square adjacent to `pos` (fixed clockwise order). */
  private adjacentEmptySquare(pos: {
    x: number;
    y: number;
  }): { x: number; y: number } | null {
    const occupied = new Set(
      this.allPlayers()
        .filter((p) => p.gridPosition)
        .map((p) => `${p.gridPosition!.x},${p.gridPosition!.y}`)
    );
    const dirs = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const s = { x: pos.x + dx, y: pos.y + dy };
      if (
        s.x < 0 ||
        s.y < 0 ||
        s.x >= GameConfig.PITCH_WIDTH ||
        s.y >= GameConfig.PITCH_HEIGHT
      ) {
        continue;
      }
      if (!occupied.has(`${s.x},${s.y}`)) return s;
    }
    return null;
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
