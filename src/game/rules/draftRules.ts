import {
  DEFAULT_GAME_TYPE,
  GAME_TYPE_LABELS,
  type GameType,
} from "../variants/gameTypes";
import { type DraftRules, gameTypeRules } from "../variants/gameTypeRules";
import { DEDICATED_FAN_COST } from "./sevensPrices";

interface DraftedFor {
  gameType?: GameType;
}

export function teamGameType(team: DraftedFor): GameType {
  return team.gameType ?? DEFAULT_GAME_TYPE;
}

export function draftRulesFor(gameType: GameType): DraftRules {
  return gameTypeRules(gameType).draft;
}

export function teamDraftRules(team: DraftedFor): DraftRules {
  return draftRulesFor(teamGameType(team));
}

export function teamGameTypeLabel(team: DraftedFor): string {
  return GAME_TYPE_LABELS[teamGameType(team)];
}

export function rerollPrice(draft: DraftRules): number {
  return draft.rerollCost;
}

export function dedicatedFanPrice(draft: DraftRules): number {
  return DEDICATED_FAN_COST * draft.dedicatedFanCostMultiplier;
}

export type SidelineStaff = "apothecary" | "coach" | "cheerleader";

const STAFF_NAMES: Record<SidelineStaff, string> = {
  apothecary: "an Apothecary",
  coach: "Assistant Coaches",
  cheerleader: "Cheerleaders",
};

function staffAllowed(draft: DraftRules, staff: SidelineStaff): boolean {
  switch (staff) {
    case "apothecary":
      return draft.apothecary;
    case "coach":
      return draft.assistantCoaches;
    case "cheerleader":
      return draft.cheerleaders;
  }
}

export function draftStaffRefusal(
  label: string,
  draft: DraftRules,
  staff: SidelineStaff
): string | undefined {
  return staffAllowed(draft, staff)
    ? undefined
    : `${label} teams cannot have ${STAFF_NAMES[staff]}.`;
}

export function staffRefusal(
  gameType: GameType,
  staff: SidelineStaff
): string | undefined {
  return draftStaffRefusal(
    GAME_TYPE_LABELS[gameType],
    draftRulesFor(gameType),
    staff
  );
}
