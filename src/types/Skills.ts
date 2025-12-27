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
  // Devious skills
  FUMBLEROOSKIE = "Fumbleoskie",
  STAB = "Stab",
  SHADOWING = "Shadowing",
  DIRTY_PLAYER = "Dirty Player",
  DIRTY_PLAYER_2 = "Dirty Player +2",
  SNEAKY_GIT = "Sneaky Git",
  EYE_GOUGE = "Eye Gouge",
  LONE_FOULER = "Lone Fouler",
  LETHAL_FLIGHT = "Lethal Flight",
  PUT_THE_BOOT_IN = "Put the Boot In",
  QUICK_FOUL = "Quick Foul",
  PILE_DRIVER = "Pile Driver",
  VIOLENT_INNOVATOR = "Violent Innovator",
  SABOTEUR = "Saboteur",

  // General skills
  BLOCK = "Block",
  GUARD = "Guard",
  MIGHTY_BLOW = "Mighty Blow",
  MIGHTY_BLOW_2 = "Mighty Blow (+2)",
  TACKLE = "Tackle",
  STAND_FIRM = "Stand Firm",
  PRO = "Pro",
  DAUNTLESS = "Dauntless",
  FEND = "Fend",
  GIVE_AND_GO = "Give and Go",
  WRESTLE = "Wrestle",
  FRENZY = "Frenzy",
  STRIP_BALL = "Strip Ball",
  KICK = "Kick",
  PORTAL_NAVIGATOR = "Portal Navigator",
  STEADY_FOOTING = "Steady Footing",
  TAUNT = "Taunt",

  // Agility skills
  DODGE = "Dodge",
  CATCH = "Catch",
  SPRINT = "Sprint",
  SURE_FEET = "Sure Feet",
  LEAP = "Leap",
  SIDESTEP = "Side Step",
  ON_THE_BALL = "On The Ball",
  CLOUD_BURSTER = "Cloud Burster",
  DIVING_CATCH = "Diving Catch",
  DIVING_TACKLE = "Diving Tackle",
  HIT_AND_RUN = "Hit and Run",
  JUMP_UP = "Jump Up",
  DEFENSIVE = "Defensive",
  SAFE_PAIR_OF_HANDS = "Safe Pair of Hands",

  // Strength skills
  BREAK_TACKLE = "Break Tackle",
  GRAB = "Grab",
  JUGGERNAUT = "Juggernaut",
  PILING_ON = "Piling On",
  THICK_SKULL = "Thick Skull",
  BRAWLER = "Brawler",
  ARM_BAR = "Arm Bar",
  STRONG_ARM = "Strong Arm",
  MULTIPLE_BLOCK = "Multiple Block",
  BULLSEYE = "Bullseye",

  // Passing skills
  PASS = "Pass",
  ACCURATE = "Accurate",
  SAFE_THROW = "Safe Throw",
  SURE_HANDS = "Sure Hands",
  DUMP_OFF = "Dump-Off",
  SAFE_PASS = "Safe Pass",
  NERVES_OF_STEEL = "Nerves of Steel",
  HAIL_MARY_PASS = "Hail Mary Pass",
  PUNT = "Punt",
  CANNONEER = "Cannoneer",
  LEADER = "Leader",
  RUNNING_PASS = "Running Pass",
  PORTAL_PASSER = "Portal Passer",
  WALL_THROWER = "Wall Thrower",

  // Mutation skills
  HORNS = "Horns",
  CLAWS = "Claws",
  PREHENSILE_TAIL = "Prehensile Tail",
  TENTACLES = "Tentacles",
  BIG_HAND = "Big Hand",
  DISTURBING_PRESENCE = "Disturbing Presence",
  EXTRA_ARMS = "Extra Arms",
  FOUL_APPEARANCE = "Foul Appearance",
  IRON_HARD_SKIN = "Iron Hard Skin",
  MONSTROUS_MOUTH = "Monstrous Mouth",
  TWO_HEADS = "Two Heads",
  VERY_LONG_LEGS = "Very Long Legs",

  // Special/Trait skills
  RIGHT_STUFF = "Right Stuff",
  STUNTY = "Stunty",
  ALWAYS_HUNGRY = "Always Hungry",
  REGENERATION = "Regeneration",
  THROW_TEAMMATE = "Throw Teammate",
  REALLY_STUPID = "Really Stupid",
  PROJECTILE_VOMIT = "Projectile Vomit",
  LONER_4 = "Loner 4+",
  LONER_5 = "Loner 5+",
  LONER_3 = "Loner 3+",
  BONE_HEAD = "Bone Head",
  UNCHANNELLED_FURY = "Unchained Fury",
  SECRET_WEAPON = "Secret Weapon",
  HATRED = "Hatred",
  TAKE_ROOT = "Take Root",
  TIMMM_BER = "Timmm Ber",
  SWOOP = "Swoop",
  BOMBARDIER = "Bombardier",
  CHAINSAW = "Chainsaw",
  NO_BALL = "No Ball",
  BALL_AND_CHAIN = "Ball and Chain",
  POGO_STICK = "Pogo Stick",
  TRICKSTER = "Trickster",
  MY_BALL = "My Ball",
  UNSTEADY = "Unsteady",
  DECAY = "Decay",
  PLAGUE_RIDDEN = "Plague Ridden",
  ANIMAL_SAVAGERY = "Animal Savagery",
  TITCHY = "Titchy",
  INSIGNIFICANT = "Insignificant",
  PICK_ME_UP = "Pick Me Up",
  KICK_TEAM_MATE = "Kick Team-Mate",
  ANIMOSITY = "Animosity",
  ANIMOSITY_ALL = "Animosity (all team-mates)",
  ANIMOSITY_DWARF_HALFLING = "Animosity (all Dwarf and Halfling team-mates)",
  ANIMOSITY_DWARF_HUMAN = "Animosity (all Dwarf and Human team-mates)",
  ANIMOSITY_UNDERWORLD_GOBLIN = "Animosity (Underworld Goblin Linemen)",
  ANIMOSITY_ORC_LINEMAN = "Animosity (Orc Lineman)",
  ANIMOSITY_BIG_UN_BLOCKER = "Animosity (Big Un Blocker)",
  BLOODLUST_2 = "Bloodlust (2+)",
  BLOODLUST_3 = "Bloodlust (3+)",
  HYPNOTIC_GAZE = "Hypnotic Gaze",
  DRUNKARD = "Drunkard",
  BREATHE_FIRE = "Breathe Fire",
  SWARMING = "Swarming",
}

