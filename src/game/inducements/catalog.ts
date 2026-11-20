import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  Inducement,
  type InducementCatalogEntry,
} from "../../types/Inducements";
import { RosterName, TeamSpecialRule } from "../../types/Team";
import {
  type TeamAllegiance,
  hasTeamSpecialRule,
} from "../rules/teamAllegiance";
import { type GameType } from "../variants/gameTypes";

export const NO_PURCHASE_LIMIT = 99;

const line = (
  inducement: Inducement,
  maxCount: number,
  price: number
): InducementCatalogEntry[] => [{ inducement, maxCount, price }];

const masterChef = (team: TeamAllegiance): InducementCatalogEntry[] =>
  line(
    Inducement.HALFLING_MASTER_CHEF,
    1,
    team.rosterName === RosterName.HALFLING ? 100_000 : 300_000
  );

export function sevensInducementCatalog(
  team: TeamAllegiance
): InducementCatalogEntry[] {
  const roster = getRosterByRosterName(team.rosterName);

  const has = (rule: TeamSpecialRule) => hasTeamSpecialRule(team, rule);

  return [
    ...line(Inducement.TEMP_AGENCY_CHEERLEADER, 2, 15_000),
    ...line(Inducement.PART_TIME_ASSISTANT_COACH, 2, 15_000),
    ...line(Inducement.BLITZERS_BEST_KEGS, 2, 50_000),
    ...line(Inducement.PRAYERS_TO_NUFFLE, 2, 5_000),
    ...line(Inducement.EXTRA_TEAM_TRAINING, 6, 125_000),
    ...line(
      Inducement.BRIBE,
      2,
      has(TeamSpecialRule.BRIBERY_AND_CORRUPTION) ? 50_000 : 100_000
    ),
    ...(roster.apothecary
      ? line(Inducement.WANDERING_APOTHECARY, 1, 100_000)
      : []),
    ...(has(TeamSpecialRule.MASTERS_OF_UNDEATH)
      ? line(Inducement.MORTUARY_ASSISTANT, 1, 100_000)
      : []),
    ...(has(TeamSpecialRule.FAVOURED_OF_NURGLE)
      ? line(Inducement.PLAGUE_DOCTOR, 1, 100_000)
      : []),
    ...masterChef(team),
    ...line(Inducement.DESPERATE_MEASURES, 5, 50_000),
  ];
}

export function inducementCatalog(
  team: TeamAllegiance,
  gameType: GameType
): InducementCatalogEntry[] {
  switch (gameType) {
    case "sevens":
      return sevensInducementCatalog(team);
    case "street-bowl":
      return [
        ...line(Inducement.MAGIC_POTION, NO_PURCHASE_LIMIT, 50_000),
        ...masterChef(team),
      ];
    case "beach-bowl":
      return [
        ...line(Inducement.BLITZERS_BEST_KEGS, 2, 50_000),
        ...masterChef(team),
        ...line(Inducement.SOUVENIR, NO_PURCHASE_LIMIT, 50_000),
      ];
    case "gutter-bowl":
      return [
        ...line(Inducement.LESSER_MAGIC_POTION, NO_PURCHASE_LIMIT, 50_000),
        ...line(Inducement.SUPERIOR_MAGIC_POTION, NO_PURCHASE_LIMIT, 100_000),
        ...line(Inducement.SAWBONES, 1, 50_000),
        ...line(Inducement.SNACK_STAND, 1, 100_000),
        ...line(Inducement.NOVICE_WIZARD, 1, 100_000),
      ];
  }
}

export function startingFreeInducements(gameType: GameType): Inducement[] {
  return gameType === "street-bowl" ? [Inducement.MAGIC_POTION] : [];
}
