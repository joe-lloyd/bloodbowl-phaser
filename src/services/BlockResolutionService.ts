import { type Player } from "../types/Player";
import { type IRNGService } from "./rng/RNGService";
import { isStandableSquare } from "../game/rules/pitchSquares";

export type BlockResultType =
  | "both-down"
  | "skull"
  | "push"
  | "pow"
  | "pow-dodge";

export interface BlockResult {
  type: BlockResultType;
  icon: string;
  label: string;
}

export interface BlockRollData {
  attackerId: string;
  defenderId: string;
  numDice: number;
  isAttackerChoice: boolean;
  results: BlockResult[];
  selectedResult?: BlockResult;
  choiceStage?: "attacker-reroll" | "pick";

  teamRerollAvailable?: boolean;

  proAvailable?: boolean;

  brawlerAvailable?: boolean;

  veteranRerollAvailable?: boolean;
}

export interface ArmorResult {
  playerId: string;
  roll: number;
  armor: number;
  broken: boolean;
}

export class BlockResolutionService {
  private static readonly BLOCK_DICE_FACES: BlockResultType[] = [
    "skull",
    "both-down",
    "push",
    "push",
    "pow",
    "pow-dodge",
  ];

  private rng: IRNGService;
  constructor(rng: IRNGService) {
    this.rng = rng;
  }

  public rollBlockDice(numDice: number): BlockResult[] {
    const results: BlockResult[] = [];

    for (let i = 0; i < numDice; i++) {
      const roll = this.rng.rollDie(6);
      const type = BlockResolutionService.faceForRoll(roll);
      results.push(this.createBlockResult(type));
    }

    return results;
  }

  public static mapRollToResult(roll: number): BlockResult {
    return this.staticCreateBlockResult(this.faceForRoll(roll));
  }

  private static faceForRoll(roll: number): BlockResultType {
    const face = this.BLOCK_DICE_FACES[roll - 1];
    if (!face) throw new Error(`No block dice face for roll ${String(roll)}`);
    return face;
  }

  private createBlockResult(type: BlockResultType): BlockResult {
    return BlockResolutionService.staticCreateBlockResult(type);
  }

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

  public selectBlockResult(
    results: BlockResult[],
    isAttackerChoice: boolean
  ): BlockResult {
    const priority: BlockResultType[] = [
      "pow",
      "pow-dodge",
      "push",
      "both-down",
      "skull",
    ];

    if (isAttackerChoice) {
      for (const type of priority) {
        const result = results.find((r) => r.type === type);
        if (result) return result;
      }
    } else {
      for (let i = priority.length - 1; i >= 0; i--) {
        const result = results.find((r) => r.type === priority[i]);
        if (result) return result;
      }
    }

    const [first] = results;
    if (!first) throw new Error("No block dice results to choose from");
    return first;
  }

  public getValidPushDirections(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number }
  ): { x: number; y: number }[] {
    return this.pushCandidates(attackerPos, defenderPos).filter((pos) =>
      isStandableSquare(pos)
    );
  }

  private pushCandidates(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number }
  ): { x: number; y: number }[] {
    const dx = Math.sign(defenderPos.x - attackerPos.x);
    const dy = Math.sign(defenderPos.y - attackerPos.y);

    if (dx !== 0 && dy !== 0) {
      return [
        { x: defenderPos.x + dx, y: defenderPos.y + dy },
        { x: defenderPos.x + dx, y: defenderPos.y },
        { x: defenderPos.x, y: defenderPos.y + dy },
      ];
    }
    if (dx !== 0) {
      return [
        { x: defenderPos.x + dx, y: defenderPos.y },
        { x: defenderPos.x + dx, y: defenderPos.y + 1 },
        { x: defenderPos.x + dx, y: defenderPos.y - 1 },
      ];
    }

    return [
      { x: defenderPos.x, y: defenderPos.y + dy },
      { x: defenderPos.x + 1, y: defenderPos.y + dy },
      { x: defenderPos.x - 1, y: defenderPos.y + dy },
    ];
  }

  public getPushOptions(
    attackerPos: { x: number; y: number },
    defenderPos: { x: number; y: number },
    isOccupied: (x: number, y: number) => boolean
  ): {
    options: { x: number; y: number }[];
    tier: "open" | "chain" | "crowd";
  } {
    const raw = this.pushCandidates(attackerPos, defenderPos);
    const candidates = raw.filter((p) => isStandableSquare(p));

    const unoccupied = candidates.filter((p) => !isOccupied(p.x, p.y));
    if (unoccupied.length > 0) return { options: unoccupied, tier: "open" };

    const edges = raw.filter((p) => !isStandableSquare(p));
    if (edges.length > 0) return { options: edges, tier: "crowd" };

    return {
      options: candidates.filter((p) => isOccupied(p.x, p.y)),
      tier: "chain",
    };
  }

  public getGrabPushOptions(
    pushedPos: { x: number; y: number },
    isOccupied: (x: number, y: number) => boolean
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const pos = { x: pushedPos.x + dx, y: pushedPos.y + dy };
        if (isStandableSquare(pos) && !isOccupied(pos.x, pos.y))
          squares.push(pos);
      }
    }
    return squares;
  }

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

  public causesTornover(resultType: BlockResultType): boolean {
    return resultType === "skull" || resultType === "both-down";
  }

  public causesKnockdown(resultType: BlockResultType): boolean {
    return resultType === "pow" || resultType === "pow-dodge";
  }

  public allowsFollowUp(resultType: BlockResultType): boolean {
    return (
      resultType === "pow" ||
      resultType === "pow-dodge" ||
      resultType === "push"
    );
  }
}
