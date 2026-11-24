import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type GameEvents, type GameEventNames } from "../../types/events";

type InflictedBy =
  GameEvents[typeof GameEventNames.PlayerCasualtyInflicted]["cause"];

export function earnsCasualtySpp(
  causer: Player | undefined,
  victim: Player,
  cause: InflictedBy
): boolean {
  if (!causer || causer.id === victim.id) return false;
  if (cause === "block") return true;
  return (
    cause === "special" &&
    causer.teamId !== victim.teamId &&
    hasSkill(causer.skills, SkillType.VIOLENT_INNOVATOR)
  );
}
