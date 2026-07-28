/**
 * Development seed team fixtures: every supported roster gets one legal team
 * built through the same purchasing and pricing helpers the team builder
 * uses (createTeam / createPlayer / addPlayerToTeam / purchaseReroll /
 * purchaseApothecary / calculateTeamValue), then checked by the shared
 * roster-legality validator.
 *
 * Finances are derived, never assigned: each team starts from the 600k
 * draft budget, purchases are debited by the shared helpers, and the stored
 * treasury is whatever remains unspent. Team value is recalculated from the
 * completed roster.
 *
 * Any illegality throws a SeedFixtureError naming the fixture key and every
 * violated rule — fix the fixture data, never the validator.
 */

import {
  RosterName,
  Team,
  TeamAdvancementMode,
  TeamColors,
  TeamRoster,
  addPlayerToTeam,
  calculateTeamValue,
  createTeam,
  lockAdvancementMode,
  purchaseApothecary,
  purchaseReroll,
} from "../types/Team";
import { PlayerTemplate, createPlayer } from "../types/Player";
import { SkillType, hasSkill } from "../types/Skills";
import {
  RosterViolation,
  isLinemanPosition,
  validateRosterLegality,
} from "../game/rules/rosterLegality";
import { validateInsignificant } from "../game/rules/insignificant";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { rosterSlug, seedMetadata, seedTeamId } from "./seedMeta";

export const DRAFT_BUDGET = 600_000;
const TARGET_SQUAD_SIZE = 8;
const DESIRED_REROLLS = 2;

/** A fixture (or builder) is illegal: name it and every violated rule. */
export class SeedFixtureError extends Error {
  constructor(
    public readonly fixtureKey: string,
    public readonly violations: RosterViolation[]
  ) {
    super(
      `[${fixtureKey}] illegal seed fixture: ` +
        violations.map((v) => `${v.rule}: ${v.detail}`).join("; ")
    );
    this.name = "SeedFixtureError";
  }
}

/** Deterministic team colors (moved from the old TeamManager seeder). */
export const SEED_TEAM_COLORS: Record<string, TeamColors> = {
  [RosterName.AMAZON]: { primary: 0x228b22, secondary: 0xffd700 },
  [RosterName.BLACK_ORC]: { primary: 0x2f4f4f, secondary: 0xff0000 },
  [RosterName.BRETONIAN]: { primary: 0x4169e1, secondary: 0xffd700 },
  [RosterName.CHAOS_CHOSEN]: { primary: 0x8b0000, secondary: 0x000000 },
  [RosterName.CHAOS_DWARF]: { primary: 0x8b4513, secondary: 0xff4500 },
  [RosterName.CHAOS_RENEGADE]: { primary: 0x483d8b, secondary: 0x9370db },
  [RosterName.DARK_ELF]: { primary: 0x4b0082, secondary: 0xc0c0c0 },
  [RosterName.DWARF]: { primary: 0xb8860b, secondary: 0x000000 },
  [RosterName.ELVEN_UNION]: { primary: 0x00ced1, secondary: 0xffffff },
  [RosterName.GNOME]: { primary: 0xff69b4, secondary: 0x32cd32 },
  [RosterName.GOBLIN]: { primary: 0x32cd32, secondary: 0xffff00 },
  [RosterName.HALFLING]: { primary: 0x8b4513, secondary: 0xffd700 },
  [RosterName.HIGH_ELF]: { primary: 0xffffff, secondary: 0x4169e1 },
  [RosterName.HUMAN]: { primary: 0x0000ff, secondary: 0xffffff },
  [RosterName.IMPERIAL_NOBILITY]: { primary: 0x800020, secondary: 0xffd700 },
  [RosterName.KHORNE]: { primary: 0x8b0000, secondary: 0xff0000 },
  [RosterName.LIZARDMEN]: { primary: 0x228b22, secondary: 0xffd700 },
  [RosterName.NECROMANTIC_HORROR]: { primary: 0x2f4f4f, secondary: 0x00ff00 },
  [RosterName.NORSE]: { primary: 0x4682b4, secondary: 0xffffff },
  [RosterName.NURGLE]: { primary: 0x556b2f, secondary: 0x9acd32 },
  [RosterName.OGRE]: { primary: 0xa0522d, secondary: 0xffffff },
  [RosterName.OLD_WORLD_ALLIANCE]: { primary: 0x4169e1, secondary: 0xffd700 },
  [RosterName.ORC]: { primary: 0x006400, secondary: 0x000000 },
  [RosterName.SHAMBLING_UNDEAD]: { primary: 0x2f4f4f, secondary: 0x8b0000 },
  [RosterName.SKAVEN]: { primary: 0x8b4513, secondary: 0x000000 },
  [RosterName.SNOTLING]: { primary: 0x32cd32, secondary: 0xff0000 },
  [RosterName.TOMB_KINGS]: { primary: 0xdaa520, secondary: 0x4169e1 },
  [RosterName.UNDERWORLD_DENIZENS]: {
    primary: 0x2f4f4f,
    secondary: 0x9370db,
  },
  [RosterName.VAMPIRE]: { primary: 0x8b0000, secondary: 0x000000 },
  [RosterName.WOOD_ELF]: { primary: 0x228b22, secondary: 0x8b4513 },
};

