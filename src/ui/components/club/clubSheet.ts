import type { PlayerTemplate } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import {
  chooseGutterSitsOut,
  hireGutterSpecialist,
} from "../../../game/rules/club";
import { giveIdentity } from "../../../game/names/playerIdentity";

interface ClubSheetHandlers {
  onHireSpecialist?: (template: PlayerTemplate) => void;
  onChooseSitsOut?: (playerId: string) => void;
}

export function clubSheetHandlers(
  team: Team,
  update: (team: Team) => void
): ClubSheetHandlers {
  if (!team.club) return {};
  return {
    onHireSpecialist: (template) => {
      const result = hireGutterSpecialist(team, template);
      if (!result.hired) {
        alert(result.reason);
        return;
      }
      giveIdentity(team, result.player);
      update({ ...team });
    },
    onChooseSitsOut: (playerId) => {
      const decision = chooseGutterSitsOut(team, playerId);
      if (!decision.allowed) {
        alert(decision.reason);
        return;
      }
      update({ ...team });
    },
  };
}
