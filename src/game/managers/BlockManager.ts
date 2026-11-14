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
import { InjuryOperation } from "../operations/InjuryOperation";
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
import { PassController } from "../controllers/PassController";
import { InOrderOperation, driveOver } from "./BlockOperations";
import { snapshotRoll } from "./BlockRerolls";
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
      // re-run the assist analysis from the new square. A Multiple Block's
      // Blocks are simultaneous, so it reads the board before either one.
      if (ctx.relocateDefenderTo && defender.gridPosition) {
        const board =
          this.multipleBlockState?.attackerId === attacker.id
            ? this.multipleBlockState.board.map((p) =>
                p.id === defender.id ? defender : p
              )
            : this.allPlayers();
        const from = { ...defender.gridPosition };
        defender.gridPosition = { ...ctx.relocateDefenderTo };
        this.eventBus.emit(GameEventNames.PlayerMoved, {
          playerId: defender.id,
          from,
          to: { ...ctx.relocateDefenderTo },
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

    rollData.choiceStage =
      !isAttackerChoice &&
      (rollData.teamRerollAvailable ||
        rollData.proAvailable ||
        rollData.brawlerAvailable ||
        rollData.veteranRerollAvailable)
        ? "attacker-reroll"
        : "pick";
    this.pendingBlockRoll = rollData;
    this.eventBus.emit(GameEventNames.BlockDiceRolled, snapshotRoll(rollData));
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
    if (!targetSquare) return true;

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
    // A Dump-off offers no interception, so an inaccurate one scatters at once.
    const scatterPath =
      result.fumbled || result.accurate
        ? undefined
        : gs.getPassController().scatterPass(targetSquare);
    const finalPosition = result.fumbled
      ? { ...from }
      : (scatterPath?.[scatterPath.length - 1] ?? { ...targetSquare });

    this.eventBus.emit(GameEventNames.PassAttempted, {
      playerId: passer.id,
      from,
      to: { ...targetSquare },
      passType: result.passType,
      accurate: result.accurate,
      finalPosition,
      scatterPath,
    });

    gs.setBallPosition(finalPosition.x, finalPosition.y);
    // The ball comes to rest, bounces and catches included, before the
    // action that provoked the pass goes on.
    const landingPlayer = result.fumbled
      ? undefined
      : gs.getPlayerAt(finalPosition.x, finalPosition.y);
    await flow.runToRest(
      landingPlayer
        ? new CatchOperation(landingPlayer.id, {
            origin: "pass",
            isPassTarget:
              !!receiver && landingPlayer.id === receiver.id && result.accurate,
          })
        : new BounceOperation(finalPosition)
    );
    return !driveOver(this.state.phase);
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
    if (flowManager) {
      // A downed carrier drops the ball (prone players can't hold it) — Safe
      // Pair of Hands places it in an adjacent empty square instead of bouncing.
      const drops: GameOperation[] = [];
      [defender, attacker].forEach((p) => {
        const down =
          p === attacker ? ctx.attackerKnockedDown : ctx.defenderKnockedDown;
        const drop =
          down && this.isOnBall(p)
            ? this.dropCarrierBall(p, flowManager)
            : null;
        if (drop) drops.push(drop);
      });

      // Only the players actually knocked down roll armour — none at all
      // when a rule placed them prone (Wrestle), though a Ball & Chain
      // player Placed Prone still rolls Injury. Defender first, then any
      // dropped ball Bounces (p.44). On Both Down each player knocked the
      // other down as part of the Block Action, so either can earn casualty
      // SPP even though only the attacker declared the Block.
      const rolls: GameOperation[] = [];
      if (!ctx.placedProne) {
        if (ctx.defenderKnockedDown) {
          rolls.push(new ArmourOperation(defender.id, attacker.id));
        }
        if (ctx.attackerKnockedDown) {
          rolls.push(new ArmourOperation(attacker.id, defender.id));
        }
      } else {
        [defender, attacker].forEach((p) => {
          if (hasSkill(p.skills, SkillType.BALL_AND_CHAIN)) {
            rolls.push(
              new InjuryOperation(p.id, { stunnedIsKnockedOut: true })
            );
          }
        });
      }
      if (rolls.length + drops.length > 0) {
        flowManager.add(new InOrderOperation([...rolls, ...drops]), true);
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
    } else {
      // The attacker stayed on their feet (Block) and nobody was pushed, so
      // no follow-up prompt will complete the block: complete it here.
      flowManager?.context.gameService.finishBlockActivation(attacker.id);
    }
  }
}
