/** Skill families, player instances and public UI descriptions. */
import { SKILL_CATALOG } from "../data/skillCatalog";

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
 * Every skill and trait in the 2025 rulebook — values are the book's names.
 */
export enum SkillType {
  // Agility skills
  CATCH = "Catch",
  DEFENSIVE = "Defensive",
  DIVING_CATCH = "Diving Catch",
  DIVING_TACKLE = "Diving Tackle",
  DODGE = "Dodge",
  HIT_AND_RUN = "Hit and Run",
  JUMP_UP = "Jump Up",
  LEAP = "Leap",
  SAFE_PAIR_OF_HANDS = "Safe Pair of Hands",
  SIDESTEP = "Sidestep",
  SPRINT = "Sprint",
  SURE_FEET = "Sure Feet",

  // Devious skills
  DIRTY_PLAYER = "Dirty Player",
  EYE_GOUGE = "Eye Gouge",
  FUMBLEROOSKI = "Fumblerooski",
  LETHAL_FLIGHT = "Lethal Flight",
  LONE_FOULER = "Lone Fouler",
  PILE_DRIVER = "Pile Driver",
  PUT_THE_BOOT_IN = "Put the Boot In",
  QUICK_FOUL = "Quick Foul",
  SABOTEUR = "Saboteur",
  SHADOWING = "Shadowing",
  SNEAKY_GIT = "Sneaky Git",
  VIOLENT_INNOVATOR = "Violent Innovator",

  // General skills
  BLOCK = "Block",
  DAUNTLESS = "Dauntless",
  FEND = "Fend",
  FRENZY = "Frenzy",
  KICK = "Kick",
  PRO = "Pro",
  STEADY_FOOTING = "Steady Footing",
  STRIP_BALL = "Strip Ball",
  SURE_HANDS = "Sure Hands",
  TACKLE = "Tackle",
  TAUNT = "Taunt",
  WRESTLE = "Wrestle",

  // Mutation skills
  BIG_HAND = "Big Hand",
  CLAWS = "Claws",
  DISTURBING_PRESENCE = "Disturbing Presence",
  EXTRA_ARMS = "Extra Arms",
  FOUL_APPEARANCE = "Foul Appearance",
  HORNS = "Horns",
  IRON_HARD_SKIN = "Iron Hard Skin",
  MONSTROUS_MOUTH = "Monstrous Mouth",
  PREHENSILE_TAIL = "Prehensile Tail",
  TENTACLES = "Tentacles",
  TWO_HEADS = "Two Heads",
  VERY_LONG_LEGS = "Very Long Legs",

  // Passing skills
  ACCURATE = "Accurate",
  CANNONEER = "Cannoneer",
  CLOUD_BURSTER = "Cloud Burster",
  DUMP_OFF = "Dump-Off",
  GIVE_AND_GO = "Give and Go",
  HAIL_MARY_PASS = "Hail Mary Pass",
  LEADER = "Leader",
  NERVES_OF_STEEL = "Nerves of Steel",
  ON_THE_BALL = "On the Ball",
  PASS = "Pass",
  PUNT = "Punt",
  SAFE_PASS = "Safe Pass",

  // Strength skills
  ARM_BAR = "Arm Bar",
  BRAWLER = "Brawler",
  BREAK_TACKLE = "Break Tackle",
  BULLSEYE = "Bullseye",
  GRAB = "Grab",
  GUARD = "Guard",
  JUGGERNAUT = "Juggernaut",
  MIGHTY_BLOW = "Mighty Blow",
  MULTIPLE_BLOCK = "Multiple Block",
  STAND_FIRM = "Stand Firm",
  STRONG_ARM = "Strong Arm",
  THICK_SKULL = "Thick Skull",

