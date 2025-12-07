/**
 * Skill types and definitions for Blood Bowl
 */

/**
 * Skill categories
 */
export enum SkillCategory {
  GENERAL = "General",
  AGILITY = "Agility",
  STRENGTH = "Strength",
  PASSING = "Passing",
  MUTATION = "Mutation",
  DEVIOUS = "Devious",
}

/**
 * Common Blood Bowl skills
 */
export enum SkillType {
  // General skills
  BLOCK = "Block",
  GUARD = "Guard",
  MIGHTY_BLOW = "Mighty Blow",
  TACKLE = "Tackle",
  STAND_FIRM = "Stand Firm",
  PRO = "Pro",
  DAUNTLESS = "Dauntless",

  // Agility skills
  DODGE = "Dodge",
  CATCH = "Catch",
  SPRINT = "Sprint",
  SURE_FEET = "Sure Feet",
  LEAP = "Leap",
  SIDESTEP = "Side Step",
  ON_THE_BALL = "On The Ball",

  // Strength skills
  BREAK_TACKLE = "Break Tackle",
  GRAB = "Grab",
  JUGGERNAUT = "Juggernaut",
  PILING_ON = "Piling On",
  THICK_SKULL = "Thick Skull",
  DEFENSIVE = "Defensive",
  BRAWLER = "Brawler",

  // Passing skills
  PASS = "Pass",
  ACCURATE = "Accurate",
  SAFE_THROW = "Safe Throw",
  SURE_HANDS = "Sure Hands",
  DUMP_OFF = "Dump-Off",
  SAFE_PASS = "Safe Pass",
  HIT_AND_RUN = "Hit and Run",
  JUMP_UP = "Jump Up",
  NERVES_OF_STEEL = "Nerves of Steel",

  // Special skills
  FRENZY = "Frenzy",
  DIRTY_PLAYER = "Dirty Player",
  STRIP_BALL = "Strip Ball",
  WRESTLE = "Wrestle",
  RIGHT_STUFF = "Right Stuff",
  STUNTY = "Stunty",
  ALWAYS_HUNGRY = "Always Hungry",
  REGENERATION = "Regeneration",
  THROW_TEAMMATE = "Throw Teammate",
  REALLY_STUPID = "Really Stupid",
  STEADY_FOOTING = "Steady Footing",
  PROJECTILE_VOMIT = "Projectile Vomit",
}

/**
 * Skill interface
 */
export interface Skill {
  type: SkillType;
  category: SkillCategory;
  description: string;
  providesReroll?: boolean; // Does this skill provide a re-roll?
}

/**
 * Skill definitions database
 */
