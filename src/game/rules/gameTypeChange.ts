import { DEFAULT_GAME_TYPE, type GameType } from "../variants/gameTypes";
import { type Team, startingDedicatedFans } from "../../types/Team";
import { dedicatedFanPrice, draftRulesFor, teamDraftRules } from "./draftRules";
import { type StaffItem, purchase, teamRerollPrice } from "./teamPricing";
import { chooseFirstLinemanAsVeteran } from "./veteran";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
} from "./sevensPrices";

type Restaff = [Exclude<StaffItem, { type: "inducement" }>["type"], number];

function boughtFans(team: Team): number {
  return team.dedicatedFans - startingDedicatedFans(team.advancementMode);
}

function staffSpend(team: Team): number {
  return (
    team.rerolls * teamRerollPrice(team) +
    boughtFans(team) * dedicatedFanPrice(teamDraftRules(team)) +
    (team.apothecary ? APOTHECARY_COST : 0) +
    team.coaches * ASSISTANT_COACH_COST +
    team.cheerleaders * CHEERLEADER_COST
  );
}

function stripStaff(team: Team): Restaff[] {
  const staff: Restaff[] = [
    ["reroll", team.rerolls],
    ["dedicated-fan", boughtFans(team)],
    ["apothecary", team.apothecary ? 1 : 0],
    ["coach", team.coaches],
    ["cheerleader", team.cheerleaders],
  ];
  team.treasury += staffSpend(team);
  team.rerolls = 0;
  team.dedicatedFans = startingDedicatedFans(team.advancementMode);
  team.apothecary = false;
  team.coaches = 0;
  team.cheerleaders = 0;
  return staff;
}

function moveBudget(team: Team, from: GameType, to: GameType): void {
  const before = draftRulesFor(from).budget;
  const after = draftRulesFor(to).budget;
  if (team.startingTreasury !== before) return;
  team.startingTreasury = after;
  team.treasury += after - before;
}

export function withDraftGameType(source: Team, gameType: GameType): Team {
  const team = structuredClone(source);
  const staff = stripStaff(team);
  moveBudget(team, team.gameType ?? DEFAULT_GAME_TYPE, gameType);
  if (gameType === DEFAULT_GAME_TYPE) delete team.gameType;
  else team.gameType = gameType;
  for (const [type, count] of staff) {
    for (let i = 0; i < count; i++) purchase(team, { type });
  }
  chooseFirstLinemanAsVeteran(team);
  return team;
}
