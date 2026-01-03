import { Player, PlayerStatus } from "../../types/Player";

/**
 * Base Validator for calculate assists in Blood Bowl
 */
export abstract class AssistValidator {
  /**
   * Get list of players providing valid assists
   * @param subject The player wanting the assist (Attacker/Fouler or Defender/Target)
   * @param opponent The opponent related to the action
   * @param allPlayers All players on the pitch
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
      // Note: The 'opponent' involved in the action does NOT count for marking assisters.
      const isMarked = this.isMarkedByOthers(teammate, enemies, opponent);

      if (this.canProvideAssist(teammate, isMarked)) {
        assists.push(teammate);
      }
    });

    return assists;
  }

  /**
   * Determine if a specific player can provide an assist based on marking and skills
   */
  protected abstract canProvideAssist(
    player: Player,
    isMarked: boolean
  ): boolean;

  protected isAdjacent(p1: Player, p2: Player): boolean {
    if (!p1.gridPosition || !p2.gridPosition) return false;
    const dx = Math.abs(p1.gridPosition.x - p2.gridPosition.x);
    const dy = Math.abs(p1.gridPosition.y - p2.gridPosition.y);
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  }

  protected hasTackleZone(player: Player): boolean {
    return player.status === PlayerStatus.ACTIVE;
  }

  protected isMarkedByOthers(
    player: Player,
    enemies: Player[],
    excludedEnemy: Player
  ): boolean {
    return enemies.some((enemy) => {
      if (enemy.id === excludedEnemy.id) return false;
      if (!this.hasTackleZone(enemy)) return false;
      return this.isAdjacent(player, enemy);
    });
  }
}
