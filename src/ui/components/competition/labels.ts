import { COMPUTER_COACH } from "../../../competition/computerTeamTemplates";
import type {
  CompetitionEntrant,
  FixturePlay,
} from "../../../competition/types";

export const PLAYED_VIA: Record<FixturePlay, string> = {
  online: "Played online",
  local: "Played on one screen",
  computer: "Played against the computer",
  simulated: "Simulated",
  reported: "Result entered by hand",
};

export function coachLabel(entrant: CompetitionEntrant | undefined): string {
  if (!entrant) return "";
  if (entrant.computerCoached) return COMPUTER_COACH;
  return entrant.coachName ?? "";
}

export function deadlineText(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
