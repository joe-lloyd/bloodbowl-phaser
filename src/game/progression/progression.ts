import { Player, PlayerAdvancement, PlayerStats } from "../../types/Player";
import {
  getSkill,
  SkillCategory,
  SkillType,
  SKILL_DEFINITIONS,
} from "../../types/Skills";
import { IRNGService } from "../../services/rng/RNGService";

export type AdvancementKind =
  | "random-primary"
  | "chosen-primary"
  | "chosen-secondary"
  | "characteristic";

export interface AdvancementCosts {
  randomPrimary: number;
  chosenPrimary: number;
  chosenSecondary: number;
  characteristic: number;
}

export const ADVANCEMENT_COSTS: readonly AdvancementCosts[] = [
  {
    randomPrimary: 3,
    chosenPrimary: 6,
    chosenSecondary: 10,
    characteristic: 14,
  },
  {
    randomPrimary: 4,
    chosenPrimary: 8,
    chosenSecondary: 12,
    characteristic: 16,
  },
  {
    randomPrimary: 6,
    chosenPrimary: 12,
    chosenSecondary: 16,
    characteristic: 20,
  },
  {
    randomPrimary: 8,
    chosenPrimary: 16,
    chosenSecondary: 20,
    characteristic: 24,
  },
  {
    randomPrimary: 10,
    chosenPrimary: 20,
    chosenSecondary: 24,
    characteristic: 28,
  },
  {
    randomPrimary: 15,
    chosenPrimary: 30,
    chosenSecondary: 34,
    characteristic: 38,
  },
] as const;

export const CHARACTERISTIC_MAXIMUMS: PlayerStats = {
  MA: 9,
  ST: 8,
  AG: 1,
  PA: 1,
  AV: 11,
};

export const VALUE_INCREASES: Record<keyof PlayerStats, number> = {
  MA: 20_000,
  ST: 60_000,
  AG: 30_000,
  PA: 20_000,
  AV: 10_000,
};

export const ELITE_SKILLS = new Set<SkillType>([
  SkillType.BLOCK,
  SkillType.DODGE,
  SkillType.GUARD,
  SkillType.MIGHTY_BLOW,
]);

/** Exact page-121 order: first D6 chooses a half, second D6 a row. */
export const SKILL_ROLL_TABLE: Record<SkillCategory, readonly SkillType[]> = {
  [SkillCategory.AGILITY]: [
    SkillType.CATCH,
    SkillType.DIVING_CATCH,
    SkillType.DIVING_TACKLE,
    SkillType.DODGE,
    SkillType.DEFENSIVE,
    SkillType.HIT_AND_RUN,
    SkillType.JUMP_UP,
    SkillType.LEAP,
    SkillType.SAFE_PAIR_OF_HANDS,
    SkillType.SIDESTEP,
    SkillType.SPRINT,
    SkillType.SURE_FEET,
  ],
  [SkillCategory.DEVIOUS]: [
    SkillType.DIRTY_PLAYER,
    SkillType.EYE_GOUGE,
    SkillType.FUMBLEROOSKI,
    SkillType.LETHAL_FLIGHT,
    SkillType.LONE_FOULER,
    SkillType.PILE_DRIVER,
    SkillType.PUT_THE_BOOT_IN,
    SkillType.QUICK_FOUL,
    SkillType.SABOTEUR,
    SkillType.SHADOWING,
    SkillType.SNEAKY_GIT,
    SkillType.VIOLENT_INNOVATOR,
  ],
  [SkillCategory.GENERAL]: [
    SkillType.BLOCK,
    SkillType.DAUNTLESS,
    SkillType.FEND,
    SkillType.FRENZY,
    SkillType.KICK,
    SkillType.PRO,
    SkillType.STEADY_FOOTING,
    SkillType.STRIP_BALL,
    SkillType.SURE_HANDS,
    SkillType.TACKLE,
    SkillType.TAUNT,
    SkillType.WRESTLE,
  ],
  [SkillCategory.MUTATION]: [
    SkillType.BIG_HAND,
    SkillType.CLAWS,
    SkillType.DISTURBING_PRESENCE,
    SkillType.EXTRA_ARMS,
    SkillType.FOUL_APPEARANCE,
    SkillType.HORNS,
    SkillType.IRON_HARD_SKIN,
    SkillType.MONSTROUS_MOUTH,
    SkillType.PREHENSILE_TAIL,
    SkillType.TENTACLES,
    SkillType.TWO_HEADS,
    SkillType.VERY_LONG_LEGS,
  ],
  [SkillCategory.PASSING]: [
    SkillType.ACCURATE,
    SkillType.CANNONEER,
    SkillType.CLOUD_BURSTER,
    SkillType.DUMP_OFF,
    SkillType.GIVE_AND_GO,
    SkillType.HAIL_MARY_PASS,
    SkillType.LEADER,
    SkillType.NERVES_OF_STEEL,
    SkillType.ON_THE_BALL,
    SkillType.PASS,
    SkillType.PUNT,
    SkillType.SAFE_PASS,
  ],
  [SkillCategory.STRENGTH]: [
    SkillType.ARM_BAR,
    SkillType.BRAWLER,
    SkillType.BREAK_TACKLE,
    SkillType.BULLSEYE,
    SkillType.GRAB,
    SkillType.GUARD,
    SkillType.JUGGERNAUT,
    SkillType.MIGHTY_BLOW,
    SkillType.MULTIPLE_BLOCK,
    SkillType.STAND_FIRM,
    SkillType.STRONG_ARM,
    SkillType.THICK_SKULL,
  ],
};