export const SKILL_DEFINITIONS: Record<SkillType, Skill> = {
  [SkillType.BLOCK]: {
    type: SkillType.BLOCK,
    category: SkillCategory.GENERAL,
    description: "Ignore Both Down results unless opponent also has Block",
    providesReroll: false,
  },
  [SkillType.DODGE]: {
    type: SkillType.DODGE,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed dodge per turn",
    providesReroll: true,
  },
  [SkillType.SURE_HANDS]: {
    type: SkillType.SURE_HANDS,
    category: SkillCategory.PASSING,
    description: "Re-roll one failed pick-up per turn",
    providesReroll: true,
  },
  [SkillType.CATCH]: {
    type: SkillType.CATCH,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed catch per turn",
    providesReroll: true,
  },
  [SkillType.PASS]: {
    type: SkillType.PASS,
    category: SkillCategory.PASSING,
    description: "Re-roll one failed pass per turn",
    providesReroll: true,
  },
  [SkillType.GUARD]: {
    type: SkillType.GUARD,
    category: SkillCategory.GENERAL,
    description: "Assists count even when marked by opponent",
    providesReroll: false,
  },
  [SkillType.MIGHTY_BLOW]: {
    type: SkillType.MIGHTY_BLOW,
    category: SkillCategory.GENERAL,
    description: "+1 to armor and injury rolls",
    providesReroll: false,
  },
  [SkillType.TACKLE]: {
    type: SkillType.TACKLE,
    category: SkillCategory.GENERAL,
    description: "Opponent cannot use Dodge skill",
    providesReroll: false,
  },
  [SkillType.STAND_FIRM]: {
    type: SkillType.STAND_FIRM,
    category: SkillCategory.GENERAL,
    description: "Cannot be pushed back",
    providesReroll: false,
  },
  [SkillType.PRO]: {
    type: SkillType.PRO,
    category: SkillCategory.GENERAL,
    description: "Re-roll any action once per turn (4+ required)",
    providesReroll: true,
  },
  [SkillType.SPRINT]: {
    type: SkillType.SPRINT,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed GFI per turn",
    providesReroll: true,
  },
  [SkillType.SURE_FEET]: {
    type: SkillType.SURE_FEET,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed GFI per turn",
    providesReroll: true,
  },
  [SkillType.LEAP]: {
    type: SkillType.LEAP,
    category: SkillCategory.AGILITY,
    description: "Jump over adjacent players",
    providesReroll: false,
  },
  [SkillType.SIDESTEP]: {
    type: SkillType.SIDESTEP,
    category: SkillCategory.AGILITY,
    description: "Choose which square to be pushed to",
    providesReroll: false,
  },
  [SkillType.BREAK_TACKLE]: {
    type: SkillType.BREAK_TACKLE,
    category: SkillCategory.STRENGTH,
    description: "Use ST instead of AG for dodge rolls",
    providesReroll: false,
  },
  [SkillType.GRAB]: {
    type: SkillType.GRAB,
    category: SkillCategory.STRENGTH,
    description: "Choose which square to push opponent to",
    providesReroll: false,
  },
  [SkillType.JUGGERNAUT]: {
    type: SkillType.JUGGERNAUT,
    category: SkillCategory.STRENGTH,
    description: "Ignore Stand Firm and Wrestle on blitz",
    providesReroll: false,
  },
  [SkillType.PILING_ON]: {
    type: SkillType.PILING_ON,
    category: SkillCategory.STRENGTH,
    description: "Re-roll injury roll after a block",
    providesReroll: true,
  },
  [SkillType.THICK_SKULL]: {
    type: SkillType.THICK_SKULL,
    category: SkillCategory.STRENGTH,
    description: "+1 to injury roll when knocked down",
    providesReroll: false,
  },
  [SkillType.ACCURATE]: {
    type: SkillType.ACCURATE,
    category: SkillCategory.PASSING,
    description: "+1 to pass rolls",
    providesReroll: false,
  },
  [SkillType.SAFE_THROW]: {
    type: SkillType.SAFE_THROW,
    category: SkillCategory.PASSING,
    description: "No turnover on failed pass",
    providesReroll: false,
  },
  [SkillType.DUMP_OFF]: {
    type: SkillType.DUMP_OFF,
    category: SkillCategory.PASSING,
    description: "Quick pass when blocked",
    providesReroll: false,
  },
  [SkillType.FRENZY]: {
    type: SkillType.FRENZY,
    category: SkillCategory.GENERAL,
    description: "Must make two blocks if first pushes back",
    providesReroll: false,
  },
  [SkillType.DIRTY_PLAYER]: {
    type: SkillType.DIRTY_PLAYER,
    category: SkillCategory.GENERAL,
    description: "+1 to armor roll when fouling",
    providesReroll: false,
  },
  [SkillType.STRIP_BALL]: {
    type: SkillType.STRIP_BALL,
    category: SkillCategory.GENERAL,
    description: "Force ball drop on Push result",
    providesReroll: false,
  },
  [SkillType.WRESTLE]: {
    type: SkillType.WRESTLE,
    category: SkillCategory.GENERAL,
    description: "Both Down always applies",
    providesReroll: false,
  },
};

/**
 * Get skill by type
 */
export function getSkill(type: SkillType): Skill {
  return SKILL_DEFINITIONS[type];
}

/**
 * Check if player has a specific skill
 */
export function hasSkill(skills: Skill[], skillType: SkillType): boolean {
  return skills.some((skill) => skill.type === skillType);
}

/**
 * Get all skills that provide re-rolls
 */
export function getRerollSkills(skills: Skill[]): Skill[] {
  return skills.filter((skill) => skill.providesReroll);
}
