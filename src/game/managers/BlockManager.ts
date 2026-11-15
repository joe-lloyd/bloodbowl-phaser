import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
  removeCondition,
} from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { ReactionDecisionAnswer } from "../../types/decisions";
import { blockDiceForStrength } from "../validators/BlockValidator";
import { BlockAnalysis } from "../../types/Actions";
import {
  consumeOffensiveAssist,
  offensiveAssistBonus,
} from "../kickoff/driveEffects";
import {
  BlockResult,
  BlockRollData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { BounceOperation } from "../operations/BounceOperation";
import { CatchOperation } from "../operations/CatchOperation";
import { GameConfig } from "../../config/GameConfig";
import { GameOperation } from "../core/GameOperation";
import {
  foldBlockResult,
  foldTrigger,
  BlockResultContext,
  BlockDeclaredContext,
  BlockDiceRolledContext,
} from "../skills";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { PassController, PassResult } from "../controllers/PassController";
import { FlowContext, GameFlowManager } from "../core/GameFlowManager";
import { InOrderOperation, driveOver } from "./BlockOperations";
import { snapshotRoll } from "./BlockRerolls";
import {
  blockChoiceStage,
  bothDownRolls,
  recomputeBlockDice,
} from "./blockSteps";
import { BlockPushChain } from "./BlockPushChain";

/**
 * The Block Action from declaration to result: the dice, Dump-Off's
 * interruption, and the Skull and Both Down results. The push, the
 * re-rolls and what follows the Block live in the classes this extends.
 */
export class BlockManager extends BlockPushChain {
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
    // A knockdown from an earlier block never carries into this one.
    this.pileDriverTargets.delete(attackerId);

    // Dump-Off interrupts the declaration and completes its Quick Pass before
    // the targeting Block proceeds to its dice; a touchdown from it ends the
    // Block there.
    if (
      attacker &&
      defender &&
      attacker.teamId !== defender.teamId &&
      !(await this.offerDumpOff(defender.id))
    ) {
      return;
    }

    // Trigger point: block declared — rules may adjust strength/dice, roll a
    // pre-block die, or cancel the block before any block dice are rolled.
    if (attacker && defender) {
      const analysis = this.analyzeBlock(attacker, defender);
      this.cheerOwedAssist(attacker, analysis);
      const ctx = this.blockDeclaredContext(
        attacker,
        defender,
        { numDice, isAttackerChoice },
        analysis
      );
      await foldTrigger(
        "onBlockDeclared",
        this.blockParticipants(attacker, defender),
        ctx
      );
      this.announce(ctx.triggers);

      if (ctx.cancelled) {
        // Foul Appearance et al: the block never happens; end the activation.
        this.frenzyExtraFor = null;
        this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
        this.callbacks
          .getFlowManager?.()
          ?.context.gameService.finishActivation(attacker.id);
        return;
      }

      // Trickster: the defender relocated before the dice are determined —
      // re-run the assist analysis from the new square.
      if (ctx.relocateDefenderTo && defender.gridPosition) {
        this.relocateDefender(
          attacker,
          defender,
          { from: defender.gridPosition, to: ctx.relocateDefenderTo },
          ctx
        );
      }
      recomputeBlockDice(ctx, analysis);

      numDice = ctx.diceCount;
      isAttackerChoice = ctx.isAttackerChoice;
    }

    const teamId = attackerId.split("-")[0];
    const results = this.diceController.rollBlockDice(numDice, teamId);

    // Trigger point: dice rolled — a rule may reroll dice in place (Hatred's
    // single Player Down) before the coach selects a result. Brawler's Both
    // Down re-roll is instead offered as a button in the block popup itself
    // (see blockRerollAvailability / brawlerRerollBlockDie below), so the
    // coach sees the roll before choosing to spend it.
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
      ...this.blockRerollAvailability(attacker, results, isAttackerChoice),
    };

    rollData.choiceStage = blockChoiceStage(rollData);
    this.pendingBlockRoll = rollData;
    this.eventBus.emit(GameEventNames.BlockDiceRolled, snapshotRoll(rollData));
  }

  /** Cheering Fans: the owed assist lands on this first Block of the turn. */
  private cheerOwedAssist(attacker: Player, analysis: BlockAnalysis): void {
    if (!this.applyOwedAssist(attacker, analysis)) return;
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

  private blockDeclaredContext(
    attacker: Player,
    defender: Player,
    dice: { numDice: number; isAttackerChoice: boolean },
    analysis: BlockAnalysis
  ): BlockDeclaredContext {
    const active = this.state.activePlayer;
    return {
      attacker,
      defender,
      diceCount: dice.numDice,
      isAttackerChoice: dice.isAttackerChoice,
      attackerStrength: analysis.attackerST,
      defenderStrength: analysis.defenderST,
      isBlitz: active?.action === "blitz" && active?.id === attacker.id,
      cancelled: false,
      allPlayers: this.allPlayers(),
      decisions: this.decisions(),
      flow: this.callbacks.getFlowManager?.(),
      dice: this.diceController,
      triggers: [],
    };
  }

  /**
   * Trickster moved the defender to `to`. A Multiple Block's Blocks are
   * simultaneous, so it reads the board before either one.
   */
  private relocateDefender(
    attacker: Player,
    defender: Player,
    squares: { from: { x: number; y: number }; to: { x: number; y: number } },
    ctx: BlockDeclaredContext
  ): void {
    const { to } = squares;
    const board =
      this.multipleBlockState?.attackerId === attacker.id
        ? this.multipleBlockState.board.map((p) =>
            p.id === defender.id ? defender : p
          )
        : this.allPlayers();
    const from = { ...squares.from };
    defender.gridPosition = { ...to };
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: defender.id,
      from,
      to: { ...to },
    });
    // Removed from the pitch and placed elsewhere: free of any Chomp,
    // even beside the chomper (FAQ May 2026)
    if (hasCondition(defender, PlayerCondition.CHOMPED)) {
      removeCondition(defender, PlayerCondition.CHOMPED);
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, defender);
    }
    const moved = this.blockValidator.analyzeBlock(
      attacker,
      defender,
      board,
      this.state.activeTeamId
    );
    ctx.attackerStrength = moved.attackerST;
    ctx.defenderStrength = moved.defenderST;
  }

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
   *
   * Resolves false when the pass ended the drive, caught in the end zone
   * for a touchdown: the action it interrupted must not go on.
   */
  public async offerDumpOff(targetId: string): Promise<boolean> {
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
      return true;
    }

    const from = { ...passer.gridPosition };
    const target = this.dumpOffTarget(
      passer,
      from,
      (x, y) => !!gs.getPlayerAt(x, y)
    );
    if (!target) return true;
    const { receiver, square: targetSquare } = target;

    const answer = (await gs.getDecisionService().request({
      type: "reaction",
      playerId: passer.id,
      chooserTeamId: passer.teamId,
      skill: SkillType.DUMP_OFF,
      prompt: `${passer.playerName} may make an immediate Quick Pass before the action resolves — use Dump-Off?`,
    })) as ReactionDecisionAnswer;
    if (!answer.accept) return true;

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
    // The ball comes to rest, bounces and catches included, before the
    // action that provoked the pass goes on.
    await flow.runToRest(
      this.landDumpOff(passer, { from, to: targetSquare, receiver, result }, gs)
    );
    return !driveOver(this.state.phase);
  }

  /**
   * Dump-Off's Quick Pass target: the nearest team-mate in Quick Pass range,
   * or else the nearest empty Quick Pass square. Ties go to the lower row,
   * then the lower column.
   */
  private dumpOffTarget(
    passer: Player,
    from: { x: number; y: number },
    isOccupied: (x: number, y: number) => boolean
  ): { receiver?: Player; square: { x: number; y: number } } | null {
    const distance = (square: { x: number; y: number }) =>
      Math.max(Math.abs(square.x - from.x), Math.abs(square.y - from.y));
    const nearestFirst = (
      a: { x: number; y: number },
      b: { x: number; y: number }
    ) => distance(a) - distance(b) || a.y - b.y || a.x - b.x;

    const receiver = this.allPlayers()
      .filter(
        (candidate) =>
          candidate.id !== passer.id &&
          candidate.teamId === passer.teamId &&
          candidate.status === PlayerStatus.ACTIVE &&
          !!candidate.gridPosition &&
          PassController.rangeValue(from, candidate.gridPosition) === 0
      )
      .sort((a, b) => nearestFirst(a.gridPosition!, b.gridPosition!))[0];
    if (receiver?.gridPosition) {
      return { receiver, square: { ...receiver.gridPosition } };
    }

    const emptyQuickPassSquares: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
      for (let x = 0; x < GameConfig.PITCH_WIDTH; x++) {
        const square = { x, y };
        if (
          (x !== from.x || y !== from.y) &&
          !isOccupied(x, y) &&
          PassController.rangeValue(from, square) === 0
        ) {
          emptyQuickPassSquares.push(square);
        }
      }
    }
    const square = emptyQuickPassSquares.sort(nearestFirst)[0];
    return square ? { receiver, square } : null;
  }

  /**
   * Where Dump-Off's pass ends: the ball is placed there, and the returned
   * operation catches or Bounces it.
   */
  private landDumpOff(
    passer: Player,
    {
      from,
      to,
      receiver,
      result,
    }: {
      from: { x: number; y: number };
      to: { x: number; y: number };
      receiver: Player | undefined;
      result: PassResult;
    },
    gs: FlowContext["gameService"]
  ): GameOperation {
    // A Dump-off offers no interception, so an inaccurate one scatters at once.
    const scatterPath =
      result.fumbled || result.accurate
        ? undefined
        : gs.getPassController().scatterPass(to);
    const finalPosition = result.fumbled
      ? { ...from }
      : (scatterPath?.[scatterPath.length - 1] ?? { ...to });

    this.eventBus.emit(GameEventNames.PassAttempted, {
      playerId: passer.id,
      from,
      to: { ...to },
      passType: result.passType,
      accurate: result.accurate,
      finalPosition,
      scatterPath,
    });

    gs.setBallPosition(finalPosition.x, finalPosition.y);
    const landingPlayer = result.fumbled
      ? undefined
      : gs.getPlayerAt(finalPosition.x, finalPosition.y);
    return landingPlayer
      ? new CatchOperation(landingPlayer.id, {
          origin: "pass",
          isPassTarget:
            !!receiver && landingPlayer.id === receiver.id && result.accurate,
        })
      : new BounceOperation(finalPosition);
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
    const isFrenzyExtra = this.frenzyExtraFor === attackerId;
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    if (!attacker || !defender) {
      console.error("Player not found for block resolution");
      return;
    }

    switch (result.type) {
      case "skull":
        await this.handleSkull(attacker);
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
          this.explodeSaboteur(attacker, defender);
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
    // Stand Firm can start the extra Block before the first resolve returns.
    // Only the extra Block itself may clear its marker.
    if (isFrenzyExtra) this.frenzyExtraFor = null;
  }

  /**
   * Ball & Chain (2025 rulebook p.124): the lurching Fanatic "will
   * automatically perform a Block Action" against the Standing player in the
   * square it entered. "If this is a team-mate, then this player's Coach will
   * choose which result to apply": the dice are by Strength alone, with no
   * assists, and always the Fanatic's choice.
   */
  public async startBallAndChainBlock(
    attackerId: string,
    defenderId: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);
    if (!attacker || !defender) return;
    // The block dialog opens on the matchup, as when a coach declares one
    if (attacker.teamId !== defender.teamId) {
      this.previewBlock(attackerId, defenderId);
      await this.startBlock(attackerId, defenderId);
      return;
    }
    const { diceCount } = blockDiceForStrength(
      attacker.stats.ST,
      defender.stats.ST
    );
    this.eventBus.emit(GameEventNames.UI_BlockDialog, {
      attackerId,
      defenderId,
      analysis: {
        diceCount,
        isUphill: false,
        attackerST: attacker.stats.ST,
        defenderST: defender.stats.ST,
        attackerAssists: [],
        defenderAssists: [],
      },
    });
    await this.rollBlockDice(attackerId, defenderId, diceCount, true);
  }

  /** A Saboteur target exploded: the blocker goes down instead. */
  private explodeSaboteur(attacker: Player, defender: Player): void {
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
  }

  /**
   * Handle skull result (attacker down)
   */
  private async handleSkull(attacker: Player): Promise<void> {
    const gameService = this.callbacks.getFlowManager?.()?.context.gameService;
    if (
      await steadyFootingSaves(
        attacker,
        this.diceController,
        this.eventBus,
        gameService
      )
    ) {
      gameService?.finishBlockActivation(attacker.id);
      return;
    }
    const attackerHadBall = this.isOnBall(attacker);
    this.knockDownPlayer(attacker);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      // The Armour Roll, then a carried ball drops, as on a Both Down.
      const drop = attackerHadBall
        ? this.dropCarrierBall(attacker, flowManager)
        : null;
      flowManager.add(
        new InOrderOperation([
          new ArmourOperation(attacker.id),
          ...(drop ? [drop] : []),
        ]),
        true
      );
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
    // nobody is knocked down and there is no turnover. A Wrestle the blitzer
    // accepted is their choice not to, and it holds whatever the skill order.
    if (ctx.treatAsPush && !ctx.placedProne) {
      await this.beginPush(attacker, defender, "push", false);
      return;
    }

    const gameService = this.callbacks.getFlowManager?.()?.context.gameService;
    if (!ctx.placedProne) {
      if (
        ctx.attackerKnockedDown &&
        (await steadyFootingSaves(
          attacker,
          this.diceController,
          this.eventBus,
          gameService
        ))
      ) {
        ctx.attackerKnockedDown = false;
      }
      if (
        ctx.defenderKnockedDown &&
        (await steadyFootingSaves(
          defender,
          this.diceController,
          this.eventBus,
          gameService
        ))
      ) {
        ctx.defenderKnockedDown = false;
      }
    }
    this.resolveBothDown(attacker, defender, ctx);
  }

  /** Both Down after the Steady Footing rolls: lay the players down. */
  private resolveBothDown(
    attacker: Player,
    defender: Player,
    ctx: BlockResultContext
  ): void {
    const attackerHadBall = this.isOnBall(attacker);

    if (ctx.placedProne) {
      [attacker, defender].forEach((p) => {
        p.status = PlayerStatus.PRONE;
        this.eventBus.emit(GameEventNames.PlayerStatusChanged, p);
      });
    } else {
      if (ctx.attackerKnockedDown) this.knockDownPlayer(attacker);
      if (ctx.defenderKnockedDown) this.knockDownTarget(defender);
    }
    if (
      ctx.defenderKnockedDown &&
      !ctx.placedProne &&
      hasSkill(attacker.skills, SkillType.PILE_DRIVER)
    ) {
      this.pileDriverTargets.set(attacker.id, defender.id);
    }

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) this.queueBothDown(attacker, defender, ctx, flowManager);
    this.endBothDown(attacker, ctx, attackerHadBall, flowManager);
  }

  /** Queue the armour or injury rolls, then the dropped balls. */
  private queueBothDown(
    attacker: Player,
    defender: Player,
    ctx: BlockResultContext,
    flowManager: GameFlowManager
  ): void {
    // A downed carrier drops the ball (prone players can't hold it) — Safe
    // Pair of Hands places it in an adjacent empty square instead of bouncing.
    const drops: GameOperation[] = [];
    [defender, attacker].forEach((p) => {
      const down =
        p === attacker ? ctx.attackerKnockedDown : ctx.defenderKnockedDown;
      const drop =
        down && this.isOnBall(p) ? this.dropCarrierBall(p, flowManager) : null;
      if (drop) drops.push(drop);
    });

    // The armour rolls first, then any dropped ball Bounces (p.44).
    const rolls = bothDownRolls(ctx, attacker, defender);
    if (rolls.length + drops.length > 0) {
      flowManager.add(new InOrderOperation([...rolls, ...drops]), true);
    }
  }

  private endBothDown(
    attacker: Player,
    ctx: BlockResultContext,
    attackerHadBall: boolean,
    flowManager: GameFlowManager | undefined
  ): void {
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
    } else {
      // The attacker stayed on their feet (Block) and nobody was pushed, so
      // no follow-up prompt will complete the block: complete it here.
      flowManager?.context.gameService.finishBlockActivation(attacker.id);
    }
  }
}