const INCOMPATIBLE_SKILLS: readonly (readonly [SkillType, SkillType])[] = [
  [SkillType.FRENZY, SkillType.GRAB],
  [SkillType.FRENZY, SkillType.HIT_AND_RUN],
  [SkillType.FRENZY, SkillType.MULTIPLE_BLOCK],
];

export function advancementCount(player: Player): number {
  return player.advancements?.length ?? 0;
}

export function nextAdvancementCosts(
  player: Player
): AdvancementCosts | undefined {
  return ADVANCEMENT_COSTS[advancementCount(player)];
}

export function mustAdvance(player: Player): boolean {
  const costs = nextAdvancementCosts(player);
  return !!costs && (player.spp ?? 0) >= costs.characteristic;
}

export function canAdvance(player: Player): boolean {
  const costs = nextAdvancementCosts(player);
  return !!costs && (player.spp ?? 0) >= costs.randomPrimary;
}

export function rollSkill(
  category: SkillCategory,
  firstD6: number,
  secondD6: number
): SkillType {
  if (firstD6 < 1 || firstD6 > 6 || secondD6 < 1 || secondD6 > 6) {
    throw new Error("Skill table rolls must be D6 results");
  }
  const halfOffset = firstD6 <= 3 ? 0 : 6;
  return SKILL_ROLL_TABLE[category][halfOffset + secondD6 - 1];
}

export function isSkillLegal(player: Player, skill: SkillType): boolean {
  if (player.skills.some((existing) => existing.type === skill)) return false;
  return !INCOMPATIBLE_SKILLS.some(
    ([left, right]) =>
      (skill === left && player.skills.some((s) => s.type === right)) ||
      (skill === right && player.skills.some((s) => s.type === left))
  );
}

export function eligibleSkills(
  player: Player,
  categories: readonly SkillCategory[]
): SkillType[] {
  const allowed = new Set(categories);
  return (Object.values(SkillType) as SkillType[]).filter((skill) => {
    const definition = SKILL_DEFINITIONS[skill];
    return (
      definition.kind === "skill" &&
      allowed.has(definition.category) &&
      isSkillLegal(player, skill)
    );
  });
}

export interface RandomSkillCandidate {
  skill: SkillType;
  firstD6: number;
  secondD6: number;
}

