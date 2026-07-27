/**
 * Team advancement modes: Matched Play packages, Sevens Skill Selection, and
 * the post-game Draft. Advanced League continues to use the plain SPP flow
 * in progression.ts; this module covers everything mode-specific.
 *
 * All functions here are pure/mutate-the-passed-object, mirroring
 * progression.ts, so they work identically in the browser UI, the headless
 * harness, and unit tests.
 */
import {
  InjuryType,
  Player,
  PlayerAdvancement,
  PlayerStatus,
} from "../../types/Player";
import {
  DraftRecord,
  MatchedPlayAllocation,
  PendingDevelopment,
  Team,
  TeamRoster,
} from "../../types/Team";
import { SkillCategory, SkillType, getSkill } from "../../types/Skills";
import { IRNGService } from "../../services/rng/RNGService";
import {
  ELITE_SKILLS,
  isSkillLegal,
  rollSkill,
  advancementCount,
} from "./progression";

/**
 * A competition/event's Matched Play skill package. Event profiles supply
 * their own numbers (see src/competition/rosterRules.ts); there is no single
 * universal package. Allowances are indexed by roster tier (1-4).
 */
export interface MatchedPlaySkillPackage {
  id: string;
  name: string;
  /** Total package skills a team of this tier may allocate (one per player). */
  tierAllowance: Record<number, number>;
  /** Of that total, how many may be spent on a Secondary Skill. A Primary
   *  Skill may always be taken in a Secondary slot instead ("substitution"),
   *  but a Secondary Skill may never be taken in a Primary-only slot. */
  secondaryAllowance: Record<number, number>;
}

export function createMatchedPlayPackage(
  overrides: Partial<MatchedPlaySkillPackage> = {}
): MatchedPlaySkillPackage {
  return {
    id: overrides.id ?? `package-${Date.now()}`,
    name: overrides.name ?? "Standard Matched Play Package",
    tierAllowance: overrides.tierAllowance ?? { 1: 2, 2: 2, 3: 1, 4: 1 },
    secondaryAllowance: overrides.secondaryAllowance ?? {
      1: 1,
      2: 1,
      3: 0,
      4: 0,
    },
  };
}

export interface MatchedPlayPackageStatus {
  totalAllowance: number;
  secondaryAllowance: number;
  used: number;
  usedSecondary: number;
  remaining: number;
  complete: boolean;
}

export function matchedPlayPackageStatus(
  team: Team,
  roster: Pick<TeamRoster, "tier">,
  pkg: MatchedPlaySkillPackage
): MatchedPlayPackageStatus {
  const allocations = team.matchedPlayAllocations ?? [];
  const totalAllowance = pkg.tierAllowance[roster.tier] ?? 0;
  const secondaryAllowance = pkg.secondaryAllowance[roster.tier] ?? 0;
  const usedSecondary = allocations.filter((a) => a.usedSecondarySlot).length;
  return {
    totalAllowance,
    secondaryAllowance,
    used: allocations.length,
    usedSecondary,
    remaining: totalAllowance - allocations.length,
    complete: allocations.length === totalAllowance,
  };
}

function skillCategoryAccess(
  player: Player,
  skill: SkillType,
  access: "primary" | "secondary"
): SkillCategory | undefined {
  const definition = getSkill(skill);
  const category = definition.category;
  const categories = access === "primary" ? player.primary : player.secondary;
  return categories?.includes(category) ? category : undefined;
}

/**
 * Allocate one Matched Play package skill to a player. A Primary Skill may
 * be selected in an allowed Secondary slot (substitution); no player may
 * receive more than one added skill from the package, and the package's
 * total/secondary allowances may not be exceeded.
 */
