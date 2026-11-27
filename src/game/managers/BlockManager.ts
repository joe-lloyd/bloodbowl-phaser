import {
  type Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
  removeCondition,
} from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type ReactionDecisionAnswer } from "../../types/decisions";
import { blockDiceForStrength } from "../validators/BlockValidator";
import { type BlockAnalysis } from "../../types/Actions";
import {
  consumeOffensiveAssist,
  offensiveAssistBonus,
} from "../kickoff/driveEffects";
import {
  type BlockResult,
  type BlockRollData,
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
  type BlockResultContext,
  type BlockDeclaredContext,
  type BlockDiceRolledContext,
} from "../skills";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { PassController, type PassResult } from "../controllers/PassController";
import { type FlowContext, GameFlowManager } from "../core/GameFlowManager";
import { InOrderOperation, driveOver } from "./BlockOperations";
import { snapshotRoll } from "./BlockRerolls";
import {
  blockChoiceStage,
  bothDownRolls,
  recomputeBlockDice,
} from "./blockSteps";
import { BlockPushChain } from "./BlockPushChain";

export class BlockManager extends BlockPushChain {
  private owedAssistBonus(teamId: string): 0 | 1 {
    if (!this.state.turn) return 0;
    return offensiveAssistBonus(
      this.state,
      teamId,
      this.state.turn.teamId === teamId ? this.state.turn.turnNumber : -1
    );
  }

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

    const analysis = this.blockValidator.analyzeBlock({ attacker: attacker, defender: defender, allPlayers: this.allPlayers(), activeTeamId: this.state.activeTeamId });
    this.applyOwedAssist(attacker, analysis);

