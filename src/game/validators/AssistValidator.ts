import {
  type Player,
  hasTackleZone as tackleZone,
  hasCondition,
  PlayerCondition,
} from "../../types/Player";
import { type CountAssistContext } from "../skills/SkillRule";
import { foldCountAssists } from "../skills";

type AssistAction = "block" | "foul";

export interface AssistQuestion {
  assister: Player;
  opponent: Player;
  involved: readonly string[];
  allPlayers: readonly Player[];
  action: AssistAction;
  activeTeamId: string | null;
}

function adjacent(p1: Player, p2: Player): boolean {
  if (!p1.gridPosition || !p2.gridPosition) return false;
  const dx = Math.abs(p1.gridPosition.x - p2.gridPosition.x);
  const dy = Math.abs(p1.gridPosition.y - p2.gridPosition.y);
  return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
}

export function lendsAssist(question: AssistQuestion): boolean {
  const { assister, opponent, involved, allPlayers, action, activeTeamId } =
    question;
  if (!adjacent(assister, opponent) || !tackleZone(assister)) return false;
  if (hasCondition(assister, PlayerCondition.EYE_GOUGED)) return false;

  const markers = allPlayers.filter(
    (enemy) =>
      enemy.teamId !== assister.teamId &&
      !involved.includes(enemy.id) &&
      tackleZone(enemy) &&
      adjacent(assister, enemy)
  );
  const ctx: CountAssistContext = {
    assister,
    opponent,
    action,
    activeTeamId,
    markers,
    negated: markers.length > 0,
    triggers: [],
  };
  foldCountAssists(ctx, [assister, ...markers]);
  return !ctx.negated;
}

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
    action?: AssistAction | undefined;
    activeTeamId?: string | null | undefined;
  }): Player[] {
    return allPlayers.filter(
      (teammate) =>
        teammate.teamId === subject.teamId &&
        teammate.id !== subject.id &&
        lendsAssist({
          assister: teammate,
          opponent,
          involved: [opponent.id],
          allPlayers,
          action,
          activeTeamId,
        })
    );
  }
}
