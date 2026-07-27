/**
 * Roster-authentic fixture resolution.
 *
 * A scenario that grants Throw Team-mate to a Human Lineman proves the code
 * path but teaches nothing about the game, and it hides the case where a
 * real Ogre's Bone Head fires first. So fixtures resolve against the
 * *production* roster templates, in a fixed priority order:
 *
 *   1. NATIVE       a position that starts with the skill, and that the
 *                   Sevens composition actually fields.
 *   2. ADVANCEMENT  a rules-valid, thematically sensible position that could
 *                   normally take the skill (its category is in the
 *                   position's primary or secondary access).
 *   3. SYNTHETIC    a bare grant, allowed only with a stated isolation
 *                   reason — and rejected outright when (1) exists.
 *
 * Browser-safe: the sandbox uses this to explain a loaded scenario's teams.
 */

import { RosterName } from "../../types/Team";
import { SkillType, SKILL_DEFINITIONS } from "../../types/Skills";
import { PlayerTemplate } from "../../types/Player";
import {
  getRosterByRosterName,
  getAvailableRosterNames,
} from "../../data/RosterTemplates";
import { positionByPlayerIndex } from "../../game/TeamFactory";
import { PlayerRef } from "../scenarioCase/types";

export type FixtureSource = "native" | "advancement" | "synthetic";

/** A concrete, fielded roster slot that can carry a skill. */
export interface RosterSlot {
  roster: RosterName;
  positionName: string;
  /** Index into `team.players` — the number in a `team1:N` reference. */
  playerIndex: number;
}

export interface FixtureCandidate extends RosterSlot {
  source: Exclude<FixtureSource, "synthetic">;
  /** For `advancement`, which access tier permits the skill. */
  access?: "primary" | "secondary";
}

/** Build the stable player reference for a slot on a given side. */
export function refFor(
  team: "team1" | "team2",
  slot: Pick<RosterSlot, "playerIndex">
): PlayerRef {
  return `${team}:${slot.playerIndex}` as PlayerRef;
}

function templateHasSkill(
  template: PlayerTemplate,
  skill: SkillType
): boolean {
  return template.skills.some((entry) =>
    typeof entry === "string" ? entry === skill : entry.type === skill
  );
}

/** Rosters in a fixed order, so fixture choice never depends on Object key order. */
function orderedRosters(): RosterName[] {
  return [...getAvailableRosterNames()].sort();
}

/**
 * Every roster position that owns `skill` by default, fielded or not.
 *
 * Used for advice ("the Wood Elf Wardancer has this natively"). The gate
 * itself uses `nativeFixtures`, because a position outside the Sevens
 * composition has no player index and so cannot be placed by a scenario
 * until the composition changes.
 */
export function nativePositions(
  skill: SkillType
): { roster: RosterName; positionName: string; fielded: boolean }[] {
  const found: { roster: RosterName; positionName: string; fielded: boolean }[] =
    [];
  for (const rosterName of orderedRosters()) {
    const roster = getRosterByRosterName(rosterName);
    if (!roster) continue;
    const fieldedPositions = new Set(positionByPlayerIndex(rosterName));
    for (const template of roster.playerTemplates) {
      if (!templateHasSkill(template, skill)) continue;
      found.push({
        roster: rosterName,
        positionName: template.positionName,
        fielded: fieldedPositions.has(template.positionName),
      });
    }
  }
  return found;
}

/**
 * Every *fielded* slot whose roster position owns `skill` by default.
 *
 * "Fielded" matters: a position that exists in the roster but is not in the
 * Sevens composition has no player index, so a scenario could not place it
 * without changing the composition first.
 */
export function nativeFixtures(skill: SkillType): FixtureCandidate[] {
  const found: FixtureCandidate[] = [];
  for (const rosterName of orderedRosters()) {
    const roster = getRosterByRosterName(rosterName);
    if (!roster) continue;
    const positions = positionByPlayerIndex(rosterName);
    positions.forEach((positionName, playerIndex) => {
      const template = roster.playerTemplates.find(
        (candidate) => candidate.positionName === positionName
      );
      if (!template || !templateHasSkill(template, skill)) return;
      // One entry per position, at its first index.
      if (found.some((f) => f.roster === rosterName && f.positionName === positionName)) {
        return;
      }
      found.push({
        source: "native",
        roster: rosterName,
        positionName,
        playerIndex,
      });
    });
  }
  return found;
}

