import { Player } from "../types";
import { IRNGService } from "./rng/RNGService";
import { GameConfig } from "../config/GameConfig";

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
  /** A Team Re-roll may re-roll ALL the block dice (attacker's own turn). */
  teamRerollAvailable?: boolean;
  /** Pro may re-roll ONE block die (attacker has Pro, unused, activating). */
  proAvailable?: boolean;
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

  constructor(private rng: IRNGService) {}

  /**
   * Roll block dice
   */
  public rollBlockDice(numDice: number): BlockResult[] {
    const results: BlockResult[] = [];

    for (let i = 0; i < numDice; i++) {
      const roll = this.rng.rollDie(6);
      const type = BlockResolutionService.BLOCK_DICE_FACES[roll - 1]; // roll is 1-indexed from RNG
      results.push(this.createBlockResult(type));
    }

    return results;
  }

  /**
   * Map a 1-6 D6 roll to a block result (static helper for DiceService)
   */
  public static mapRollToResult(roll: number): BlockResult {
    const type = this.BLOCK_DICE_FACES[roll - 1];
    return this.staticCreateBlockResult(type);
  }

  /**
   * Create a block result object
   */
  private createBlockResult(type: BlockResultType): BlockResult {
    return BlockResolutionService.staticCreateBlockResult(type);
  }

  /**
   * Static version of createBlockResult for use in mapRollToResult
   */
  private static staticCreateBlockResult(type: BlockResultType): BlockResult {
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
  public selectBlockResult(
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
   * Get valid push directions (3 squares behind defender, on-pitch only)
   */
  public getValidPushDirections(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number }
  ): { x: number; y: number }[] {
    return this.pushCandidates(attackerPos, defenderPos).filter((pos) =>
      this.isOnPitch(pos)
    );
  }

  /**
   * The 3 push squares behind the defender relative to the attacker:
   * straight back plus the two adjacent squares. May include off-pitch
   * coordinates (crowd exits).
   */
  private pushCandidates(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number }
  ): { x: number; y: number }[] {
    const dx = Math.sign(defenderPos.x - attackerPos.x);
    const dy = Math.sign(defenderPos.y - attackerPos.y);

    if (dx !== 0 && dy !== 0) {
      // Diagonal push: straight back plus the two adjacent orthogonals
      return [
        { x: defenderPos.x + dx, y: defenderPos.y + dy },
        { x: defenderPos.x + dx, y: defenderPos.y },
        { x: defenderPos.x, y: defenderPos.y + dy },
      ];
    }
    if (dx !== 0) {
      // Horizontal push: straight back plus diagonals up and down
      return [
        { x: defenderPos.x + dx, y: defenderPos.y },
        { x: defenderPos.x + dx, y: defenderPos.y + 1 },
        { x: defenderPos.x + dx, y: defenderPos.y - 1 },
      ];
    }
    // Vertical push: straight back plus diagonals left and right
    return [
      { x: defenderPos.x, y: defenderPos.y + dy },
      { x: defenderPos.x + 1, y: defenderPos.y + dy },
      { x: defenderPos.x - 1, y: defenderPos.y + dy },
    ];
  }

  private isOnPitch(pos: { x: number; y: number }): boolean {
    return (
      pos.x >= 0 &&
      pos.x < GameConfig.PITCH_WIDTH &&
      pos.y >= 0 &&
      pos.y < GameConfig.PITCH_HEIGHT
    );
  }

  /**
   * Tiered push options per the rulebook (p.55): unoccupied squares when any
   * exist; occupied squares only when forced (chain push); the crowd only
   * when no on-pitch square exists at all (off-pitch coordinates returned so
   * the {x,y} decision shape survives).
   */
  public getPushOptions(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number },
    isOccupied: (x: number, y: number) => boolean
  ): {
    options: { x: number; y: number }[];
    tier: "open" | "chain" | "crowd";
  } {
    const raw = this.pushCandidates(attackerPos, defenderPos);
    const candidates = raw.filter((p) => this.isOnPitch(p));

    const unoccupied = candidates.filter((p) => !isOccupied(p.x, p.y));
    if (unoccupied.length > 0) return { options: unoccupied, tier: "open" };

    // No unoccupied square: at a sideline/end zone the crowd takes the
    // player (p.55 — crowd precedes chaining when off-pitch exits exist)
    const offPitch = raw.filter((p) => !this.isOnPitch(p));
    if (offPitch.length > 0) return { options: offPitch, tier: "crowd" };

    // Fully boxed in on-pitch: chain push into an occupied square
    return {
      options: candidates.filter((p) => isOccupied(p.x, p.y)),
      tier: "chain",
    };
  }

  /**
   * Grab push options (rulebook p.135): any on-pitch unoccupied square
   * adjacent to the pushed player, not just the three behind them. Empty when
   * the target is fully boxed in — the skill then cannot be used.
   */
  public getGrabPushOptions(
    pushedPos: { x: number; y: number },
    isOccupied: (x: number, y: number) => boolean
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const pos = { x: pushedPos.x + dx, y: pushedPos.y + dy };
        if (this.isOnPitch(pos) && !isOccupied(pos.x, pos.y)) squares.push(pos);
      }
    }
    return squares;
  }

  /**
   * Roll armor
   */
  public rollArmor(player: Player): ArmorResult {
    const d1 = this.rng.rollDie(6);
    const d2 = this.rng.rollDie(6);
    const roll = d1 + d2;
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
  public causesTornover(resultType: BlockResultType): boolean {
    return resultType === "skull" || resultType === "both-down";
  }

  /**
   * Determine if a result causes knockdown
   */
  public causesKnockdown(resultType: BlockResultType): boolean {
    return resultType === "pow" || resultType === "pow-dodge";
  }

  /**
   * Determine if a result allows follow-up
   */
  public allowsFollowUp(resultType: BlockResultType): boolean {
    return (
      resultType === "pow" ||
      resultType === "pow-dodge" ||
      resultType === "push"
    );
  }
}
