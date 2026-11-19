import {
  type Team,
  calculateTeamValue,
  startingDedicatedFans,
} from "../types/Team";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
  DEDICATED_FAN_COST,
  TEAM_REROLL_COST,
} from "../game/rules/sevensPrices";
import { InjuryType, type Player, type PlayerStats } from "../types/Player";
import { SKILL_DEFINITIONS, SkillType } from "../types/Skills";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import { validateInsignificant } from "../game/rules/insignificant";
import {
  CHARACTERISTIC_MAXIMUMS,
  advancementCount,
} from "../game/progression/progression";
import {
  type CompetitionDoc,
  type Standing,
  type TournamentDoc,
} from "../competition/types";
import { computeStandings } from "../competition/logic";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { isSeedOwned } from "./seedMeta";

export interface SeedViolation {
  area: string;

  subject: string;
  detail: string;
}

export class SeedValidationError extends Error {
  public readonly violations: SeedViolation[];
  constructor(violations: SeedViolation[]) {
    super(
      `development seed data is invalid (${String(violations.length)}):\n` +
        violations
          .map((v) => `  [${v.area}] ${v.subject}: ${v.detail}`)
          .join("\n")
    );
    this.violations = violations;
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

function improvementDirection(stat: keyof PlayerStats): 1 | -1 {
  return stat === "AG" || stat === "PA" ? -1 : 1;
}

function validateTeamFinances(team: Team): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const spent =
    team.players.reduce((sum, player) => sum + player.cost, 0) +
    team.rerolls * TEAM_REROLL_COST +
    (team.apothecary ? APOTHECARY_COST : 0) +
    team.coaches * ASSISTANT_COACH_COST +
    team.cheerleaders * CHEERLEADER_COST +
    (team.dedicatedFans - startingDedicatedFans(team.advancementMode)) *
      DEDICATED_FAN_COST;

  if (team.treasury !== team.startingTreasury - spent) {
    violations.push({
      area: "finances",
      subject: team.id,
      detail:
        `treasury ${String(team.treasury)} !== budget ${String(team.startingTreasury)} ` +
        `- purchases ${String(spent)}`,
    });
  }
  const expectedValue = calculateTeamValue(team);
  if (team.teamValue !== expectedValue) {
    violations.push({
      area: "finances",
      subject: team.id,
      detail: `team value ${String(team.teamValue)} !== derived ${String(expectedValue)}`,
    });
  }
  return violations;
}

function skillAccessViolations(
  player: Player,
  subject: string
): SeedViolation[] {
  const violations: SeedViolation[] = [];
  for (const advancement of player.advancements ?? []) {
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
  return violations;
}

function duplicateSkillViolations(
  player: Player,
  subject: string
): SeedViolation[] {
  const violations: SeedViolation[] = [];
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
  return violations;
}

function statViolations(
  player: Player,
  stat: keyof PlayerStats,
  subject: string
): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const advances = player.characteristicAdvances?.[stat] ?? 0;
  if (advances > 2) {
    violations.push({
      area: "progression",
      subject,
      detail: `${stat} advanced ${String(advances)} times (max 2)`,
    });
  }
  const decreases = player.injuries.filter(
    (injury) => STAT_DECREASE_INJURIES[injury] === stat
  ).length;

  const veteranPenalty = stat === "MA" && player.veteran ? 1 : 0;
  const expected =
    player.baseStats[stat] +
    improvementDirection(stat) * advances -
    improvementDirection(stat) * decreases -
    veteranPenalty;
  if (player.stats[stat] !== expected) {
    violations.push({
      area: "progression",
      subject,
      detail: `${stat} ${String(player.stats[stat])} !== base ${String(player.baseStats[stat])} +${String(advances)} advances -${String(decreases)} injuries -${String(veteranPenalty)} Veteran`,
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
      detail: `${stat} ${String(player.stats[stat])} beyond maximum ${String(maximum)}`,
    });
  }
  return violations;
}

function historyViolations(player: Player, subject: string): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const advancements = player.advancements ?? [];
  const spent = advancements.reduce((sum, record) => sum + record.sppCost, 0);
  const career = player.careerStats;
  if (!career) {
    if (player.spp !== 0 || advancements.length > 0) {
      violations.push({
        area: "progression",
        subject,
        detail: `progression without career history (spp ${String(player.spp)}, ${String(advancements.length)} advancements)`,
      });
    }
    return violations;
  }
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
      detail: `career sppEarned ${String(career.sppEarned)} !== stat lines worth ${String(statSpp)}`,
    });
  }
  if (career.sppEarned !== player.spp + spent) {
    violations.push({
      area: "progression",
      subject,
      detail: `career sppEarned ${String(career.sppEarned)} !== unspent ${String(player.spp)} + advancement spending ${String(spent)}`,
    });
  }
  if (career.mvps > career.matches) {
    violations.push({
      area: "progression",
      subject,
      detail: `${String(career.mvps)} MVPs in ${String(career.matches)} matches`,
    });
  }
  return violations;
}

