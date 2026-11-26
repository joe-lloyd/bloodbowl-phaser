import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";
import {
  applyAdvancement,
  eligibleSkills,
  ELITE_SKILLS,
  nextAdvancementCosts,
} from "../../../src/game/progression/progression";
import {
  SkillType,
  SKILL_DEFINITIONS,
  SkillCategory,
  hasSkill,
} from "../../../src/types/Skills";
import { calculateTeamValue } from "../../../src/types/Team";
import type { Player } from "../../../src/types/Player";
import { createCoachRng } from "../../../src/simulation/rng";
import {
  DEFAULT_GAME_TYPE,
  type GameType,
} from "../../../src/game/variants/gameTypes";

export interface Allocation {
  player: number;
  skill: SkillType;
  access: "primary" | "secondary";
}
export interface Variant {
  id: string;
  template: string;
  arm: "base" | "focused" | "random";
  replicate: number;
  allocations: Allocation[];
  teamValue: number;
  sppSpent: number;
}

const THROW_BOOSTS: ReadonlySet<SkillType> = new Set([
  SkillType.STRONG_ARM,
  SkillType.BULLSEYE,
]);
const WEAPONS: ReadonlySet<SkillType> = new Set([
  SkillType.STAB,
  SkillType.CHAINSAW,
  SkillType.PROJECTILE_VOMIT,
  SkillType.BREATHE_FIRE,
  SkillType.BOMBARDIER,
]);
const MUTATIONS: ReadonlySet<SkillType> = new Set([
  SkillType.BIG_HAND,
  SkillType.EXTRA_ARMS,
  SkillType.TWO_HEADS,
  SkillType.MONSTROUS_MOUTH,
]);
const HOLDERS: ReadonlySet<SkillType> = new Set([
  SkillType.TENTACLES,
  SkillType.PREHENSILE_TAIL,
  SkillType.GUARD,
  SkillType.STAND_FIRM,
]);

function playerAt(players: Player[], index: number): Player {
  const player = players[index];
  if (!player) throw new Error("No player at index " + String(index));
  return player;
}

function learn(player: Player, allocation: Allocation) {
  const kind =
    allocation.access === "primary" ? "chosen-primary" : "chosen-secondary";
  const costs = nextAdvancementCosts(player)!;
  player.spp =
    kind === "chosen-primary" ? costs.chosenPrimary : costs.chosenSecondary;
  applyAdvancement(player, { kind, skill: allocation.skill });
}

export function teamFromVariant(
  variant: Variant,
  gameType: GameType = DEFAULT_GAME_TYPE
) {
  const team = createComputerTeamFromTemplate(variant.template, { gameType });
  for (const allocation of variant.allocations)
    learn(playerAt(team.players, allocation.player), allocation);
  team.teamValue = calculateTeamValue(team);
  if (team.teamValue !== variant.teamValue)
    throw new Error("Variant value drift: " + variant.id);
  return team;
}

function specializedFit(p: Player, skill: SkillType): number | undefined {
  const canThrow = hasSkill(p.skills, SkillType.THROW_TEAM_MATE);
  if (THROW_BOOSTS.has(skill)) return canThrow ? 120 : -1000;
  if (skill === SkillType.LETHAL_FLIGHT)
    return hasSkill(p.skills, SkillType.RIGHT_STUFF) ? 120 : -1000;
  if (skill === SkillType.VIOLENT_INNOVATOR)
    return p.skills.some((s) => WEAPONS.has(s.type)) ? 100 : -1000;
  if (skill === SkillType.MULTIPLE_BLOCK && p.stats.ST < 4) return -100;
  return undefined;
}

function fit(p: Player, skill: SkillType): number {
  const specific = specializedFit(p, skill);
  if (specific !== undefined) return specific;
  const category = SKILL_DEFINITIONS[skill].category;
  if (MUTATIONS.has(skill)) return (7 - p.stats.AG) * 12 + p.stats.MA * 3;
  if (HOLDERS.has(skill)) return p.stats.ST * 18;
  if (category === SkillCategory.PASSING)
    return p.stats.PA > 0 ? (7 - p.stats.PA) * 14 : -1000;
  if (category === SkillCategory.AGILITY)
    return (7 - p.stats.AG) * 10 + p.stats.MA * 3;
  if (category === SkillCategory.STRENGTH) return p.stats.ST * 14;
  if (category === SkillCategory.DEVIOUS) return 75 - p.cost / 3000;
  return p.stats.MA * 4 + p.stats.ST * 4;
}

