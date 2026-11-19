import { type Player, hasTackleZone } from "../../types/Player";

const chebyshev = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function isLegalHandoffTarget(hander: Player, mate: Player): boolean {
  return handoffTargetRefusalReason(hander, mate) === null;
}

export function handoffTargetRefusalReason(
  hander: Player,
  mate: Player
): string | null {
  if (mate.id === hander.id) return "cannot hand off to yourself";
  if (mate.teamId !== hander.teamId) return "not a team-mate";
  if (!hander.gridPosition || !mate.gridPosition) return "not adjacent";
  if (chebyshev(hander.gridPosition, mate.gridPosition) !== 1) {
    return "not adjacent";
  }
  if (!hasTackleZone(mate)) {
    return "has lost their Tackle Zone";
  }
  return null;
}

export function legalHandoffTargets(
  hander: Player,
  teammates: Player[]
): Player[] {
  return teammates.filter((mate) => isLegalHandoffTarget(hander, mate));
}