function validatePlayerProgression(player: Player): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const subject = `${player.teamId}/${player.id}`;
  const advancements = player.advancements ?? [];

  if (
    advancementCount(player) > 6 ||
    player.level !== Math.min(6, advancements.length)
  ) {
    violations.push({
      area: "progression",
      subject,
      detail: `level ${String(player.level)} inconsistent with ${String(advancements.length)} advancements (cap 6)`,
    });
  }
  violations.push(...skillAccessViolations(player, subject));
  violations.push(...duplicateSkillViolations(player, subject));
  for (const stat of ["MA", "ST", "AG", "PA", "AV"] as const) {
    violations.push(...statViolations(player, stat, subject));
  }
  violations.push(...historyViolations(player, subject));
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
      other !== undefined &&
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

function competitionViolation(
  doc: CompetitionDoc,
  detail: string
): SeedViolation {
  return { area: "competition", subject: doc.id, detail };
}

function lifecycleViolations(
  doc: CompetitionDoc,
  completed: number,
  incomplete: number
): SeedViolation[] {
  const violations: SeedViolation[] = [];
  if (doc.status === "draft" && completed > 0) {
    violations.push(
      competitionViolation(
        doc,
        `draft has ${String(completed)} completed fixtures`
      )
    );
  }
  if (doc.status === "active" && (completed === 0 || incomplete === 0)) {
    violations.push(
      competitionViolation(
        doc,
        `active needs both completed (${String(completed)}) and open (${String(incomplete)}) fixtures`
      )
    );
  }
  if (doc.status === "complete" && incomplete > 0) {
    violations.push(
      competitionViolation(
        doc,
        `complete but ${String(incomplete)} fixtures unfinished`
      )
    );
  }
  return violations;
}

function resultViolations(doc: CompetitionDoc): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const elimination = isElimination(doc);
  for (const fixture of doc.fixtures) {
    if (fixture.status === "complete" && !fixture.result) {
      violations.push(
        competitionViolation(
          doc,
          `fixture ${fixture.id} complete without a result`
        )
      );
    }
    if (fixture.status !== "complete" && fixture.result) {
      violations.push(
        competitionViolation(
          doc,
          `fixture ${fixture.id} ${fixture.status} but has a result`
        )
      );
    }
    if (
      elimination &&
      fixture.result &&
      !fixture.result.bye &&
      !fixture.result.winnerEntrantId
    ) {
      violations.push(
        competitionViolation(
          doc,
          `elimination fixture ${fixture.id} has no winner`
        )
      );
    }
  }
  return violations;
}

function isElimination(doc: CompetitionDoc): doc is TournamentDoc {
  return doc.type === "tournament" && doc.format === "single-elimination";
}