export function advancedInventory(gameType: GameType = DEFAULT_GAME_TYPE) {
  const variants: Variant[] = [];
  const coverage = new Map<SkillType, number>();
  const templates = getComputerTeamTemplates({ gameType });
  for (const template of templates) {
    const base = createComputerTeamFromTemplate(template.id, { gameType });
    variants.push({
      id: template.id + "--base",
      template: template.id,
      arm: "base",
      replicate: -1,
      allocations: [],
      teamValue: base.teamValue,
      sppSpent: 0,
    });
  }
  for (const replicate of [0, 1]) {
    for (const [index, template] of templates.entries()) variants.push(
        ...developedVariants({
          templateId: template.id,
          index,
          replicate,
          coverage,
          gameType,
        })
      )
    ;
  }
  return variants;
}

interface DevelopedVariantsArgs {
  templateId: string;
  index: number;
  replicate: number;
  coverage: Map<SkillType, number>;
  gameType: GameType;
}

function developedVariants({
  templateId,
  index,
  replicate,
  coverage,
  gameType,
}: DevelopedVariantsArgs): Variant[] {
  const variants: Variant[] = [];
  const team = createComputerTeamFromTemplate(templateId, { gameType });
  const allocations: Allocation[] = [];
  for (let slot = 0; slot < 6; slot++) {
    const options = team.players
      .flatMap((p, player) =>
        (p.advancements?.length ?? 0) >= 2
          ? []
          : (["primary", "secondary"] as const).flatMap((access) =>
              eligibleSkills(p, p[access] ?? []).map((skill) => ({
                player,
                skill,
                access,
                score:
                  fit(p, skill) +
                  180 / (1 + (coverage.get(skill) ?? 0)) -
                  (p.advancements?.length ?? 0) * 25 -
                  (access === "secondary" ? 10 : 0),
              }))
            )
      )
      .filter((o) => o.score > -500)
      .toSorted(
        (a, b) =>
          b.score - a.score ||
          a.skill.localeCompare(b.skill) ||
          a.player - b.player
      );
    const chosen = options[0];
    if (!chosen) throw new Error("No legal advancement: " + templateId);
    const allocation: Allocation = {
      player: chosen.player,
      skill: chosen.skill,
      access: chosen.access,
    };
    learn(playerAt(team.players, allocation.player), allocation);
    allocations.push(allocation);
    coverage.set(allocation.skill, (coverage.get(allocation.skill) ?? 0) + 1);
  }
  const randomTeam = createComputerTeamFromTemplate(templateId, { gameType });
  const rng = createCoachRng(8_000_000 + replicate * 1000 + index);
  const random = allocations.map((allocation) => {
    const player = playerAt(randomTeam.players, allocation.player);
    const pool = eligibleSkills(player, player[allocation.access] ?? []).filter(
      (skill) =>
        SKILL_DEFINITIONS[skill].category ===
          SKILL_DEFINITIONS[allocation.skill].category &&
        ELITE_SKILLS.has(skill) === ELITE_SKILLS.has(allocation.skill)
    );
    if (pool.length === 0)
      throw new Error("No matched random control: " + templateId);
    const choice = { ...allocation, skill: rng.pick(pool) };
    learn(player, choice);
    return choice;
  });
  for (const [arm, players, chosen] of [
    ["focused", team.players, allocations],
    ["random", randomTeam.players, random],
  ] as const) {
    const developed = arm === "focused" ? team : randomTeam;
    variants.push({
      id: `${templateId}--${arm}-${String(replicate)}`,
      template: templateId,
      arm,
      replicate,
      allocations: [...chosen],
      teamValue: calculateTeamValue(developed),
      sppSpent: players.reduce(
        (sum, p) =>
          sum + (p.advancements ?? []).reduce((n, a) => n + a.sppCost, 0),
        0
      ),
    });
  }
  return variants;
}
