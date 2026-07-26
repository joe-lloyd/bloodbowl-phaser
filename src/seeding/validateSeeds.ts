/**
 * Post-build invariant validator for development seed data. Fails loudly
 * (SeedValidationError) with entity-specific reasons whenever a generated
 * record breaks the rules — roster legality, finances, history totals,
 * competition lifecycle, or the one-active-competition membership rule.
 *
 * Player checks cover advancement legality and roster skill access (the
 * primary/secondary categories on the player). Advancement-MODE validation
 * is pending the add-team-advancement-modes change and will extend
 * validatePlayerProgression once teams carry a mode.
 */

import { Team, calculateTeamValue } from "../types/Team";
import { InjuryType, Player, PlayerStats } from "../types/Player";
import { SKILL_DEFINITIONS, SkillType } from "../types/Skills";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import { validateInsignificant } from "../game/rules/insignificant";
import {
  CHARACTERISTIC_MAXIMUMS,
  advancementCount,
} from "../game/progression/progression";
import {
  CompetitionDoc,
  Standing,
} from "../competition/types";
import { computeStandings } from "../competition/logic";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { isSeedOwned } from "./seedMeta";

export interface SeedViolation {
  /** Invariant area: "roster" | "finances" | "progression" | "competition" | "membership". */
  area: string;
  /** The fixture key, team id, player id, or competition id at fault. */
  subject: string;
  detail: string;
}

export class SeedValidationError extends Error {
  constructor(public readonly violations: SeedViolation[]) {
    super(
      `development seed data is invalid (${violations.length}):\n` +
        violations
          .map((v) => `  [${v.area}] ${v.subject}: ${v.detail}`)
          .join("\n")
    );
    this.name = "SeedValidationError";
  }
}

const SPP_PER_STAT = {
  completions: 1,
  interceptions: 2,
  casualties: 2,
  touchdowns: 3,
  mvps: 4,
} as const;

const STAT_DECREASE_INJURIES: Partial<Record<InjuryType, keyof PlayerStats>> = {
  [InjuryType.STAT_DECREASE_MA]: "MA",
  [InjuryType.STAT_DECREASE_ST]: "ST",
  [InjuryType.STAT_DECREASE_AG]: "AG",
  [InjuryType.STAT_DECREASE_AV]: "AV",
};

/** Improved by characteristic advances (AG/PA invert: lower is better). */
function improvementDirection(stat: keyof PlayerStats): 1 | -1 {
  return stat === "AG" || stat === "PA" ? -1 : 1;
}

function validateTeamFinances(team: Team): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const spent =
    team.players.reduce((sum, player) => sum + player.cost, 0) +
    team.rerolls * team.rerollCost +
    (team.apothecary ? 50_000 : 0) +
    (team.coaches + team.cheerleaders + team.dedicatedFans) * 10_000;

  if (team.treasury !== team.startingTreasury - spent) {
    violations.push({
      area: "finances",
      subject: team.id,
      detail:
        `treasury ${team.treasury} !== budget ${team.startingTreasury} ` +
        `- purchases ${spent}`,
    });
  }
  const expectedValue = calculateTeamValue(team);
  if (team.teamValue !== expectedValue) {
    violations.push({
      area: "finances",
      subject: team.id,
      detail: `team value ${team.teamValue} !== derived ${expectedValue}`,
    });
  }
  return violations;
}