/**
 * Fielded slots that could legally take `skill` as an advancement — the
 * skill's book category appears in the position's primary or secondary
 * access. Traits have no category and are therefore never advancement-legal.
 */
export function advancementFixtures(skill: SkillType): FixtureCandidate[] {
  const definition = SKILL_DEFINITIONS[skill];
  if (!definition || definition.kind === "trait") return [];
  const category = definition.category;
  if (!category) return [];

  const found: FixtureCandidate[] = [];
  for (const rosterName of orderedRosters()) {
    const roster = getRosterByRosterName(rosterName);
    if (!roster) continue;
    const positions = positionByPlayerIndex(rosterName);
    positions.forEach((positionName, playerIndex) => {
      const template = roster.playerTemplates.find(
        (candidate) => candidate.positionName === positionName
      );
      if (!template || templateHasSkill(template, skill)) return;
      const access = template.primary.includes(category)
        ? "primary"
        : template.secondary.includes(category)
          ? "secondary"
          : null;
      if (!access) return;
      if (found.some((f) => f.roster === rosterName && f.positionName === positionName)) {
        return;
      }
      found.push({
        source: "advancement",
        roster: rosterName,
        positionName,
        playerIndex,
        access,
      });
    });
  }
  return found;
}

/** The fixture the policy prefers for a skill, or null when only a grant works. */
export function preferredFixture(skill: SkillType): FixtureCandidate | null {
  return nativeFixtures(skill)[0] ?? advancementFixtures(skill)[0] ?? null;
}

/**
 * Apply the whole priority policy in one call, keeping a caller's roster
 * preference when that roster can supply the skill.
 */
export function resolveSkillFixture(
  skill: SkillType,
  opts: { preferRoster?: RosterName } = {}
): FixtureCandidate | null {
  const natives = nativeFixtures(skill);
  const advancements = advancementFixtures(skill);
  const preferred = opts.preferRoster;
  if (preferred) {
    const nativeOnPreferred = natives.find((f) => f.roster === preferred);
    if (nativeOnPreferred) return nativeOnPreferred;
    const advancementOnPreferred = advancements.find(
      (f) => f.roster === preferred
    );
    if (advancementOnPreferred) return advancementOnPreferred;
  }
  return natives[0] ?? advancements[0] ?? null;
}

/** Which position a `team1:N`-style index holds on a given roster. */
export function positionAt(
  rosterName: RosterName,
  playerIndex: number
): string | undefined {
  return positionByPlayerIndex(rosterName)[playerIndex];
}

/** Skills a `team1:N` slot already owns from its roster template. */
export function nativeSkillsAt(
  rosterName: RosterName,
  playerIndex: number
): SkillType[] {
  const positionName = positionAt(rosterName, playerIndex);
  if (!positionName) return [];
  const roster = getRosterByRosterName(rosterName);
  const template = roster?.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) return [];
  return template.skills.map((entry) =>
    typeof entry === "string" ? (entry as SkillType) : entry.type
  );
}

/** Does this fielded slot already own the skill natively? */
export function ownsNatively(
  rosterName: RosterName,
  playerIndex: number,
  skill: SkillType
): boolean {
  return nativeSkillsAt(rosterName, playerIndex).includes(skill);
}

/**
 * How a specific fielded slot could come to hold a skill.
 *
 * This is the question the fixture gate actually asks. Granting Block to a
 * Human Lineman is fine — General is its primary access, so a real coach
 * could develop exactly that player. Granting Very Long Legs to the same
 * Lineman is not: it is a Mutation-family trait a Human can never take, so
 * the scenario is fielding a player that cannot exist.
 */
export type GrantLegality =
  | "native"
  | "primary-advancement"
  | "secondary-advancement"
  | "illegal";

export function grantLegality(
  rosterName: RosterName,
  playerIndex: number,
  skill: SkillType
): GrantLegality {
  if (ownsNatively(rosterName, playerIndex, skill)) return "native";

  const definition = SKILL_DEFINITIONS[skill];
  // Traits are never advancements — a player either has one or does not.
  if (!definition || definition.kind === "trait" || !definition.category) {
    return "illegal";
  }

  const positionName = positionAt(rosterName, playerIndex);
  const roster = getRosterByRosterName(rosterName);
  const template = roster?.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) return "illegal";

  if (template.primary.includes(definition.category)) return "primary-advancement";
  if (template.secondary.includes(definition.category)) {
    return "secondary-advancement";
  }
  return "illegal";
}
