import { Player } from "../../types/Player";
import { hasSkill, SkillType } from "../../types/Skills";
import { BlockAnalysis } from "../../types/Actions";

export class BlockValidator {
  /**
   * Analyze a block to determine dice and assists
   */
  public analyzeBlock(
    attacker: Player,
    defender: Player,
    allPlayers: Player[] // Needed to check for tackle zones / assists
  ): BlockAnalysis {
    // 1. Calculate Assists
    const attackerAssists = this.getValidAssists(
      attacker,
      defender,
      allPlayers
    );
    const defenderAssists = this.getValidAssists(
      defender,
      attacker,
      allPlayers
    );

    // 2. Calculate Final Strength
    const finalAttackerST = attacker.stats.ST + attackerAssists.length;
    const finalDefenderST = defender.stats.ST + defenderAssists.length;

    // 3. Determine Dice
    let diceCount = 1;
    let isUphill = false;

    if (finalAttackerST === finalDefenderST) {
      diceCount = 1;
      isUphill = false; // Attacker 'chooses' (applies) the 1 die
    } else if (finalAttackerST > finalDefenderST) {
      // Attacker is stronger
      if (finalAttackerST > finalDefenderST * 2) {
        diceCount = 3;
      } else {
        diceCount = 2;
      }
      isUphill = false;
    } else {
      // Defender is stronger (Uphill)
      isUphill = true;
      if (finalDefenderST > finalAttackerST * 2) {
        diceCount = 3;
      } else {
        diceCount = 2;
      }
    }

    return {
      diceCount,
      isUphill,
      attackerST: finalAttackerST,
      defenderST: finalDefenderST,
      attackerAssists,
      defenderAssists,
    };
  }

  /**
   * Get list of players providing valid assists
   * @param subject The player wanting the assist (Attacker or Defender)
   * @param opponent The opponent being blocked (or doing the blocking)
   * @param allPlayers All players on the pitch
   * @param forAttacker True if calculating assists for the Attacker
   */
  public getValidAssists(
    subject: Player,
    opponent: Player,
    allPlayers: Player[]
  ): Player[] {
    const assists: Player[] = [];

    // Potential assists are teammates of the SUBJECT
    const teammates = allPlayers.filter(
      (p) => p.teamId === subject.teamId && p.id !== subject.id
    );
    const enemies = allPlayers.filter((p) => p.teamId !== subject.teamId);

    teammates.forEach((teammate) => {
      // 1. Must be adjacent to the OPPONENT
      if (!this.isAdjacent(teammate, opponent)) return;

      // 2. Must not be Prone, Stunned, etc. (Must have tackle zone)
      if (!this.hasTackleZone(teammate)) return;

      // 3. Must not be in an enemy Tackle Zone (Marked)
      // Exception: GUARD skill ignores this.
      // Note: The 'opponent' involved in the block does NOT count for marking assisters.
      const isMarked = this.isMarkedByOthers(teammate, enemies, opponent);

      if (isMarked && !hasSkill(teammate.skills, SkillType.GUARD)) {
        return; // Marked and no Guard -> No assist
      }

      assists.push(teammate);
    });

    return assists;
  }

  private isAdjacent(p1: Player, p2: Player): boolean {
    if (!p1.gridPosition || !p2.gridPosition) return false;
    const dx = Math.abs(p1.gridPosition.x - p2.gridPosition.x);
    const dy = Math.abs(p1.gridPosition.y - p2.gridPosition.y);
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  }

  private hasTackleZone(player: Player): boolean {
    // Active players (Standing) have TZ.
    // Prone/Stunned do not.
    // Bone Head / Really Stupid might lose TZ (TODO)
    return player.status === "Active" || player.status === "Reserve"; // Reserve shouldn't be on pitch but 'Active' is default standing
  }

  private isMarkedByOthers(
    player: Player,
    enemies: Player[],
    excludedEnemy: Player
  ): boolean {
    // Check if adjacent to any enemy that has a TZ, excluding the specific excludedEnemy
    return enemies.some((enemy) => {
      if (enemy.id === excludedEnemy.id) return false;
      if (!this.hasTackleZone(enemy)) return false;
      return this.isAdjacent(player, enemy);
    });
  }
}
