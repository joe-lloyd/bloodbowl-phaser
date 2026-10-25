/**
 * The Sevens inducement catalogue (docs/SEVENS_RULES.md L3). Some lines
 * depend on the roster: who may buy them, or what they cost, so the
 * catalogue is built per team. Nothing outside this list can be bought, so
 * there are no Star Players.
 */

import { getRosterByRosterName } from "../../data/RosterTemplates";
import { Inducement, InducementCatalogEntry } from "../../types/Inducements";
import { RosterName, Team, TeamSpecialRule } from "../../types/Team";

export function sevensInducementCatalog(
  team: Pick<Team, "rosterName">
): InducementCatalogEntry[] {
  const roster = getRosterByRosterName(team.rosterName);
  const has = (rule: TeamSpecialRule) => roster.specialRules.includes(rule);
  const line = (
    inducement: Inducement,
    maxCount: number,
    price: number
  ): InducementCatalogEntry[] => [{ inducement, maxCount, price }];

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
    ...line(
      Inducement.HALFLING_MASTER_CHEF,
      1,
      team.rosterName === RosterName.HALFLING ? 100_000 : 300_000
    ),
    ...line(Inducement.DESPERATE_MEASURES, 5, 50_000),
  ];
}
