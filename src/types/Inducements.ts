import { type ApothecaryDecisionRequest } from "./decisions";

export const Inducement = {
  TEMP_AGENCY_CHEERLEADER: "Temp Agency Cheerleader",
  PART_TIME_ASSISTANT_COACH: "Part-time Assistant Coach",
  WEATHER_MAGE: "Weather Mage",
  BLITZERS_BEST_KEGS: "Blitzer's Best Kegs",
  SPECIAL_PLAY: "Special Play",
  EXTRA_TEAM_TRAINING: "Extra Team Training",
  BRIBE: "Bribe",
  WANDERING_APOTHECARY: "Wandering Apothecary",
  MORTUARY_ASSISTANT: "Mortuary Assistant",
  PLAGUE_DOCTOR: "Plague Doctor",
  RIOTOUS_ROOKIES: "Riotous Rookies",
  HALFLING_MASTER_CHEF: "Halfling Master Chef",
  MERCENARY_PLAYER: "Mercenary Player",
  JOSEF_BUGMAN: "Infamous Coaching Staff: Josef Bugman",
  KARI_COLDSTEEL: "(In)Famous Coaching Staff: Kari Coldsteel",
  PAPA_SKULLBONES: "(In)Famous Coaching Staff: Papa Skullbones",
  GLANDRIL_SILVERWATER: "(In)Famous Coaching Staff: Glandril Silverwater",
  KROT_SHOCKWHISKER: "(In)Famous Coaching Staff: Krot Shockwhisker",
  AYLEEN_ANDAR: "(In)Famous Coaching Staff: Ayleen Andar",
  PROFESSOR_FRONKELHEIM: "(In)Famous Coaching Staff: Professor Frönkelheim",
  MUNGO_SPINECRACKER: "(In)Famous Coaching Staff: Mungo Spinecracker",
  FINK_DA_FIXER: "(In)Famous Coaching Staff: Fink Da Fixer",
  SCHIELUND_SCHARLITAN: "(In)Famous Coaching Staff: Schielund Scharlitan",
  WIZARD_SPORTS_WIZARD: "Wizard: Sports-Wizard",
  WIZARD_CHAOS_SORCERER: "Wizard: Chaos Sorcerer",
  WIZARD_DRUCHII_SORCERESS: "Wizard: Druchii Sorceress",
  WIZARD_ASUR_HIGH_MAGE: "Wizard: Asur High Mage",
  WIZARD_SLANN_MAGE_PRIEST: "Wizard: Slann Mage Priest",
  WIZARD_HORTICULTURALIST_OF_NURGLE: "Wizard: Horticulturalist of Nurgle",
  WIZARD_SPORTS_NECROTHEURGE: "Wizard: Sports Necrotheurge",
  WIZARD_WICKED_WITCH: "Wizard: Wicked Witch",
  WIZARD_WARLOCK_ENGINEER: "Wizard: Warlock Engineer",
  WIZARD_OGRE_FIREBELLY: "Wizard: Ogre Firebelly",
  WIZARD_NIGHT_GOBLIN_SHAMAN: "Wizard: Night Goblin Shaman",
  WIZARD_HORATIO_X_SCHOTTENHEIM: "Named Wizard: Horatio X. Schottenheim",
  BIASED_REFEREE: "Biased Referee",
  BIASED_REFEREE_RANULF_RED_HOKULI: "Biased Referee: Ranulf 'Red' Hokuli",
  BIASED_REFEREE_THORON_KORENSSON: "Biased Referee: Thoron Korensson",
  BIASED_REFEREE_JORM_THE_OGRE: "Biased Referee: Jorm the Ogre",
  BIASED_REFEREE_TRUNDLEFOOT_TRIPLETS:
    "Biased Referee: The Trundlefoot Triplets",
  WAAAGH_DRUMMER: "WAAAGH! Drummer",
  CAVORTING_NURGLING: "Cavorting Nurgling",
  DWARFEN_RUNESMITH: "Dwarfen Runesmith",
  HALFLING_HOT_POT: "Halfling Hot Pot",
  MASTER_OF_BALLISTICS: "Master of Ballistics",
  BOTTLES_OF_HEADY_BREW: "Bottles of Heady Brew",
  TEAM_MASCOT: "Team Mascot",
  MEDICAL_UNGUENT: "Medical Unguent",
  DESPERATE_MEASURES: "Desperate Measures",
  COLLEGE_WIZARD: "College Wizard",
  GIANT_MERCENARY_PLAYER: "Giant Mercenary Player",
  LESSER_MAGIC_POTION: "Lesser Magic Potion",
  SUPERIOR_MAGIC_POTION: "Superior Magic Potion",
  SAWBONES: "Sawbones",
  SNACK_STAND: "Snack Stand",
  NOVICE_WIZARD: "Novice Wizard",
  MAGIC_POTION: "Magic Potion",
  SOUVENIR: "Souvenir",
  PRAYERS_TO_NUFFLE: "Prayers to Nuffle",
  STAR_PLAYER: "Star Player",
} as const;
export type Inducement = (typeof Inducement)[keyof typeof Inducement];

