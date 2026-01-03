import { Player } from "../types";

/**
 * Block dice result types
 */
export type BlockResultType =
  | "both-down"
  | "skull"
  | "push"
  | "pow"
  | "pow-dodge";

/**
 * Block dice result
 */
export interface BlockResult {
  type: BlockResultType;
  icon: string;
  label: string;
}

/**
 * Block roll data
 */
export interface BlockRollData {
  attackerId: string;
  defenderId: string;
  numDice: number;
  isAttackerChoice: boolean;
  results: BlockResult[];
  selectedResult?: BlockResult;
}

/**
 * Push direction data
 */
export interface PushData {
  defenderId: string;
  validDirections: { x: number; y: number }[];
  selectedDirection?: { x: number; y: number };
  canFollowUp: boolean;
  willFollowUp?: boolean;
}

/**
 * Armor roll result
 */
export interface ArmorResult {
  playerId: string;
  roll: number;
  armor: number;
  broken: boolean;
}

/**
 * Block Resolution Service
 * Handles all block dice rolling and resolution logic
 */
export class BlockResolutionService {
  private static readonly BLOCK_DICE_FACES: BlockResultType[] = [
    "skull",
    "both-down",
    "push",
    "push",
    "pow",
    "pow-dodge",
  ];

  /**
   * Roll block dice
   */
  public static rollBlockDice(numDice: number): BlockResult[] {
    const results: BlockResult[] = [];

    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * 6);
      const type = this.BLOCK_DICE_FACES[roll];
      results.push(this.createBlockResult(type));
    }

    return results;
  }

  /**
   * Create a block result object
   */
  private static createBlockResult(type: BlockResultType): BlockResult {
    const iconMap: Record<BlockResultType, string> = {
      "both-down": "/assets/dice/block_dice_both_down_1765911752228.png",
      skull: "/assets/dice/block_dice_skull_1765911765691.png",
      push: "/assets/dice/block_dice_push_1765911780125.png",
      pow: "/assets/dice/block_dice_pow_1765911794882.png",
      "pow-dodge": "/assets/dice/block_dice_pow_dodge_1765911812595.png",
    };

    const labelMap: Record<BlockResultType, string> = {
      "both-down": "Both Down",
      skull: "Attacker Down",
      push: "Push",
      pow: "POW!",
      "pow-dodge": "POW!/Dodge",
    };

    return {
      type,
      icon: iconMap[type],
      label: labelMap[type],
    };
  }

  /**
   * Select the best/worst result based on who has choice
   */
  public static selectBlockResult(
    results: BlockResult[],
    isAttackerChoice: boolean
  ): BlockResult {
    // Priority order (best to worst for attacker)
    const priority: BlockResultType[] = [
      "pow",
      "pow-dodge",
      "push",
      "both-down",
      "skull",
    ];

    if (isAttackerChoice) {
      // Attacker picks best
      for (const type of priority) {
        const result = results.find((r) => r.type === type);
        if (result) return result;
      }
    } else {
      // Defender picks worst (reverse priority)
      for (let i = priority.length - 1; i >= 0; i--) {
        const result = results.find((r) => r.type === priority[i]);
        if (result) return result;
      }
    }

    return results[0]; // Fallback
  }

  /**
   * Get valid push directions (3 squares behind defender)
   */
  public static getValidPushDirections(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number }
  ): { x: number; y: number }[] {
    // Calculate direction vector from attacker to defender
    const dx = defenderPos.x - attackerPos.x;
    const dy = defenderPos.y - attackerPos.y;

    // Normalize to get primary direction
    const primaryDir = { x: Math.sign(dx), y: Math.sign(dy) };

    // The 3 valid push squares are:
    // 1. Straight back (primary direction)
    // 2. Diagonal left
    // 3. Diagonal right

    const directions: { x: number; y: number }[] = [];

    // Straight back
    directions.push({
      x: defenderPos.x + primaryDir.x,
      y: defenderPos.y + primaryDir.y,
    });

    // Diagonal variations
    if (primaryDir.x !== 0 && primaryDir.y !== 0) {
      // Already diagonal, add the two adjacent diagonals
      directions.push({
        x: defenderPos.x + primaryDir.x,
        y: defenderPos.y,
      });
      directions.push({
        x: defenderPos.x,
        y: defenderPos.y + primaryDir.y,
      });
    } else if (primaryDir.x !== 0) {
      // Horizontal push, add diagonals up and down
      directions.push({
        x: defenderPos.x + primaryDir.x,
        y: defenderPos.y + 1,
      });
      directions.push({
        x: defenderPos.x + primaryDir.x,
        y: defenderPos.y - 1,
      });
    } else {
      // Vertical push, add diagonals left and right
      directions.push({
        x: defenderPos.x + 1,
        y: defenderPos.y + primaryDir.y,
      });
      directions.push({
        x: defenderPos.x - 1,
        y: defenderPos.y + primaryDir.y,
      });
    }

    // Filter out invalid positions (out of bounds)
    return directions.filter(
      (pos) => pos.x >= 0 && pos.x < 26 && pos.y >= 0 && pos.y < 15
    );
  }

  /**
   * Roll armor
   */
  public static rollArmor(player: Player): ArmorResult {
    const roll =
      Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1; // 2d6
    const armor = player.stats.AV;
    const broken = roll >= armor;

    return {
      playerId: player.id,
      roll,
      armor,
      broken,
    };
  }

  /**
   * Determine if a result causes turnover
   */
  public static causesTornover(resultType: BlockResultType): boolean {
    return resultType === "skull" || resultType === "both-down";
  }

  /**
   * Determine if a result causes knockdown
   */
  public static causesKnockdown(resultType: BlockResultType): boolean {
    return resultType === "pow" || resultType === "pow-dodge";
  }

  /**
   * Determine if a result allows follow-up
   */
  public static allowsFollowUp(resultType: BlockResultType): boolean {
    return (
      resultType === "pow" ||
      resultType === "pow-dodge" ||
      resultType === "push"
    );
  }
}
