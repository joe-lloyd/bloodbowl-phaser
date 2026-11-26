import { advancedInventory, teamFromVariant } from "../advanced-study/teams";
import type { Variant } from "../advanced-study/teams";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";
import {
  applyAdvancement,
  eligibleSkills,
  nextAdvancementCosts,
  rollPendingRandomPrimary,
} from "../../../src/game/progression/progression";
import { SkillType, SKILL_DEFINITIONS } from "../../../src/types/Skills";
import { calculateTeamValue } from "../../../src/types/Team";
import type { Team } from "../../../src/types/Team";
import type { Player } from "../../../src/types/Player";
import { createCoachRng } from "../../../src/simulation/rng";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import {
  DEFAULT_GAME_TYPE,
  type GameType,
} from "../../../src/game/variants/gameTypes";

export interface LabVariant extends Variant {
  buildMethod: "base" | "coverage" | "coherent" | "random-primary";
  team: Team;
  developmentBudget: number;
}

type Role = "handler" | "passer" | "receiver" | "hitter";
function preference(player: Player, skill: SkillType, role: Role): number {
  const carrier = [SkillType.SURE_HANDS, SkillType.DODGE, SkillType.BLOCK];
  const passer = [SkillType.PASS, SkillType.ACCURATE, SkillType.SURE_HANDS];
  const receiver = [SkillType.CATCH, SkillType.DODGE, SkillType.SPRINT];
  const hitter = [
    SkillType.BLOCK,
    SkillType.GUARD,
    SkillType.MIGHTY_BLOW,
    SkillType.TACKLE,
  ];
  const priorities: readonly SkillType[] =
    role === "passer" && player.stats.PA > 0 && player.stats.PA <= 3
      ? passer
      : role === "hitter"
        ? hitter
        : role === "receiver"
          ? receiver
          : carrier;
  const index = priorities.indexOf(skill);
  return index === -1 ? 0 : 100 - index * 10;
}

function rolePlayers(team: Team) {
  const candidates = team.players
    .map((p, player) => ({ p, player }))
    .filter(({ p }) => eligibleSkills(p, p.primary ?? []).length);
  const fit: Record<Role, (p: Player) => number> = {
    handler: (p) => (7 - p.stats.AG) * 8 + p.stats.MA,
    passer: (p) => (p.stats.PA > 0 ? 7 - p.stats.PA : -10) * 10,
    receiver: (p) => p.stats.MA * 3 + (7 - p.stats.AG) * 3,
    hitter: (p) => p.stats.ST * 8,
  };
  const players: { p: Player; player: number; role: Role }[] = [];
  for (const role of ["handler", "passer", "receiver", "hitter"] as const) {
    const pick = candidates
      .filter((c) => players.every((used) => used.player !== c.player))
      .toSorted(
        (a, b) => fit[role](b.p) - fit[role](a.p) || a.player - b.player
      )[0];
    if (pick) players.push({ ...pick, role });
  }
  return players;
}

function firstOf<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("No skill to choose from");
  return item;
}

function chooseSkill(
  p: Player,
  role: Role,
  legal: SkillType[],
  random: boolean,
  rng: ReturnType<typeof createCoachRng>
): SkillType {
  let skill: SkillType;
  if (random) {
    const categories = [
      ...new Set(legal.map((s) => SKILL_DEFINITIONS[s].category)),
    ];
    const roll = rollPendingRandomPrimary(p, rng.pick(categories), {
      rollDie: (sides) => rng.int(sides) + 1,
    });
    if (roll.kind !== "random-primary")
      throw new Error("Unexpected advancement roll");

    skill = firstOf(
      roll.candidates.toSorted(
        (a, b) => preference(p, b.skill, role) - preference(p, a.skill, role)
      )
    ).skill;
  } else {
    skill = firstOf(
      legal.toSorted(
        (a, b) =>
          preference(p, b, role) - preference(p, a, role) || a.localeCompare(b)
      )
    );
  }
  return skill;
}

function developPlayer(
  p: Player,
  role: Role,
  random: boolean,
  rng: ReturnType<typeof createCoachRng>
) {
  p.spp = 12;
  const skills: SkillType[] = [];
  while (true) {
    const costs = nextAdvancementCosts(p);
    if (!costs || p.spp < (random ? costs.randomPrimary : costs.chosenPrimary))
      break;
    const legal = eligibleSkills(p, p.primary ?? []);
    if (legal.length === 0) break;
    const skill = chooseSkill(p, role, legal, random, rng);
    applyAdvancement(p, {
      kind: random ? "random-primary" : "chosen-primary",
      skill,
    });
    skills.push(skill);
  }
  return { skills, spent: 12 - p.spp };
}

interface DevelopArgs {
  template: string;
  index: number;
  random: boolean;
  gameType: GameType;
}

function develop({
  template,
  index,
  random,
  gameType,
}: DevelopArgs): LabVariant {
  const team = stabilizeIds(
    createComputerTeamFromTemplate(template, { gameType }),
    template
  );
  const rng = createCoachRng(24_000_000 + index);

  const players = rolePlayers(team);
  const allocations: Variant["allocations"] = [];
  let sppSpent = 0;
  for (const { p, player, role } of players) {
    const result = developPlayer(p, role, random, rng);
    sppSpent += result.spent;
    allocations.push(
      ...result.skills.map((skill) => ({
        player,
        skill,
        access: "primary" as const,
      }))
    );
  }
  team.teamValue = calculateTeamValue(team);
  return {
    id: `${template}--lab-${random ? "random" : "coherent"}`,
    template,
    arm: random ? "random" : "focused",
    replicate: random ? 0 : 1,
    allocations,
    teamValue: team.teamValue,
    sppSpent,
    developmentBudget: players.length * 12,
    buildMethod: random ? "random-primary" : "coherent",
    team,
  };
}

export function labInventory(
  gameType: GameType = DEFAULT_GAME_TYPE
): LabVariant[] {
  const retained: LabVariant[] = advancedInventory(gameType)
    .filter(
      (v) => v.arm === "base" || (v.arm === "focused" && v.replicate === 0)
    )
    .map((v) => ({
      ...v,
      buildMethod: v.arm === "base" ? "base" : "coverage",
      team: stabilizeIds(teamFromVariant(v, gameType), v.id),
      developmentBudget: v.sppSpent,
    }));
  const templates = getComputerTeamTemplates({ gameType });
  for (const [index, template] of templates.entries()) {
    const args = { template: template.id, index, gameType };
    retained.push(
      develop({ ...args, random: false }),
      develop({ ...args, random: true })
    );
  }
  return retained;
}