export function allocateMatchedPlaySkill(
  team: Team,
  roster: Pick<TeamRoster, "tier">,
  pkg: MatchedPlaySkillPackage,
  player: Player,
  skill: SkillType,
  access: "primary" | "secondary"
): MatchedPlayAllocation {
  const allocations = (team.matchedPlayAllocations ??= []);
  if (allocations.some((a) => a.playerId === player.id)) {
    throw new Error("This player has already received a package skill.");
  }
  const status = matchedPlayPackageStatus(team, roster, pkg);
  if (status.used >= status.totalAllowance) {
    throw new Error("The event skill package has no remaining allowance.");
  }
  const category = skillCategoryAccess(player, skill, access);
  if (!category) {
    throw new Error(`${skill} is not a legal ${access} choice for this player.`);
  }
  if (!isSkillLegal(player, skill)) {
    throw new Error(`${skill} is not legal (duplicate or incompatible).`);
  }
  // A Secondary Skill must land in a Secondary slot; a Primary Skill may use
  // either a Primary slot or a remaining Secondary slot (substitution).
  const usedSecondarySlot = access === "secondary";
  if (usedSecondarySlot && status.usedSecondary >= status.secondaryAllowance) {
    throw new Error("The event skill package has no remaining Secondary slots.");
  }

  const elite = ELITE_SKILLS.has(skill);
  const valueIncrease =
    (access === "primary" ? 20_000 : 40_000) + (elite ? 10_000 : 0);
  const record: PlayerAdvancement = {
    id: `adv-${advancementCount(player) + 1}`,
    type: access === "primary" ? "primary-skill" : "secondary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease,
    elite,
    source: "matched-play-package",
  };
  player.skills.push(getSkill(skill));
  player.advancements ??= [];
  player.advancements.push(record);
  player.level = Math.min(6, player.advancements.length);
  player.teamValue = (player.teamValue ?? 0) + record.valueIncrease;

  const allocation: MatchedPlayAllocation = {
    playerId: player.id,
    skill,
    access,
    usedSecondarySlot,
  };
  allocations.push(allocation);
  return allocation;
}

/** Remove a Matched Play allocation (and its skill/value) before finalization. */
export function removeMatchedPlayAllocation(
  team: Team,
  player: Player,
  allocation: MatchedPlayAllocation
): void {
  team.matchedPlayAllocations = (team.matchedPlayAllocations ?? []).filter(
    (a) => a !== allocation
  );
  const index = (player.advancements ?? []).findIndex(
    (advancement) =>
      advancement.source === "matched-play-package" &&
      advancement.name === allocation.skill
  );
  if (index === -1) return;
  const [removed] = player.advancements!.splice(index, 1);
  player.skills = player.skills.filter(
    (skill) => skill.type !== allocation.skill
  );
  player.teamValue = Math.max(0, (player.teamValue ?? 0) - removed.valueIncrease);
  player.level = Math.min(6, player.advancements!.length);
}

// ===== Sevens Skill Selection =====

/** Living participants from the frozen match record, eligible for the award. */
export function eligibleSkillSelectionParticipants(
  team: Team,
  participantPlayerIds: readonly string[]
): string[] {
  const participants = new Set(participantPlayerIds);
  return team.players
    .filter(
      (player) =>
        participants.has(player.id) &&
        player.status !== PlayerStatus.DEAD &&
        !player.injuries.includes(InjuryType.DEAD)
    )
    .map((player) => player.id);
}

export interface SkillSelectionCandidate {
  skill: SkillType;
  firstD6: number;
  secondD6: number;
}

/** Two-roll random choice for either Primary or Secondary access, rerolling
 *  illegal (duplicate/incompatible) results — the same table used by the
 *  standard SPP random-skill rules. */
export function rollSkillSelectionCandidates(
  player: Player,
  category: SkillCategory,
  access: "primary" | "secondary",
  rng: Pick<IRNGService, "rollDie">
): [SkillSelectionCandidate, SkillSelectionCandidate] {
  const categories = access === "primary" ? player.primary : player.secondary;
  if (!categories?.includes(category)) {
    throw new Error(`Selected category is not ${access} for this player`);
  }
  const rollCandidate = (): SkillSelectionCandidate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const firstD6 = rng.rollDie(6);
      const secondD6 = rng.rollDie(6);
      const skill = rollSkill(category, firstD6, secondD6);
      if (isSkillLegal(player, skill)) return { skill, firstD6, secondD6 };
    }
    throw new Error("No legal random skill could be rolled");
  };
  return [rollCandidate(), rollCandidate()];
}

/** Randomly select one eligible participant (used for the Secondary method). */
export function randomEligibleParticipant(
  eligiblePlayerIds: readonly string[],
  rng: Pick<IRNGService, "rollDie">
): string {
  if (eligiblePlayerIds.length === 0) {
    throw new Error("No eligible participants to select from.");
  }
  const roll = rng.rollDie(eligiblePlayerIds.length);
  return eligiblePlayerIds[roll - 1];
}

/** Confirm a Skill Selection award: persists provenance, source match, the
 *  two-roll candidates that were offered, and the standard advancement
 *  value increase for the category/surcharge. */
