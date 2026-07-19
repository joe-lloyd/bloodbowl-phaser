import { Player, PlayerStatus } from "../../types/Player";
import { CountAssistContext } from "../skills/SkillRule";
import { foldCountAssists } from "../skills";

/**
 * Base Validator for calculate assists in Blood Bowl
 */
export abstract class AssistValidator {
  /**
   * Get list of players providing valid assists
   * @param subject The player wanting the assist (Attacker/Fouler or Defender/Target)
   * @param opponent The opponent related to the action
   * @param allPlayers All players on the pitch
   * @param action Whether the assist supports a Block or a Foul (Guard is Block-only)
   * @param activeTeamId Whose turn it is (Defensive only bites on its opponent's turn)
   */
  public getValidAssists(
    subject: Player,
    opponent: Player,
    allPlayers: Player[],
    action: "block" | "foul" = "block",
    activeTeamId: string | null = null
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

      // 3. Enemies marking this assister (the action opponent never counts).
      const markers = enemies.filter(
        (enemy) =>
          enemy.id !== opponent.id &&
          this.hasTackleZone(enemy) &&
          this.isAdjacent(teammate, enemy)
      );

      // 4. A marked assister is negated unless a skill rescues it (Guard),
      //    which another skill may in turn cancel (Defensive).
      const ctx: CountAssistContext = {
        assister: teammate,
        opponent,
        action,
        activeTeamId,
        markers,
        negated: markers.length > 0,
        triggers: [],
      };
      foldCountAssists(ctx, [teammate, ...markers]);

      if (!ctx.negated) assists.push(teammate);
    });

    return assists;
  }

  protected isAdjacent(p1: Player, p2: Player): boolean {
    if (!p1.gridPosition || !p2.gridPosition) return false;
    const dx = Math.abs(p1.gridPosition.x - p2.gridPosition.x);
    const dy = Math.abs(p1.gridPosition.y - p2.gridPosition.y);
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  }

  protected hasTackleZone(player: Player): boolean {
    return player.status === PlayerStatus.ACTIVE;
  }
}
