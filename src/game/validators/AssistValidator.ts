import {
  type Player,
  hasTackleZone as tackleZone,
  hasCondition,
  PlayerCondition,
} from "../../types/Player";
import { type CountAssistContext } from "../skills/SkillRule";
import { foldCountAssists } from "../skills";

export abstract class AssistValidator {
  public getValidAssists({
    subject,
    opponent,
    allPlayers,
    action = "block",
    activeTeamId = null,
  }: {
    subject: Player;
    opponent: Player;
    allPlayers: Player[];
    action?: "block" | "foul" | undefined;
    activeTeamId?: string | null | undefined;
  }): Player[] {
    const assists: Player[] = [];

    const teammates = allPlayers.filter(
      (p) => p.teamId === subject.teamId && p.id !== subject.id
    );
    const enemies = allPlayers.filter((p) => p.teamId !== subject.teamId);

    for (const teammate of teammates) {
      if (!this.isAdjacent(teammate, opponent)) continue;

      if (!this.hasTackleZone(teammate)) continue;

      if (hasCondition(teammate, PlayerCondition.EYE_GOUGED)) continue;

      const markers = enemies.filter(
        (enemy) =>
          enemy.id !== opponent.id &&
          this.hasTackleZone(enemy) &&
          this.isAdjacent(teammate, enemy)
      );

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
    }

    return assists;
  }

  protected isAdjacent(p1: Player, p2: Player): boolean {
    if (!p1.gridPosition || !p2.gridPosition) return false;
    const dx = Math.abs(p1.gridPosition.x - p2.gridPosition.x);
    const dy = Math.abs(p1.gridPosition.y - p2.gridPosition.y);
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  }

  protected hasTackleZone(player: Player): boolean {
    return tackleZone(player);
  }
}