export function confirmSkillSelectionAward(
  player: Player,
  skill: SkillType,
  access: "primary" | "secondary",
  matchId: string,
  candidates?: readonly SkillSelectionCandidate[]
): PlayerAdvancement {
  const categories = access === "primary" ? player.primary : player.secondary;
  if (!categories?.includes(getSkill(skill).category)) {
    throw new Error(`${skill} is not a legal ${access} choice for this player.`);
  }
  if (!isSkillLegal(player, skill)) {
    throw new Error(`${skill} is not legal (duplicate or incompatible).`);
  }
  const elite = ELITE_SKILLS.has(skill);
  const valueIncrease =
    (access === "primary" ? 20_000 : 40_000) + (elite ? 10_000 : 0);
  const record: PlayerAdvancement = {
    id: `adv-${advancementCount(player) + 1}`,
    type: access === "primary" ? "primary-skill" : "secondary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease,
    elite,
    source: "sevens-skill-selection",
    sourceMatchId: matchId,
    ...(candidates?.length
      ? {
          candidateRolls: candidates.map((candidate) => ({
            skill: candidate.skill,
            firstD6: candidate.firstD6,
            secondD6: candidate.secondD6,
          })),
        }
      : {}),
  };
  player.skills.push(getSkill(skill));
  player.advancements ??= [];
  player.advancements.push(record);
  player.level = Math.min(6, player.advancements.length);
  player.teamValue = (player.teamValue ?? 0) + record.valueIncrease;
  return record;
}

/** Create the pending post-game Skill Selection decision for the results
 *  screen to record but not resolve (see design "Defer incomplete
 *  development to Team Management"). */
export function createPendingSkillSelection(
  team: Team,
  matchId: string,
  eligibleParticipantIds: readonly string[]
): PendingDevelopment {
  const entry: PendingDevelopment = {
    id: `pending-${matchId}-skill-selection`,
    kind: "sevens-skill-selection",
    matchId,
    eligibleParticipantIds: [...eligibleParticipantIds],
    createdAt: Date.now(),
  };
  team.pendingDevelopment ??= [];
  team.pendingDevelopment.push(entry);
  return entry;
}

// ===== The Draft =====

/** Number of skills a player has gained from any advancement pipeline —
 *  Advanced League SPP, the Matched Play package, or Skill Selection. */
export function addedSkillCount(player: Player): number {
  return (player.advancements ?? []).filter(
    (advancement) =>
      advancement.type === "primary-skill" ||
      advancement.type === "secondary-skill"
  ).length;
}

export interface DraftOutcome {
  records: DraftRecord[];
  goldCredited: number;
}

/**
 * Resolve the post-game Draft: after DEAD players are removed, roll one D6
 * for every rostered player with 1+ added skills. A roll less than or equal
 * to their added-skill count drafts them away: they leave the active roster
 * (career/Draft history retained), and the team receives gold equal to the
 * total value increase from their added skills.
 */
export function resolveDraft(
  team: Team,
  rng: Pick<IRNGService, "rollDie">,
  matchId?: string
): DraftOutcome {
  const candidates = team.players.filter(
    (player) =>
      player.status !== PlayerStatus.DEAD &&
      !player.injuries.includes(InjuryType.DEAD) &&
      addedSkillCount(player) >= 1
  );
  const records: DraftRecord[] = [];
  let goldCredited = 0;

  for (const player of candidates) {
    const count = addedSkillCount(player);
    const roll = rng.rollDie(6);
    if (roll > count) continue; // remains on the roster

    const valueIncrease = (player.advancements ?? [])
      .filter(
        (advancement) =>
          advancement.type === "primary-skill" ||
          advancement.type === "secondary-skill"
      )
      .reduce((sum, advancement) => sum + advancement.valueIncrease, 0);

    const record: DraftRecord = {
      id: `draft-${player.id}-${Date.now()}`,
      playerId: player.id,
      playerName: player.playerName,
      roll,
      addedSkillCount: count,
      valueIncrease,
      matchId,
      removedAt: Date.now(),
      player: structuredClone(player),
    };
    records.push(record);
    goldCredited += valueIncrease;
  }

  if (records.length > 0) {
    const draftedIds = new Set(records.map((record) => record.playerId));
    team.players = team.players.filter((player) => !draftedIds.has(player.id));
    team.draftHistory = [...(team.draftHistory ?? []), ...records];
    team.treasury = (team.treasury ?? 0) + goldCredited;
  }

  return { records, goldCredited };
}