export function rollRandomPrimaryCandidates(
  player: Player,
  category: SkillCategory,
  rng: Pick<IRNGService, "rollDie">
): [RandomSkillCandidate, RandomSkillCandidate] {
  if (!player.primary?.includes(category)) {
    throw new Error("Selected category is not Primary for this player");
  }
  const rollCandidate = (): RandomSkillCandidate => {
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

export function characteristicChoices(
  player: Player,
  roll: number
): (keyof PlayerStats)[] {
  const table: Record<number, (keyof PlayerStats)[]> = {
    1: ["AV"],
    2: ["AV", "PA"],
    3: ["AV", "MA", "PA"],
    4: ["AV", "MA", "PA"],
    5: ["MA", "PA"],
    6: ["AG", "MA"],
    7: ["AG", "ST"],
    8: ["MA", "ST", "AG", "PA", "AV"],
  };
  if (!table[roll]) throw new Error("Characteristic roll must be a D8 result");
  return table[roll].filter((stat) => {
    const improved = player.characteristicAdvances?.[stat] ?? 0;
    const maximum = CHARACTERISTIC_MAXIMUMS[stat];
    const atMaximum =
      stat === "AG" || stat === "PA"
        ? player.stats[stat] <= maximum
        : player.stats[stat] >= maximum;
    return improved < 2 && !atMaximum;
  });
}

export type AdvancementChoice =
  | {
      kind: "random-primary" | "chosen-primary" | "chosen-secondary";
      skill: SkillType;
    }
  | {
      kind: "characteristic";
      roll: number;
      stat: keyof PlayerStats;
    }
  | {
      kind: "characteristic-fallback";
      roll: number;
      skill: SkillType;
      access: "primary" | "secondary";
    };

function costFor(player: Player, choice: AdvancementChoice): number {
  const costs = nextAdvancementCosts(player);
  if (!costs) throw new Error("Legend players cannot gain another advancement");
  switch (choice.kind) {
    case "random-primary":
      return costs.randomPrimary;
    case "chosen-primary":
      return costs.chosenPrimary;
    case "chosen-secondary":
      return costs.chosenSecondary;
    case "characteristic":
    case "characteristic-fallback":
      return costs.characteristic;
  }
}

function skillAccessIsLegal(
  player: Player,
  skill: SkillType,
  access: "primary" | "secondary"
): boolean {
  const category = SKILL_DEFINITIONS[skill].category;
  const categories = access === "primary" ? player.primary : player.secondary;
  return !!categories?.includes(category) && isSkillLegal(player, skill);
}

export function applyAdvancement(
  player: Player,
  choice: AdvancementChoice
): Player {
  const cost = costFor(player, choice);
  if ((player.spp ?? 0) < cost) throw new Error("Not enough SPP");

  let record: PlayerAdvancement;
  if (choice.kind === "characteristic") {
    if (!characteristicChoices(player, choice.roll).includes(choice.stat)) {
      throw new Error("Characteristic is not legal for this roll");
    }
    const direction = choice.stat === "AG" || choice.stat === "PA" ? -1 : 1;
    player.stats[choice.stat] += direction;
    player.characteristicAdvances ??= {};
    player.characteristicAdvances[choice.stat] =
      (player.characteristicAdvances[choice.stat] ?? 0) + 1;
    record = {
      id: `adv-${advancementCount(player) + 1}`,
      type: "characteristic",
      name: `+1 ${choice.stat}`,
      sppCost: cost,
      valueIncrease: VALUE_INCREASES[choice.stat],
    };
  } else {
    const access =
      choice.kind === "chosen-secondary" ||
      (choice.kind === "characteristic-fallback" &&
        choice.access === "secondary")
        ? "secondary"
        : "primary";
    if (!skillAccessIsLegal(player, choice.skill, access)) {
      throw new Error(`Skill is not a legal ${access} choice`);
    }
    const elite = ELITE_SKILLS.has(choice.skill);
    const valueIncrease =
      (access === "primary" ? 20_000 : 40_000) + (elite ? 10_000 : 0);
    player.skills.push(getSkill(choice.skill));
    record = {
      id: `adv-${advancementCount(player) + 1}`,
      type: access === "primary" ? "primary-skill" : "secondary-skill",
      name: choice.skill,
      sppCost: cost,
      valueIncrease,
      elite,
    };
  }

  player.spp -= cost;
  player.advancements ??= [];
  player.advancements.push(record);
  player.level = Math.min(6, player.advancements.length);
  player.teamValue = (player.teamValue ?? 0) + record.valueIncrease;
  return player;
}