interface SquadPlan {
  picks: PlayerTemplate[];
  rerolls: number;
  apothecary: boolean;
}

/** Rosters `playerLifecycle.ts` decorates with real earned/spendable SPP and
 *  stored advancements. Advanced League is the only mode that legitimately
 *  earns SPP (team-advancement-modes: "Advanced League alone uses standard
 *  SPP progression"), so these are pinned rather than left to the cycle. */
const PROGRESSED_ADVANCED_LEAGUE_ROSTERS = new Set<RosterName>([
  RosterName.HUMAN,
  RosterName.ORC,
  RosterName.DWARF,
  RosterName.SKAVEN,
]);

/** Every other roster round-robins through all three modes (by declaration
 *  order in RosterName) so the seed catalog exercises each mode's UI and
 *  rules from a clean refresh. */
const ADVANCEMENT_MODE_CYCLE: readonly TeamAdvancementMode[] = [
  "matched-play",
  "advanced-league",
  "sevens-skill-selection",
];

/** Deterministic advancement mode for a seeded roster (see the module
 *  doc-comment and development-seed-data: "Seed teams carry an explicit,
 *  locked advancement mode"). */
export function seedAdvancementMode(rosterName: RosterName): TeamAdvancementMode {
  if (PROGRESSED_ADVANCED_LEAGUE_ROSTERS.has(rosterName)) {
    return "advanced-league";
  }
  const index = Object.values(RosterName).indexOf(rosterName);
  return ADVANCEMENT_MODE_CYCLE[index % ADVANCEMENT_MODE_CYCLE.length];
}

function isInsignificantTemplate(template: PlayerTemplate): boolean {
  return hasSkill(template.skills, SkillType.INSIGNIFICANT);
}

/**
 * Choose a legal squad for a roster: up to 4 non-Lineman positional players
 * (max 2 per position, respecting template limits), filled out with the
 * cheapest Linemen, then trimmed to the budget (players first, then
 * re-rolls, then the apothecary).
 */