export interface InducementCatalogEntry {
  inducement: Inducement;
  price: number;

  maxCount: number;
}

export interface InducementSelectionLine {
  inducement: Inducement;
  quantity: number;
}

export interface InducementRuleProfile {
  id: string;
  advancedLeague: boolean;
  starPlayersAllowed: boolean;
}

export interface InducementOffer {
  profile: InducementRuleProfile;
  budgets: Record<string, number>;
  catalogs: Record<string, InducementCatalogEntry[]>;
  selections: Record<string, InducementSelectionLine[]>;
  confirmed: Record<string, boolean>;
}

export interface PregameInducementsState {
  ready: Record<string, boolean>;
  offer?: InducementOffer;

  buyOrder?: [string, string];
  complete?: boolean;

  resolving?: boolean;
}

interface InducementCommandResult {
  ok: boolean;
  errors: string[];
}
export type InducementCommandResponse =
  | InducementCommandResult
  | Promise<InducementCommandResult>;

export function buildSeventsInducementProfile(opts: {
  advancedLeague: boolean;
}): InducementRuleProfile {
  return {
    id: opts.advancedLeague ? "sevens-advanced-league" : "sevens",
    advancedLeague: opts.advancedLeague,
    starPlayersAllowed: false,
  };
}

export interface InducementInventoryEntry {
  inducement: Inducement;
  ownerTeamId: string;
  quantity: number;

  remainingUses: number;

  price: number;
  provenance: "purchased" | "free";
}

export interface MasterChefHalf {
  half: "h1" | "h2";
  rerolls: Record<string, number>;
}

export const PrayerToNuffle = {
  TREACHEROUS_TRAPDOOR: "Treacherous Trapdoor",
  STILETTO: "Stiletto",
  IRON_MAN: "Iron Man",
  KNUCKLE_DUSTERS: "Knuckle Dusters",
  BLESSING_OF_NUFFLE: "Blessing of Nuffle",
  MOLES_UNDER_THE_PITCH: "Moles Under the Pitch",
  UNDER_SCRUTINY: "Under Scrutiny",
  INTENSIVE_TRAINING: "Intensive Training",
} as const;
export type PrayerToNuffle =
  (typeof PrayerToNuffle)[keyof typeof PrayerToNuffle];

export interface PrayerRerollRecord {
  teamId: string;

  rejectedRolls: number[];

  result: number;
  prayer: PrayerToNuffle;
}

export interface InducementsMatchState {
  profile?: InducementRuleProfile;

  budgets: Record<string, number>;

  inventory: InducementInventoryEntry[];

  confirmed: Record<string, boolean>;

  apothecaryUsed: Record<string, boolean>;

  pendingApothecaryDecision?: ApothecaryDecisionRequest;

  decisionSeq: number;

  prayerLog: PrayerRerollRecord[];

  masterChef?: MasterChefHalf;
}

export function emptyInducementsState(): InducementsMatchState {
  return {
    budgets: {},
    inventory: [],
    confirmed: {},
    apothecaryUsed: {},
    decisionSeq: 0,
    prayerLog: [],
  };
}