/**
 * Skill interface
 */
export interface Skill {
  type: SkillType;
  category: SkillCategory;
  description: string;
}

/**
 * Skill definitions database
 */
export const SKILL_DEFINITIONS: Record<SkillType, Skill> = {
  [SkillType.SAFE_PASS]: {
    type: SkillType.SAFE_PASS,
    category: SkillCategory.PASSING,
    description: "placeholer",
  },
  [SkillType.DIRTY_PLAYER_2]: {
    type: SkillType.DIRTY_PLAYER_2,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.LONER_4]: {
    type: SkillType.LONER_4,
    category: SkillCategory.PASSING,
    description: "placeholer",
  },
  [SkillType.BONE_HEAD]: {
    type: SkillType.BONE_HEAD,
    category: SkillCategory.MUTATION,
    description: "placeholer",
  },
  [SkillType.BRAWLER]: {
    type: SkillType.BRAWLER,
    category: SkillCategory.STRENGTH,
    description: "placeholer",
  },
  [SkillType.JUGGERNAUT]: {
    type: SkillType.JUGGERNAUT,
    category: SkillCategory.STRENGTH,
    description: "placeholer",
  },
  [SkillType.NERVES_OF_STEEL]: {
    type: SkillType.NERVES_OF_STEEL,
    category: SkillCategory.PASSING,
    description: "placeholer",
  },
  [SkillType.ARM_BAR]: {
    type: SkillType.ARM_BAR,
    category: SkillCategory.STRENGTH,
    description: "placeholer",
  },
  [SkillType.JUMP_UP]: {
    type: SkillType.JUMP_UP,
    category: SkillCategory.PASSING,
    description: "placeholer",
  },
  [SkillType.DEFENSIVE]: {
    type: SkillType.DEFENSIVE,
    category: SkillCategory.STRENGTH,
    description: "placeholer",
  },
  [SkillType.HIT_AND_RUN]: {
    type: SkillType.HIT_AND_RUN,
    category: SkillCategory.DEVIOUS,
    description: "placeholer",
  },
  [SkillType.ON_THE_BALL]: {
    type: SkillType.ON_THE_BALL,
    category: SkillCategory.AGILITY,
    description: "placeholer",
  },
  [SkillType.BLOCK]: {
    type: SkillType.BLOCK,
    category: SkillCategory.GENERAL,
    description: "Ignore Both Down results unless opponent also has Block",
  },
  [SkillType.DODGE]: {
    type: SkillType.DODGE,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed dodge per turn",
  },
  [SkillType.SURE_HANDS]: {
    type: SkillType.SURE_HANDS,
    category: SkillCategory.PASSING,
    description: "Re-roll one failed pick-up per turn",
  },
  [SkillType.CATCH]: {
    type: SkillType.CATCH,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed catch per turn",
  },
  [SkillType.PASS]: {
    type: SkillType.PASS,
    category: SkillCategory.PASSING,
    description: "Re-roll one failed pass per turn",
  },
  [SkillType.GUARD]: {
    type: SkillType.GUARD,
    category: SkillCategory.GENERAL,
    description: "Assists count even when marked by opponent",
  },
  [SkillType.MIGHTY_BLOW]: {
    type: SkillType.MIGHTY_BLOW,
    category: SkillCategory.GENERAL,
    description: "+1 to armor and injury rolls",
  },
  [SkillType.UNCHANNELLED_FURY]: {
    type: SkillType.UNCHANNELLED_FURY,
    category: SkillCategory.MUTATION,
    description: "placeholer",
  },
  [SkillType.HORNS]: {
    type: SkillType.HORNS,
    category: SkillCategory.MUTATION,
    description: "placeholer",
  },
  [SkillType.TACKLE]: {
    type: SkillType.TACKLE,
    category: SkillCategory.GENERAL,
    description: "Opponent cannot use Dodge skill",
  },
  [SkillType.STAND_FIRM]: {
    type: SkillType.STAND_FIRM,
    category: SkillCategory.GENERAL,
    description: "Cannot be pushed back",
  },
  [SkillType.PRO]: {
    type: SkillType.PRO,
    category: SkillCategory.GENERAL,
    description: "Re-roll any action once per turn (4+ required)",
  },
  [SkillType.SPRINT]: {
    type: SkillType.SPRINT,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed GFI per turn",
  },
  [SkillType.SURE_FEET]: {
    type: SkillType.SURE_FEET,
    category: SkillCategory.AGILITY,
    description: "Re-roll one failed GFI per turn",
  },
  [SkillType.LEAP]: {
    type: SkillType.LEAP,
    category: SkillCategory.AGILITY,
    description: "Jump over adjacent players",
  },
  [SkillType.SIDESTEP]: {
    type: SkillType.SIDESTEP,
    category: SkillCategory.AGILITY,
    description: "Choose which square to be pushed to",
  },
  [SkillType.BREAK_TACKLE]: {
    type: SkillType.BREAK_TACKLE,
    category: SkillCategory.STRENGTH,
    description: "Use ST instead of AG for dodge rolls",
  },
  [SkillType.GRAB]: {
    type: SkillType.GRAB,
    category: SkillCategory.STRENGTH,
    description: "Choose which square to push opponent to",
  },
  [SkillType.PILING_ON]: {
    type: SkillType.PILING_ON,
    category: SkillCategory.STRENGTH,
    description: "Re-roll injury roll after a block",
  },
  [SkillType.THICK_SKULL]: {
    type: SkillType.THICK_SKULL,
    category: SkillCategory.STRENGTH,
    description: "+1 to injury roll when knocked down",
  },
  [SkillType.ACCURATE]: {
    type: SkillType.ACCURATE,
    category: SkillCategory.PASSING,
    description: "+1 to pass rolls",
  },
  [SkillType.SAFE_THROW]: {
    type: SkillType.SAFE_THROW,
    category: SkillCategory.PASSING,
    description: "No turnover on failed pass",
  },
  [SkillType.DUMP_OFF]: {
    type: SkillType.DUMP_OFF,
    category: SkillCategory.PASSING,
    description: "Quick pass when blocked",
  },
  [SkillType.FRENZY]: {
    type: SkillType.FRENZY,
    category: SkillCategory.GENERAL,
    description: "Must make two blocks if first pushes back",
  },
  [SkillType.DIRTY_PLAYER]: {
    type: SkillType.DIRTY_PLAYER,
    category: SkillCategory.GENERAL,
    description: "+1 to armor roll when fouling",
  },
  [SkillType.STRIP_BALL]: {
    type: SkillType.STRIP_BALL,
    category: SkillCategory.GENERAL,
    description: "Force ball drop on Push result",
  },
  [SkillType.WRESTLE]: {
    type: SkillType.WRESTLE,
    category: SkillCategory.GENERAL,
    description: "Both Down always applies",
  },
  [SkillType.RIGHT_STUFF]: {
    type: SkillType.RIGHT_STUFF,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.STUNTY]: {
    type: SkillType.STUNTY,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.ALWAYS_HUNGRY]: {
    type: SkillType.ALWAYS_HUNGRY,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.REGENERATION]: {
    type: SkillType.REGENERATION,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.THROW_TEAMMATE]: {
    type: SkillType.THROW_TEAMMATE,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.REALLY_STUPID]: {
    type: SkillType.REALLY_STUPID,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.STEADY_FOOTING]: {
    type: SkillType.STEADY_FOOTING,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.PROJECTILE_VOMIT]: {
    type: SkillType.PROJECTILE_VOMIT,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.DAUNTLESS]: {
    type: SkillType.DAUNTLESS,
    category: SkillCategory.GENERAL,
    description: "placeholer",
  },
  [SkillType.FUMBLEROOSKIE]: {
    type: SkillType.FUMBLEROOSKIE,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.STAB]: {
    type: SkillType.STAB,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.SHADOWING]: {
    type: SkillType.SHADOWING,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.SNEAKY_GIT]: {
    type: SkillType.SNEAKY_GIT,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.EYE_GOUGE]: {
    type: SkillType.EYE_GOUGE,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.LONE_FOULER]: {
    type: SkillType.LONE_FOULER,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.LETHAL_FLIGHT]: {
    type: SkillType.LETHAL_FLIGHT,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.PUT_THE_BOOT_IN]: {
    type: SkillType.PUT_THE_BOOT_IN,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.QUICK_FOUL]: {
    type: SkillType.QUICK_FOUL,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.PILE_DRIVER]: {
    type: SkillType.PILE_DRIVER,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.VIOLENT_INNOVATOR]: {
    type: SkillType.VIOLENT_INNOVATOR,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.SABOTEUR]: {
    type: SkillType.SABOTEUR,
    category: SkillCategory.DEVIOUS,
    description: "placeholder",
  },
  [SkillType.KICK]: {
    type: SkillType.KICK,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.PORTAL_NAVIGATOR]: {
    type: SkillType.PORTAL_NAVIGATOR,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.TAUNT]: {
    type: SkillType.TAUNT,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.SAFE_PAIR_OF_HANDS]: {
    type: SkillType.SAFE_PAIR_OF_HANDS,
    category: SkillCategory.AGILITY,
    description: "placeholder",
  },
  [SkillType.MULTIPLE_BLOCK]: {
    type: SkillType.MULTIPLE_BLOCK,
    category: SkillCategory.STRENGTH,
    description: "placeholder",
  },
  [SkillType.BULLSEYE]: {
    type: SkillType.BULLSEYE,
    category: SkillCategory.STRENGTH,
    description: "placeholder",
  },
  [SkillType.CANNONEER]: {
    type: SkillType.CANNONEER,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.LEADER]: {
    type: SkillType.LEADER,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.RUNNING_PASS]: {
    type: SkillType.RUNNING_PASS,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.PORTAL_PASSER]: {
    type: SkillType.PORTAL_PASSER,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.WALL_THROWER]: {
    type: SkillType.WALL_THROWER,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.BIG_HAND]: {
    type: SkillType.BIG_HAND,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.EXTRA_ARMS]: {
    type: SkillType.EXTRA_ARMS,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.MONSTROUS_MOUTH]: {
    type: SkillType.MONSTROUS_MOUTH,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.TWO_HEADS]: {
    type: SkillType.TWO_HEADS,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.VERY_LONG_LEGS]: {
    type: SkillType.VERY_LONG_LEGS,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.FEND]: {
    type: SkillType.FEND,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.GIVE_AND_GO]: {
    type: SkillType.GIVE_AND_GO,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.CLOUD_BURSTER]: {
    type: SkillType.CLOUD_BURSTER,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.DIVING_CATCH]: {
    type: SkillType.DIVING_CATCH,
    category: SkillCategory.AGILITY,
    description: "placeholder",
  },
  [SkillType.DIVING_TACKLE]: {
    type: SkillType.DIVING_TACKLE,
    category: SkillCategory.AGILITY,
    description: "placeholder",
  },
  [SkillType.HAIL_MARY_PASS]: {
    type: SkillType.HAIL_MARY_PASS,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.PUNT]: {
    type: SkillType.PUNT,
    category: SkillCategory.PASSING,
    description: "placeholder",
  },
  [SkillType.CLAWS]: {
    type: SkillType.CLAWS,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.PREHENSILE_TAIL]: {
    type: SkillType.PREHENSILE_TAIL,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.TENTACLES]: {
    type: SkillType.TENTACLES,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.SECRET_WEAPON]: {
    type: SkillType.SECRET_WEAPON,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.HATRED]: {
    type: SkillType.HATRED,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.TAKE_ROOT]: {
    type: SkillType.TAKE_ROOT,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.TIMMM_BER]: {
    type: SkillType.TIMMM_BER,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.SWOOP]: {
    type: SkillType.SWOOP,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.BOMBARDIER]: {
    type: SkillType.BOMBARDIER,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.CHAINSAW]: {
    type: SkillType.CHAINSAW,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.NO_BALL]: {
    type: SkillType.NO_BALL,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.BALL_AND_CHAIN]: {
    type: SkillType.BALL_AND_CHAIN,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.POGO_STICK]: {
    type: SkillType.POGO_STICK,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.TRICKSTER]: {
    type: SkillType.TRICKSTER,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.MY_BALL]: {
    type: SkillType.MY_BALL,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.FOUL_APPEARANCE]: {
    type: SkillType.FOUL_APPEARANCE,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.UNSTEADY]: {
    type: SkillType.UNSTEADY,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.DECAY]: {
    type: SkillType.DECAY,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.PLAGUE_RIDDEN]: {
    type: SkillType.PLAGUE_RIDDEN,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMAL_SAVAGERY]: {
    type: SkillType.ANIMAL_SAVAGERY,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.TITCHY]: {
    type: SkillType.TITCHY,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.INSIGNIFICANT]: {
    type: SkillType.INSIGNIFICANT,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.PICK_ME_UP]: {
    type: SkillType.PICK_ME_UP,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.KICK_TEAM_MATE]: {
    type: SkillType.KICK_TEAM_MATE,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY_ALL]: {
    type: SkillType.ANIMOSITY_ALL,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY_UNDERWORLD_GOBLIN]: {
    type: SkillType.ANIMOSITY_UNDERWORLD_GOBLIN,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.BLOODLUST_2]: {
    type: SkillType.BLOODLUST_2,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.BLOODLUST_3]: {
    type: SkillType.BLOODLUST_3,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.HYPNOTIC_GAZE]: {
    type: SkillType.HYPNOTIC_GAZE,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.DRUNKARD]: {
    type: SkillType.DRUNKARD,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.BREATHE_FIRE]: {
    type: SkillType.BREATHE_FIRE,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.DISTURBING_PRESENCE]: {
    type: SkillType.DISTURBING_PRESENCE,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.IRON_HARD_SKIN]: {
    type: SkillType.IRON_HARD_SKIN,
    category: SkillCategory.MUTATION,
    description: "placeholder",
  },
  [SkillType.STRONG_ARM]: {
    type: SkillType.STRONG_ARM,
    category: SkillCategory.STRENGTH,
    description: "placeholder",
  },
  // Special/Trait skills (all remaining)
  [SkillType.LONER_5]: {
    type: SkillType.LONER_5,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.LONER_3]: {
    type: SkillType.LONER_3,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.MIGHTY_BLOW_2]: {
    type: SkillType.MIGHTY_BLOW_2,
    category: SkillCategory.STRENGTH,
    description: "placeholder",
  },
  [SkillType.SWARMING]: {
    type: SkillType.SWARMING,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY]: {
    type: SkillType.ANIMOSITY,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY_DWARF_HALFLING]: {
    type: SkillType.ANIMOSITY_DWARF_HALFLING,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY_DWARF_HUMAN]: {
    type: SkillType.ANIMOSITY_DWARF_HUMAN,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY_ORC_LINEMAN]: {
    type: SkillType.ANIMOSITY_ORC_LINEMAN,
    category: SkillCategory.GENERAL,
    description: "placeholder",
  },
  [SkillType.ANIMOSITY_BIG_UN_BLOCKER]: {
    type: SkillType.ANIMOSITY_BIG_UN_BLOCKER,
    category: SkillCategory.GENERAL,
    description: "placeholder",
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
