import { RosterName } from "../../types/Team";
import { SkillType, SKILL_DEFINITIONS } from "../../types/Skills";
import { type PlayerTemplate } from "../../types/Player";
import {
  getRosterByRosterName,
  getAvailableRosterNames,
} from "../../data/RosterTemplates";
import { positionByPlayerIndex } from "../../game/TeamFactory";
import { type PlayerRef } from "../scenarioCase/types";

type FixtureSource = "native" | "advancement" | "synthetic";

export interface RosterSlot {
  roster: RosterName;
  positionName: string;

  playerIndex: number;
}

export interface FixtureCandidate extends RosterSlot {
  source: Exclude<FixtureSource, "synthetic">;

  access?: "primary" | "secondary";
}

export function refFor(
  team: "team1" | "team2",
  slot: Pick<RosterSlot, "playerIndex">
): PlayerRef {
  return `${team}:${String(slot.playerIndex)}` as PlayerRef;
}

function templateHasSkill(template: PlayerTemplate, skill: SkillType): boolean {
  return template.skills.some((entry) =>
    (typeof entry === "string" ? entry : entry.type) === skill
  );
}

function orderedRosters(): RosterName[] {
  return [...getAvailableRosterNames()].sort();
}

export function nativePositions(
  skill: SkillType
): { roster: RosterName; positionName: string; fielded: boolean }[] {
  const found: {
    roster: RosterName;
    positionName: string;
    fielded: boolean;
  }[] = [];
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

export function nativeFixtures(skill: SkillType): FixtureCandidate[] {
  const found: FixtureCandidate[] = [];
  for (const rosterName of orderedRosters()) {
    const roster = getRosterByRosterName(rosterName);
    if (!roster) continue;
    const positions = positionByPlayerIndex(rosterName);
    for (const [playerIndex, positionName] of positions.entries()) {
      const template = roster.playerTemplates.find(
        (candidate) => candidate.positionName === positionName
      );
      if (!template || !templateHasSkill(template, skill)) continue;

      if (
        found.some(
          (f) => f.roster === rosterName && f.positionName === positionName
        )
      ) {
        continue;
      }
      found.push({
        source: "native",
        roster: rosterName,
        positionName,
        playerIndex,
      });
    }
  }
  return found;
}

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
    for (const [playerIndex, positionName] of positions.entries()) {
      const template = roster.playerTemplates.find(
        (candidate) => candidate.positionName === positionName
      );
      if (!template || templateHasSkill(template, skill)) continue;
      const access = template.primary.includes(category)
        ? "primary"
        : template.secondary.includes(category)
          ? "secondary"
          : null;
      if (!access) continue;
      if (
        found.some(
          (f) => f.roster === rosterName && f.positionName === positionName
        )
      ) {
        continue;
      }
      found.push({
        source: "advancement",
        roster: rosterName,
        positionName,
        playerIndex,
        access,
      });
    }
  }
  return found;
}

export function preferredFixture(skill: SkillType): FixtureCandidate | null {
  return nativeFixtures(skill)[0] ?? advancementFixtures(skill)[0] ?? null;
}

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

export function positionAt(
  rosterName: RosterName,
  playerIndex: number
): string | undefined {
  return positionByPlayerIndex(rosterName)[playerIndex];
}

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
    typeof entry === "string" ? (entry) : entry.type
  );
}

export function ownsNatively(
  rosterName: RosterName,
  playerIndex: number,
  skill: SkillType
): boolean {
  return nativeSkillsAt(rosterName, playerIndex).includes(skill);
}

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

  if (!definition || definition.kind === "trait" || !definition.category) {
    return "illegal";
  }

  const positionName = positionAt(rosterName, playerIndex);
  const roster = getRosterByRosterName(rosterName);
  const template = roster?.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) return "illegal";

  if (template.primary.includes(definition.category))
    return "primary-advancement";
  if (template.secondary.includes(definition.category)) {
    return "secondary-advancement";
  }
  return "illegal";
}
