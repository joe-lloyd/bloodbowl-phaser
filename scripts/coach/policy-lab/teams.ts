/** Budgeted role packages and genuine two-roll Random Primary development. */
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

export interface LabVariant extends Variant {
  buildMethod: "base" | "coverage" | "coherent" | "random-primary";
  team: Team;
  developmentBudget: number;
}

/** Local role fit has no global coverage bonus or catalogue-order dependency. */
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
  const priorities =
    role === "passer" && player.stats.PA > 0 && player.stats.PA <= 3
      ? passer
      : role === "hitter"
        ? hitter
        : role === "receiver"
          ? receiver
          : carrier;
  const index = priorities.indexOf(skill);
  return index < 0 ? 0 : 100 - index * 10;
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
      .filter((c) => !players.some((used) => used.player === c.player))
      .sort(
        (a, b) => fit[role](b.p) - fit[role](a.p) || a.player - b.player
      )[0];
    if (pick) players.push({ ...pick, role });
  }
  return players;
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
    // The game offers two rolls. Choose the better role fit, with stable ties.
    skill = [...roll.candidates].sort(
      (a, b) => preference(p, b.skill, role) - preference(p, a.skill, role)
    )[0].skill;
  } else {
    skill = [...legal].sort(
      (a, b) =>
        preference(p, b, role) - preference(p, a, role) || a.localeCompare(b)
    )[0];
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
    if (!legal.length) break;
    const skill = chooseSkill(p, role, legal, random, rng);
    applyAdvancement(p, {
      kind: random ? "random-primary" : "chosen-primary",
      skill,
    });
    skills.push(skill);
  }
  return { skills, spent: 12 - p.spp };
}

function develop(template: string, index: number, random: boolean): LabVariant {
  const team = stabilizeIds(createComputerTeamFromTemplate(template), template);
  const rng = createCoachRng(24_000_000 + index);
  // Four distinct useful players, each given the same 12 SPP budget in both arms.
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

export function labInventory(): LabVariant[] {
  const retained: LabVariant[] = advancedInventory()
    .filter(
      (v) => v.arm === "base" || (v.arm === "focused" && v.replicate === 0)
    )
    .map((v) => ({
      ...v,
      buildMethod: v.arm === "base" ? "base" : "coverage",
      team: stabilizeIds(teamFromVariant(v), v.id),
      developmentBudget: v.sppSpent,
    }));
  getComputerTeamTemplates().forEach((template, index) => {
    retained.push(
      develop(template.id, index, false),
      develop(template.id, index, true)
    );
  });
  return retained;
}