function validatePlayerProgression(player: Player): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const subject = `${player.teamId}/${player.id}`;
  const advancements = player.advancements ?? [];

  if (advancementCount(player) > 6 || player.level !== Math.min(6, advancements.length)) {
    violations.push({
      area: "progression",
      subject,
      detail: `level ${player.level} inconsistent with ${advancements.length} advancements (cap 6)`,
    });
  }

  // Skill access: primary-skill advancements must come from primary
  // categories, secondary-skill from secondary (roster access on the player).
  for (const advancement of advancements) {
    if (advancement.type === "characteristic") continue;
    const category = SKILL_DEFINITIONS[advancement.name as SkillType]?.category;
    const access =
      advancement.type === "primary-skill" ? player.primary : player.secondary;
    if (!category || !access?.includes(category)) {
      violations.push({
        area: "progression",
        subject,
        detail: `advancement "${advancement.name}" (${category ?? "unknown"}) not in ${advancement.type} access`,
      });
    }
  }

  // No duplicate skills.
  const seen = new Set<string>();
  for (const skill of player.skills) {
    if (seen.has(skill.type)) {
      violations.push({
        area: "progression",
        subject,
        detail: `duplicate skill ${skill.type}`,
      });
    }
    seen.add(skill.type);
  }

  // Characteristic advances: at most 2 per stat, within maximums, and the
  // current stat equals base + advances - injury decreases.
  for (const stat of ["MA", "ST", "AG", "PA", "AV"] as const) {
    const advances = player.characteristicAdvances?.[stat] ?? 0;
    if (advances > 2) {
      violations.push({
        area: "progression",
        subject,
        detail: `${stat} advanced ${advances} times (max 2)`,
      });
    }
    const decreases = player.injuries.filter(
      (injury) => STAT_DECREASE_INJURIES[injury] === stat
    ).length;
    const expected =
      player.baseStats[stat] +
      improvementDirection(stat) * advances -
      improvementDirection(stat) * decreases;
    if (player.stats[stat] !== expected) {
      violations.push({
        area: "progression",
        subject,
        detail: `${stat} ${player.stats[stat]} !== base ${player.baseStats[stat]} +${advances} advances -${decreases} injuries`,
      });
    }
    const maximum = CHARACTERISTIC_MAXIMUMS[stat];
    const outOfBounds =
      stat === "AG" || stat === "PA"
        ? player.stats[stat] < maximum
        : player.stats[stat] > maximum;
    if (outOfBounds) {
      violations.push({
        area: "progression",
        subject,
        detail: `${stat} ${player.stats[stat]} beyond maximum ${maximum}`,
      });
    }
  }

  // History totals reproduce stored SPP and progression.
  const spent = advancements.reduce((sum, record) => sum + record.sppCost, 0);
  if (player.careerStats) {
    const career = player.careerStats;
    const statSpp =
      career.completions * SPP_PER_STAT.completions +
      career.interceptions * SPP_PER_STAT.interceptions +
      career.casualties * SPP_PER_STAT.casualties +
      career.touchdowns * SPP_PER_STAT.touchdowns +
      career.mvps * SPP_PER_STAT.mvps;
    if (career.sppEarned !== statSpp) {
      violations.push({
        area: "progression",
        subject,
        detail: `career sppEarned ${career.sppEarned} !== stat lines worth ${statSpp}`,
      });
    }
    if (career.sppEarned !== player.spp + spent) {
      violations.push({
        area: "progression",
        subject,
        detail: `career sppEarned ${career.sppEarned} !== unspent ${player.spp} + advancement spending ${spent}`,
      });
    }
    if (career.mvps > career.matches) {
      violations.push({
        area: "progression",
        subject,
        detail: `${career.mvps} MVPs in ${career.matches} matches`,
      });
    }
  } else if (player.spp !== 0 || advancements.length > 0) {
    violations.push({
      area: "progression",
      subject,
      detail: `progression without career history (spp ${player.spp}, ${advancements.length} advancements)`,
    });
  }

  return violations;
}

function fixturesReferenceEntrants(doc: CompetitionDoc): SeedViolation[] {
  const entrantIds = new Set(doc.entrants.map((entrant) => entrant.id));
  const violations: SeedViolation[] = [];
  for (const fixture of doc.fixtures) {
    for (const id of [fixture.homeEntrantId, fixture.awayEntrantId]) {
      if (id !== null && !entrantIds.has(id)) {
        violations.push({
          area: "competition",
          subject: doc.id,
          detail: `fixture ${fixture.id} references unknown entrant ${id}`,
        });
      }
    }
  }
  return violations;
}