  // Traits
  ALWAYS_HUNGRY = "Always Hungry",
  ANIMAL_SAVAGERY = "Animal Savagery",
  ANIMOSITY = "Animosity",
  BALL_AND_CHAIN = "Ball & Chain",
  BLOODLUST = "Bloodlust",
  BOMBARDIER = "Bombardier",
  BONE_HEAD = "Bone Head",
  BREATHE_FIRE = "Breathe Fire",
  CHAINSAW = "Chainsaw",
  DECAY = "Decay",
  DRUNKARD = "Drunkard",
  HATRED = "Hatred",
  HYPNOTIC_GAZE = "Hypnotic Gaze",
  INSIGNIFICANT = "Insignificant",
  KICK_TEAM_MATE = "Kick Team-Mate",
  LONER = "Loner",
  MY_BALL = "My Ball",
  NO_BALL = "No Ball",
  PICK_ME_UP = "Pick-Me-Up",
  PLAGUE_RIDDEN = "Plague Ridden",
  POGO = "Pogo",
  PROJECTILE_VOMIT = "Projectile Vomit",
  REALLY_STUPID = "Really Stupid",
  REGENERATION = "Regeneration",
  RIGHT_STUFF = "Right Stuff",
  SECRET_WEAPON = "Secret Weapon",
  STAB = "Stab",
  STUNTY = "Stunty",
  SWOOP = "Swoop",
  TAKE_ROOT = "Take Root",
  THROW_TEAM_MATE = "Throw Team-mate",
  TIMMM_BER = "Timmm-ber!",
  TITCHY = "Titchy",
  TRICKSTER = "Trickster",
  UNCHANNELLED_FURY = "Unchannelled Fury",
  UNSTEADY = "Unsteady",
}

export type SkillKind = "skill" | "trait";
export type SkillUsage = "active" | "passive";

/**
 * Skill interface — an instance carried by a player.
 */
export interface Skill {
  type: SkillType;
  category: SkillCategory;
  description: string;
  /** Concrete value for parameterized families (Loner "4+", Animosity race) */
  parameter?: string | number;
  /** Granted by a scenario placement (stripped when the next scenario loads) */
  scenarioGranted?: boolean;
}

/** Public metadata for one skill or trait. Descriptions are short UI hints. */
export interface SkillDefinition {
  type: SkillType;
  category: SkillCategory;
  kind: SkillKind;
  usage: SkillUsage;
  compulsory: boolean;
  parameterForm?: string;
  description: string;
}

function assertCompleteCatalog(
  definitions: Partial<Record<SkillType, SkillDefinition>>
): asserts definitions is Record<SkillType, SkillDefinition> {
  for (const type of Object.values(SkillType)) {
    if (!definitions[type])
      throw new Error(`Missing skill definition: ${type}`);
  }
}

function buildSkillDefinitions(): Record<SkillType, SkillDefinition> {
  const definitions: Partial<Record<SkillType, SkillDefinition>> = {};
  for (const type of Object.values(SkillType)) {
    const entry = SKILL_CATALOG[type];
    const category =
      entry.category === null
        ? SkillCategory.GENERAL
        : Object.values(SkillCategory).find(
            (value) => value === entry.category
          );
    if (!category) throw new Error(`Invalid skill category: ${entry.category}`);
    definitions[type] = {
      type,
      category,
      kind: entry.kind,
      usage: entry.usage,
      compulsory: entry.compulsory,
      parameterForm: entry.parameterForm ?? undefined,
      description: entry.description,
    };
  }
  assertCompleteCatalog(definitions);
  return definitions;
}

export const SKILL_DEFINITIONS = buildSkillDefinitions();

/**
 * Get a skill instance by type (optionally with a family parameter,
 * e.g. getSkill(SkillType.LONER, "4+")).
 */
export function getSkill(type: SkillType, parameter?: string | number): Skill {
  const def = SKILL_DEFINITIONS[type];
  return {
    type,
    category: def.category,
    description: def.description,
    ...(parameter !== undefined ? { parameter } : {}),
  };
}

/**
 * Check if player has a specific skill
 */
export function hasSkill(skills: Skill[], skillType: SkillType): boolean {
  return skills.some((skill) => skill.type === skillType);
}

/** Find a player's skill instance (to read its parameter). */
export function findSkill(
  skills: Skill[],
  skillType: SkillType
): Skill | undefined {
  return skills.find((skill) => skill.type === skillType);
}

/**
 * Legacy skill names from before the 2025 catalog reconciliation, mapped
 * to their family + parameter — or null for entries with no 2025
 * counterpart. Applied wherever persisted skills are loaded.
 */
