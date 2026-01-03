import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { BlockValidator } from "../validators/BlockValidator";
import {
  BlockResolutionService,
  BlockResult,
  BlockResultType,
  BlockRollData,
  PushData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { DiceController } from "../controllers/DiceController";

export class BlockManager {
  private blockValidator: BlockValidator = new BlockValidator();

  constructor(
    private eventBus: IEventBus,
    _state: GameState,
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
      allPlayers
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
  public rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): void {
    const teamId = attackerId.split("-")[0];
    const results = this.diceController.rollBlockDice(numDice, teamId);

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
  public resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): void {
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
        this.handleBothDown(attacker, defender);
        break;
      case "push":
      case "pow":
      case "pow-dodge": {
        // Emit event for push direction selection
        const pushData = this.createPushData(attacker, defender, result.type);
        // Add resultType and attackerId to the data for the UI
        this.eventBus.emit(GameEventNames.UI_SelectPushDirection, {
          ...pushData,
          resultType: result.type,
          attackerId: attackerId,
        });
        break;
      }
    }
  }

  /**
   * Execute push with direction
   */
  public executePush(
    attackerId: string,
    defenderId: string,
    direction: { x: number; y: number },
    resultType: string,
    followUp: boolean
  ): void {
    const defender = this.getPlayerById(defenderId);
    if (!defender) return;

    // Save old position BEFORE moving
    const oldPosition = defender.gridPosition
      ? { ...defender.gridPosition }
      : null;

    // NOW move defender to new position
    defender.gridPosition = direction;

    // Handle knockdown for POW results
    if (resultType === "pow" || resultType === "pow-dodge") {
      this.knockDownPlayer(defender);

      // Trigger Armour Operation via FlowManager
      const flowManager = this.callbacks.getFlowManager?.();
      if (flowManager) {
        flowManager.add(new ArmourOperation(defenderId), true);
      }
    }

    // Prepare path and follow-up data
    const path = oldPosition ? [oldPosition, direction] : [direction];
    const shouldPromptFollowUp =
      !followUp &&
      oldPosition &&
      (resultType === "pow" ||
        resultType === "pow-dodge" ||
        resultType === "push");

    // Emit single playerMoved event with path and optional follow-up data
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: defenderId,
      from: oldPosition || direction,
      to: direction,
      path: path.filter(
        (p): p is { x: number; y: number } =>
          p !== null && p.x !== undefined && p.y !== undefined
      ),
      // Include follow-up data to be triggered after animation completes
      followUpData: shouldPromptFollowUp
        ? {
            attackerId: attackerId,
            targetSquare: oldPosition,
          }
        : undefined,
    });
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
  private handleBothDown(attacker: Player, defender: Player): void {
    this.knockDownPlayer(attacker);
    this.knockDownPlayer(defender);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      // Add both to queue (next: true means they get processed in order they were added to front?)
      // unshift(defender), then unshift(attacker) -> attacker runs FIRST.
      flowManager.add(new ArmourOperation(defender.id), true);
      flowManager.add(new ArmourOperation(attacker.id), true);
    }

    this.callbacks.onTurnover("Both Down");
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

  private createPushData(
    attacker: Player,
    defender: Player,
    resultType: BlockResultType
  ): PushData {
    const validDirections = this.blockResolutionService.getValidPushDirections(
      attacker.gridPosition!,
      defender.gridPosition!
    );

    return {
      defenderId: defender.id,
      validDirections,
      canFollowUp: this.blockResolutionService.allowsFollowUp(resultType),
      willFollowUp: false,
    };
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }
}