    this.eventBus.emit(GameEventNames.UI_BlockDialog, {
      attackerId,
      defenderId,
      analysis,
    });
  }

  public async rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    this.pileDriverTargets.delete(attackerId);

    if (
      attacker &&
      defender &&
      attacker.teamId !== defender.teamId &&
      !(await this.offerDumpOff(defender.id))
    ) {
      return;
    }

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
        this.frenzyExtraFor = null;
        this.eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
        this.callbacks
          .getFlowManager?.()
          ?.context.gameService.finishActivation(attacker.id);
        return;
      }

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

    const teamId = attackerId.split("-", 1)[0];
    const results = this.diceController.rollBlockDice(numDice, teamId);

    if (attacker && defender) {
      await this.announceBlockDiceRolled(attacker, defender, {
        results,
        isAttackerChoice,
      });
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

  private async announceBlockDiceRolled(
    attacker: Player,
    defender: Player,
    roll: {
      results: BlockDiceRolledContext["results"];
      isAttackerChoice: boolean;
    }
  ): Promise<void> {
    const ctx: BlockDiceRolledContext = {
      attacker,
      defender,
      results: roll.results,
      isAttackerChoice: roll.isAttackerChoice,
      ...this.triggerServices(),
      dice: this.diceController,
      triggers: [],
      rerolls: [],
    };
    await foldTrigger(
      "onBlockDiceRolled",
      this.blockParticipants(attacker, defender),
      ctx
    );
    this.announce(ctx.triggers);
    for (const { skill, before, after } of ctx.rerolls) {
      this.eventBus.emit(GameEventNames.RerollUsed, {
        playerId: attacker.id,
        source: "skill",
        skill,
        rollKind: "block",
        before,
        after,
      });
    }
  }

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
    return {
      attacker,
      defender,
      diceCount: dice.numDice,
      isAttackerChoice: dice.isAttackerChoice,
      attackerStrength: analysis.attackerST,
      defenderStrength: analysis.defenderST,
      isBlitz: this.isBlitzBlock(attacker),
      isBallAndChain: this.isBallAndChain(attacker),
      cancelled: false,
      allPlayers: this.allPlayers(),
      ...this.triggerServices(),
      dice: this.diceController,
      triggers: [],
    };
  }

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

    if (hasCondition(defender, PlayerCondition.CHOMPED)) {
      removeCondition(defender, PlayerCondition.CHOMPED);
      this.eventBus.emit(GameEventNames.PlayerStatusChanged, defender);
    }
    const moved = this.blockValidator.analyzeBlock({ attacker: attacker, defender: defender, allPlayers: board, activeTeamId: this.state.activeTeamId });
    ctx.attackerStrength = moved.attackerST;
    ctx.defenderStrength = moved.defenderST;
  }

  public async offerDumpOff(targetId: string): Promise<boolean> {
    const passer = this.getPlayerById(targetId);
    const flow = this.callbacks.getFlowManager?.();
    const gs = flow?.context.gameService;
    if (
      !passer?.gridPosition ||
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
        receiver?.playerName ??
        `(${String(targetSquare.x)}, ${String(targetSquare.y)})`
      } before the targeting action`,
    });

    const opponents = gs.getOpponents(passer.teamId);
    const marking = gs
      .getCatchController()
      .countMarkingOpponents(from, opponents);
    const result = await gs
      .getPassController()
      .attemptPass({
          player: passer,from,to: targetSquare,markingOpponents: marking,rerollDeps: {
            gameService: gs,
            eventBus: this.eventBus,
          }
        });

    await flow.runToRest(
      this.landDumpOff(passer, { from, to: targetSquare, receiver, result }, gs)
    );
    return !driveOver(this.state.phase);
  }

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

    const emptyQuickPassSquares: { x: number; y: number }[] = [];
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
    const square = [...emptyQuickPassSquares].sort(nearestFirst)[0];
    if (!square) return null;
    return receiver ? { receiver, square } : { square };
  }

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
    const scatterPath =
      result.fumbled || result.accurate
        ? undefined
        : gs.getPassController().scatterPass(to);
    const finalPosition = result.fumbled
      ? { ...from }
      : (scatterPath?.at(-1) ?? { ...to });

    this.eventBus.emit(GameEventNames.PassAttempted, {
      playerId: passer.id,
      from,
      to: { ...to },
      passType: result.passType,
      accurate: result.accurate,
      finalPosition,
      ...(scatterPath && { scatterPath }),
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

  public async resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    this.pendingBlockRoll = null;
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
        const resultCtx: BlockResultContext = {
          attacker,
          defender,
          resultType: result.type,
          isBlitz: this.isBlitzBlock(attacker),
          attackerKnockedDown: false,
          defenderKnockedDown:
            result.type === "pow" || result.type === "pow-dodge",
          ...this.triggerServices(),
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

    if (this.multipleBlockState?.attackerId === attackerId && !this.chain) {
      this.queueMultipleBlockContinuation(attackerId);
    }

    if (isFrenzyExtra) this.frenzyExtraFor = null;
  }

  public async startBallAndChainBlock(
    attackerId: string,
    defenderId: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);
    if (!attacker || !defender) return;

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
        barricadeCover: false,
        attackerAssists: [],
        defenderAssists: [],
      },
    });
    await this.rollBlockDice(attackerId, defenderId, diceCount, true);
  }

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

  private async handleBothDown(
    attacker: Player,
    defender: Player
  ): Promise<void> {
    const ctx: BlockResultContext = {
      attacker,
      defender,
      resultType: "both-down",
      isBlitz: this.isBlitzBlock(attacker),
      attackerKnockedDown: true,
      defenderKnockedDown: true,
      ...this.triggerServices(),
      triggers: [],
    };
    await foldBlockResult(ctx, this.allPlayers());
    this.announce(ctx.triggers);

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

  private resolveBothDown(
    attacker: Player,
    defender: Player,
    ctx: BlockResultContext
  ): void {
    const attackerHadBall = this.isOnBall(attacker);

    if (ctx.placedProne) {
      for (const p of [attacker, defender]) {
        p.status = PlayerStatus.PRONE;
        this.eventBus.emit(GameEventNames.PlayerStatusChanged, p);
      }
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

  private queueBothDown(
    attacker: Player,
    defender: Player,
    ctx: BlockResultContext,
    flowManager: GameFlowManager
  ): void {
    const drops: GameOperation[] = [];
    for (const p of [defender, attacker]) {
      const down =
        p === attacker ? ctx.attackerKnockedDown : ctx.defenderKnockedDown;
      const drop =
        down && this.isOnBall(p) ? this.dropCarrierBall(p, flowManager) : null;
      if (drop) drops.push(drop);
    }

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
        this.callbacks.onTurnover("Both Down");
      } else if (attackerHadBall) {
        this.callbacks.onTurnover("Ball carrier placed prone");
      } else {
        flowManager?.context.gameService.finishActivation(attacker.id);
      }
    } else {
      flowManager?.context.gameService.finishBlockActivation(attacker.id);
    }
  }
}