export const LEGACY_SKILL_NAMES: Record<
  string,
  { type: SkillType; parameter?: string } | null
> = {
  // Parameterized variants collapsed into families
  "Dirty Player +2": { type: SkillType.DIRTY_PLAYER, parameter: "+2" },
  "Mighty Blow (+2)": { type: SkillType.MIGHTY_BLOW, parameter: "+2" },
  "Loner 3+": { type: SkillType.LONER, parameter: "3+" },
  "Loner 4+": { type: SkillType.LONER, parameter: "4+" },
  "Loner 5+": { type: SkillType.LONER, parameter: "5+" },
  "Bloodlust (2+)": { type: SkillType.BLOODLUST, parameter: "2+" },
  "Bloodlust (3+)": { type: SkillType.BLOODLUST, parameter: "3+" },
  "Animosity (all team-mates)": {
    type: SkillType.ANIMOSITY,
    parameter: "all",
  },
  "Animosity (all Dwarf and Halfling team-mates)": {
    type: SkillType.ANIMOSITY,
    parameter: "Dwarf and Halfling team-mates",
  },
  "Animosity (all Dwarf and Human team-mates)": {
    type: SkillType.ANIMOSITY,
    parameter: "Dwarf and Human team-mates",
  },
  // The 2025 roster's Animosity (Goblin): a keyword the matcher can find.
  "Animosity (Underworld Goblin Linemen)": {
    type: SkillType.ANIMOSITY,
    parameter: "Goblin",
  },
  "Animosity (Orc Lineman)": {
    type: SkillType.ANIMOSITY,
    parameter: "Orc Lineman",
  },
  "Animosity (Big Un Blocker)": {
    type: SkillType.ANIMOSITY,
    parameter: "Big Un Blocker",
  },

  // Renamed to the book's spelling
  Fumbleoskie: { type: SkillType.FUMBLEROOSKI },
  "Timmm Ber": { type: SkillType.TIMMM_BER },
  "Unchained Fury": { type: SkillType.UNCHANNELLED_FURY },
  "Throw Teammate": { type: SkillType.THROW_TEAM_MATE },
  "Pogo Stick": { type: SkillType.POGO },
  "Pick Me Up": { type: SkillType.PICK_ME_UP },
  "Ball and Chain": { type: SkillType.BALL_AND_CHAIN },
  "On The Ball": { type: SkillType.ON_THE_BALL },
  "Side Step": { type: SkillType.SIDESTEP },

  // Superseded / removed in the 2025 rulebook
  "Piling On": { type: SkillType.PILE_DRIVER },
  "Safe Throw": { type: SkillType.SAFE_PASS },
  "Portal Navigator": null,
  "Portal Passer": null,
  "Wall Thrower": null,
  "Running Pass": null,
  Swarming: null, // 2025: a team special rule, not a player trait
};

const KNOWN_TYPES = new Set(Object.values(SkillType) as string[]);
const IS_DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? true;

/**
 * Migrate one persisted skill (possibly saved under a legacy name) to a
 * current catalog instance. Returns null for legacy names with no 2025
 * counterpart. Unknown names fail loudly in dev, warn-and-drop otherwise.
 */
export function migrateSkill(raw: {
  type: string;
  parameter?: string | number;
}): Skill | null {
  if (KNOWN_TYPES.has(raw.type)) {
    return getSkill(raw.type as SkillType, raw.parameter);
  }
  const legacy = LEGACY_SKILL_NAMES[raw.type];
  if (legacy === null) {
    console.warn(`[Skills] dropping removed legacy skill '${raw.type}'`);
    return null;
  }
  if (legacy) {
    return getSkill(legacy.type, raw.parameter ?? legacy.parameter);
  }
  const message = `[Skills] unknown legacy skill name '${raw.type}'`;
  if (IS_DEV) throw new Error(message);
  console.warn(message);
  return null;
}

/** Migrate a persisted skill list, dropping removed/unknown entries. */
export function migrateSkills(
  raw: { type: string; parameter?: string | number }[]
): Skill[] {
  return raw
    .map((skill) => migrateSkill(skill))
    .filter((skill): skill is Skill => skill !== null);
}