function bracketViolations(
  doc: TournamentDoc,
  completed: CompetitionDoc["fixtures"]
): SeedViolation[] {
  const violations: SeedViolation[] = [];
  for (const fixture of completed) {
    if (!fixture.nextFixtureId || !fixture.result?.winnerEntrantId) continue;
    const next = doc.fixtures.find((f) => f.id === fixture.nextFixtureId);
    const slotValue =
      fixture.nextSlot === "away" ? next?.awayEntrantId : next?.homeEntrantId;
    if (slotValue !== fixture.result.winnerEntrantId) {
      violations.push(
        competitionViolation(
          doc,
          `winner of ${fixture.id} not advanced to ${fixture.nextFixtureId} (${String(fixture.nextSlot)})`
        )
      );
    }
  }
  violations.push(...championViolations(doc));
  return violations;
}

function championViolations(doc: TournamentDoc): SeedViolation[] {
  const final = doc.fixtures.find((f) => !f.nextFixtureId);
  if (doc.status === "complete" && !doc.championEntrantId) {
    return [
      competitionViolation(
        doc,
        "completed tournament has no champion recorded"
      ),
    ];
  }
  if (
    doc.status === "complete" &&
    final?.result?.winnerEntrantId !== doc.championEntrantId
  ) {
    return [
      competitionViolation(
        doc,
        `champion ${String(doc.championEntrantId)} did not win the final`
      ),
    ];
  }
  if (doc.status === "active" && doc.championEntrantId) {
    return [
      competitionViolation(
        doc,
        "champion recorded before the bracket completed"
      ),
    ];
  }
  return [];
}

function standingsViolations(doc: CompetitionDoc): SeedViolation[] {
  const violations: SeedViolation[] = [];
  const expectedStandings = computeStandings(
    doc.entrants,
    doc.fixtures,
    doc.type === "league" ? doc.points : undefined
  );
  if (!sameStandings(doc.standings, expectedStandings)) {
    violations.push(
      competitionViolation(doc, "standings do not match the fixture results")
    );
  }
  if (
    doc.type === "league" &&
    doc.status === "complete" &&
    (doc.standings.length === 0 || doc.standings[0]?.played === 0)
  ) {
    violations.push(
      competitionViolation(
        doc,
        "completed league has no table leader (no fixtures played)"
      )
    );
  }
  return violations;
}

function validateCompetition(doc: CompetitionDoc): SeedViolation[] {
  const violations: SeedViolation[] = [];

  if (!isSeedOwned(doc)) {
    violations.push(
      competitionViolation(doc, "missing seed ownership metadata")
    );
  }
  if (doc.entrants.length < 2) {
    violations.push(
      competitionViolation(doc, `only ${String(doc.entrants.length)} entrants`)
    );
  }
  violations.push(...fixturesReferenceEntrants(doc));

  const completed = doc.fixtures.filter((f) => f.status === "complete");
  const incomplete = doc.fixtures.filter((f) => f.status !== "complete");
  violations.push(
    ...lifecycleViolations(doc, completed.length, incomplete.length)
  );
  violations.push(...resultViolations(doc));
  if (isElimination(doc)) violations.push(...bracketViolations(doc, completed));
  violations.push(...standingsViolations(doc));
  return violations;
}

function validateMembership(
  docs: CompetitionDoc[],
  teams: Team[]
): SeedViolation[] {
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
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  for (const [teamId, competitions] of activeByTeam) {
    if (competitions.length > 1) {
      violations.push({
        area: "membership",
        subject: teamId,
        detail: `active in ${String(competitions.length)} competitions: ${competitions.join(", ")}`,
      });
    }
    const team = teamsById.get(teamId);
    if (team && team.activeCompetitionId !== competitions[0]) {
      violations.push({
        area: "membership",
        subject: teamId,
        detail:
          `activeCompetitionId ${team.activeCompetitionId ?? "(unset)"} ` +
          `!== active competition ${String(competitions[0])}`,
      });
    }
  }
  return violations;
}

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
        detail: `unknown roster ${team.rosterName}: ${String(error)}`,
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
  violations.push(
    ...validateMembership(competitions.filter(isSeedOwned), teams)
  );

  return violations;
}

export function assertValidDevelopmentSeedData(
  teams: Team[],
  competitions: CompetitionDoc[]
): void {
  const violations = validateDevelopmentSeedData(teams, competitions);
  if (violations.length > 0) {
    throw new SeedValidationError(violations);
  }
}