function sameStandings(a: Standing[], b: Standing[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((standing, index) => {
    const other = b[index];
    return (
      standing.entrantId === other.entrantId &&
      standing.played === other.played &&
      standing.wins === other.wins &&
      standing.draws === other.draws &&
      standing.losses === other.losses &&
      standing.scoreFor === other.scoreFor &&
      standing.scoreAgainst === other.scoreAgainst &&
      standing.points === other.points
    );
  });
}

function validateCompetition(doc: CompetitionDoc): SeedViolation[] {
  const violations: SeedViolation[] = [];

  if (!isSeedOwned(doc)) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: "missing seed ownership metadata",
    });
  }
  if (doc.entrants.length < 2) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: `only ${doc.entrants.length} entrants`,
    });
  }
  violations.push(...fixturesReferenceEntrants(doc));

  const completed = doc.fixtures.filter((f) => f.status === "complete");
  const incomplete = doc.fixtures.filter((f) => f.status !== "complete");

  // Lifecycle coherence.
  if (doc.status === "draft" && completed.length > 0) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: `draft has ${completed.length} completed fixtures`,
    });
  }
  if (
    doc.status === "active" &&
    (completed.length === 0 || incomplete.length === 0)
  ) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: `active needs both completed (${completed.length}) and open (${incomplete.length}) fixtures`,
    });
  }
  if (doc.status === "complete" && incomplete.length > 0) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: `complete but ${incomplete.length} fixtures unfinished`,
    });
  }

  // Results exist exactly where fixtures are complete; elimination games
  // always have a winner.
  for (const fixture of doc.fixtures) {
    if (fixture.status === "complete" && !fixture.result) {
      violations.push({
        area: "competition",
        subject: doc.id,
        detail: `fixture ${fixture.id} complete without a result`,
      });
    }
    if (fixture.status !== "complete" && fixture.result) {
      violations.push({
        area: "competition",
        subject: doc.id,
        detail: `fixture ${fixture.id} ${fixture.status} but has a result`,
      });
    }
    if (
      doc.type === "tournament" &&
      doc.format === "single-elimination" &&
      fixture.result &&
      !fixture.result.bye &&
      !fixture.result.winnerEntrantId
    ) {
      violations.push({
        area: "competition",
        subject: doc.id,
        detail: `elimination fixture ${fixture.id} has no winner`,
      });
    }
  }

  // Bracket progression: winners occupy their next slot; the final's winner
  // is the recorded champion.
  if (doc.type === "tournament" && doc.format === "single-elimination") {
    for (const fixture of completed) {
      if (!fixture.nextFixtureId || !fixture.result?.winnerEntrantId) continue;
      const next = doc.fixtures.find((f) => f.id === fixture.nextFixtureId);
      const slotValue =
        fixture.nextSlot === "away" ? next?.awayEntrantId : next?.homeEntrantId;
      if (slotValue !== fixture.result.winnerEntrantId) {
        violations.push({
          area: "competition",
          subject: doc.id,
          detail: `winner of ${fixture.id} not advanced to ${fixture.nextFixtureId} (${fixture.nextSlot})`,
        });
      }
    }
    const final = doc.fixtures.find((f) => !f.nextFixtureId);
    if (doc.status === "complete") {
      if (!doc.championEntrantId) {
        violations.push({
          area: "competition",
          subject: doc.id,
          detail: "completed tournament has no champion recorded",
        });
      } else if (final?.result?.winnerEntrantId !== doc.championEntrantId) {
        violations.push({
          area: "competition",
          subject: doc.id,
          detail: `champion ${doc.championEntrantId} did not win the final`,
        });
      }
    }
    if (doc.status === "active" && doc.championEntrantId) {
      violations.push({
        area: "competition",
        subject: doc.id,
        detail: "champion recorded before the bracket completed",
      });
    }
  }

  // Standings reproduce the results (and a completed league's table leader
  // is its recorded champion).
  const expectedStandings = computeStandings(
    doc.entrants,
    doc.fixtures,
    doc.type === "league" ? doc.points : undefined
  );
  if (!sameStandings(doc.standings, expectedStandings)) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: "standings do not match the fixture results",
    });
  }
  if (
    doc.type === "league" &&
    doc.status === "complete" &&
    (doc.standings.length === 0 || doc.standings[0].played === 0)
  ) {
    violations.push({
      area: "competition",
      subject: doc.id,
      detail: "completed league has no table leader (no fixtures played)",
    });
  }

  return violations;
}

/** The one-active-competition membership rule, across all seed docs. */
function validateMembership(docs: CompetitionDoc[]): SeedViolation[] {
  const activeByTeam = new Map<string, string[]>();
  for (const doc of docs) {
    if (doc.status !== "active") continue;
    for (const entrant of doc.entrants) {
      const list = activeByTeam.get(entrant.teamId) ?? [];
      list.push(doc.id);
      activeByTeam.set(entrant.teamId, list);
    }
  }
  const violations: SeedViolation[] = [];
  for (const [teamId, competitions] of activeByTeam) {
    if (competitions.length > 1) {
      violations.push({
        area: "membership",
        subject: teamId,
        detail: `active in ${competitions.length} competitions: ${competitions.join(", ")}`,
      });
    }
  }
  return violations;
}

/**
 * Validate a generated seed catalog (teams + competition docs). Returns
 * every violation found; empty means the catalog is coherent.
 */
export function validateDevelopmentSeedData(
  teams: Team[],
  competitions: CompetitionDoc[]
): SeedViolation[] {
  const violations: SeedViolation[] = [];

  for (const team of teams.filter(isSeedOwned)) {
    const subject = team.seedMetadata?.fixtureKey ?? team.id;
    try {
      const roster = getRosterByRosterName(team.rosterName);
      violations.push(
        ...validateRosterLegality(team, roster).map((v) => ({
          area: "roster",
          subject,
          detail: `${v.rule}: ${v.detail}`,
        }))
      );
    } catch (error) {
      violations.push({
        area: "roster",
        subject,
        detail: `unknown roster ${team.rosterName}: ${error}`,
      });
    }
    const insignificantError = validateInsignificant(team.players);
    if (insignificantError) {
      violations.push({ area: "roster", subject, detail: insignificantError });
    }
    violations.push(...validateTeamFinances(team));
    for (const player of team.players) {
      violations.push(...validatePlayerProgression(player));
    }
  }

  for (const doc of competitions.filter(isSeedOwned)) {
    violations.push(...validateCompetition(doc));
  }
  violations.push(...validateMembership(competitions.filter(isSeedOwned)));

  return violations;
}

/** Throw a SeedValidationError if the catalog has any violation. */
export function assertValidDevelopmentSeedData(
  teams: Team[],
  competitions: CompetitionDoc[]
): void {
  const violations = validateDevelopmentSeedData(teams, competitions);
  if (violations.length > 0) {
    throw new SeedValidationError(violations);
  }
}