function planSquad(roster: TeamRoster, fixtureKey: string): SquadPlan {
  const templates = roster.playerTemplates;
  const linemen = templates
    .filter((t) => isLinemanPosition(t.keywords))
    .sort((a, b) => a.cost - b.cost);
  const positionals = templates.filter((t) => !isLinemanPosition(t.keywords));

  const picks: PlayerTemplate[] = [];
  const counts = new Map<string, number>();
  const countOf = (t: PlayerTemplate) => counts.get(t.positionName) ?? 0;
  const canTake = (t: PlayerTemplate) =>
    t.maxAllowed === undefined || countOf(t) < t.maxAllowed;
  const take = (t: PlayerTemplate) => {
    picks.push(t);
    counts.set(t.positionName, countOf(t) + 1);
  };

  // 1. Positional stars first: at most 4 non-Linemen, at most 2 of a kind.
  let nonLinemanCap = 4;
  for (const template of positionals) {
    while (nonLinemanCap > 0 && canTake(template) && countOf(template) < 2) {
      take(template);
      nonLinemanCap--;
    }
  }

  // 2. Fill the squad with the cheapest available Linemen, keeping the
  // Insignificant whole-list limit (never more Insignificant than not).
  while (picks.length < TARGET_SQUAD_SIZE) {
    const insignificant = picks.filter(isInsignificantTemplate).length;
    const significant = picks.length - insignificant;
    const next =
      insignificant < significant
        ? linemen.find(canTake)
        : linemen.find((t) => canTake(t) && !isInsignificantTemplate(t));
    if (!next) break;
    take(next);
  }

  if (picks.length < 7) {
    throw new SeedFixtureError(fixtureKey, [
      {
        rule: "roster-size",
        detail: `only ${picks.length} legal players available (need 7)`,
      },
    ]);
  }

  // 3. Trim to the draft budget: most expensive first, but never in a way
  // that breaks the Insignificant whole-list limit.
  let rerolls = DESIRED_REROLLS;
  let apothecary = roster.apothecary;
  const totalCost = () =>
    picks.reduce((sum, t) => sum + t.cost, 0) +
    rerolls * roster.rerollCost +
    (apothecary ? 50_000 : 0);

  const insignificantOk = (squad: PlayerTemplate[]) => {
    const insignificant = squad.filter(isInsignificantTemplate).length;
    return insignificant <= squad.length - insignificant;
  };

  while (totalCost() > DRAFT_BUDGET) {
    if (picks.length > 7) {
      const byCostDesc = [...picks].sort((a, b) => b.cost - a.cost);
      const removed = byCostDesc.find((candidate) =>
        insignificantOk(picks.filter((t) => t !== candidate))
      );
      if (!removed) {
        throw new SeedFixtureError(fixtureKey, [
          { rule: "insignificant", detail: "cannot trim squad within budget" },
        ]);
      }
      picks.splice(picks.indexOf(removed), 1);
      counts.set(removed.positionName, countOf(removed) - 1);
    } else if (rerolls > 0) {
      rerolls--;
    } else if (apothecary) {
      apothecary = false;
    } else {
      throw new SeedFixtureError(fixtureKey, [
        {
          rule: "budget",
          detail: `cheapest legal squad costs ${totalCost()} (budget ${DRAFT_BUDGET})`,
        },
      ]);
    }
  }

  return { picks, rerolls, apothecary };
}

/** The stable fixture key for a roster's seed team ("human", "orc", …). */
export function teamFixtureKey(rosterName: RosterName): string {
  return rosterSlug(rosterName);
}

/**
 * Build the seed team for one roster: legal squad, derived finances,
 * legality-validated. Deterministic ids and colors.
 */
export function buildSeedTeam(rosterName: RosterName): Team {
  const fixtureKey = teamFixtureKey(rosterName);
  const roster = getRosterByRosterName(rosterName);
  const plan = planSquad(roster, fixtureKey);

  const team = createTeam(
    `${rosterName} Founders`,
    rosterName,
    SEED_TEAM_COLORS[rosterName] ?? { primary: 0x0000ff, secondary: 0xffffff },
    roster.rerollCost,
    DRAFT_BUDGET,
    seedAdvancementMode(rosterName)
  );
  team.id = seedTeamId(fixtureKey);
  team.seedMetadata = seedMetadata(fixtureKey);
  lockAdvancementMode(team);

  plan.picks.forEach((template, index) => {
    const player = createPlayer(template, team.id, index + 1);
    if (!addPlayerToTeam(team, player)) {
      throw new SeedFixtureError(fixtureKey, [
        {
          rule: "budget",
          detail: `cannot afford ${template.positionName} (${template.cost})`,
        },
      ]);
    }
  });
  for (let i = 0; i < plan.rerolls; i++) purchaseReroll(team);
  if (plan.apothecary) purchaseApothecary(team);

  team.teamValue = calculateTeamValue(team);

  const violations = validateRosterLegality(team, roster);
  const insignificantError = validateInsignificant(team.players);
  if (insignificantError) {
    violations.push({ rule: "insignificant", detail: insignificantError });
  }
  if (violations.length > 0) {
    throw new SeedFixtureError(fixtureKey, violations);
  }
  return team;
}

/** One legal seed team per supported roster. */
export function buildAllSeedTeams(): Team[] {
  return Object.values(RosterName).map((rosterName) =>
    buildSeedTeam(rosterName)
  );
}
