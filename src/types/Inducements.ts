/**
 * Inducements for Blood Bowl teams
 */

import { ApothecaryDecisionRequest } from "./decisions";

export enum Inducement {
  TEMP_AGENCY_CHEERLEADER = "Temp Agency Cheerleader",
  PART_TIME_ASSISTANT_COACH = "Part-time Assistant Coach",
  WEATHER_MAGE = "Weather Mage",
  BLITZERS_BEST_KEGS = "Blitzer's Best Kegs",
  SPECIAL_PLAY = "Special Play",
  EXTRA_TEAM_TRAINING = "Extra Team Training",
  BRIBE = "Bribe",
  WANDERING_APOTHECARY = "Wandering Apothecary",
  MORTUARY_ASSISTANT = "Mortuary Assistant",
  PLAGUE_DOCTOR = "Plague Doctor",
  RIOTOUS_ROOKIES = "Riotous Rookies",
  HALFLING_MASTER_CHEF = "Halfling Master Chef",
  MERCENARY_PLAYER = "Mercenary Player",
  JOSEF_BUGMAN = "Infamous Coaching Staff: Josef Bugman",
  KARI_COLDSTEEL = "(In)Famous Coaching Staff: Kari Coldsteel",
  PAPA_SKULLBONES = "(In)Famous Coaching Staff: Papa Skullbones",
  GLANDRIL_SILVERWATER = "(In)Famous Coaching Staff: Glandril Silverwater",
  KROT_SHOCKWHISKER = "(In)Famous Coaching Staff: Krot Shockwhisker",
  AYLEEN_ANDAR = "(In)Famous Coaching Staff: Ayleen Andar",
  PROFESSOR_FRONKELHEIM = "(In)Famous Coaching Staff: Professor Frönkelheim",
  MUNGO_SPINECRACKER = "(In)Famous Coaching Staff: Mungo Spinecracker",
  FINK_DA_FIXER = "(In)Famous Coaching Staff: Fink Da Fixer",
  SCHIELUND_SCHARLITAN = "(In)Famous Coaching Staff: Schielund Scharlitan",
  WIZARD_SPORTS_WIZARD = "Wizard: Sports-Wizard",
  WIZARD_CHAOS_SORCERER = "Wizard: Chaos Sorcerer",
  WIZARD_DRUCHII_SORCERESS = "Wizard: Druchii Sorceress",
  WIZARD_ASUR_HIGH_MAGE = "Wizard: Asur High Mage",
  WIZARD_SLANN_MAGE_PRIEST = "Wizard: Slann Mage Priest",
  WIZARD_HORTICULTURALIST_OF_NURGLE = "Wizard: Horticulturalist of Nurgle",
  WIZARD_SPORTS_NECROTHEURGE = "Wizard: Sports Necrotheurge",
  WIZARD_WICKED_WITCH = "Wizard: Wicked Witch",
  WIZARD_WARLOCK_ENGINEER = "Wizard: Warlock Engineer",
  WIZARD_OGRE_FIREBELLY = "Wizard: Ogre Firebelly",
  WIZARD_NIGHT_GOBLIN_SHAMAN = "Wizard: Night Goblin Shaman",
  WIZARD_HORATIO_X_SCHOTTENHEIM = "Named Wizard: Horatio X. Schottenheim",
  BIASED_REFEREE = "Biased Referee",
  BIASED_REFEREE_RANULF_RED_HOKULI = "Biased Referee: Ranulf 'Red' Hokuli",
  BIASED_REFEREE_THORON_KORENSSON = "Biased Referee: Thoron Korensson",
  BIASED_REFEREE_JORM_THE_OGRE = "Biased Referee: Jorm the Ogre",
  BIASED_REFEREE_TRUNDLEFOOT_TRIPLETS = "Biased Referee: The Trundlefoot Triplets",
  WAAAGH_DRUMMER = "WAAAGH! Drummer",
  CAVORTING_NURGLING = "Cavorting Nurgling",
  DWARFEN_RUNESMITH = "Dwarfen Runesmith",
  HALFLING_HOT_POT = "Halfling Hot Pot",
  MASTER_OF_BALLISTICS = "Master of Ballistics",
  BOTTLES_OF_HEADY_BREW = "Bottles of Heady Brew",
  TEAM_MASCOT = "Team Mascot",
  MEDICAL_UNGUENT = "Medical Unguent",
  DESPERATE_MEASURES = "Desperate Measures",
  COLLEGE_WIZARD = "College Wizard",
  GIANT_MERCENARY_PLAYER = "Giant Mercenary Player",
  LESSER_MAGIC_POTION = "Lesser Magic Potion",
  SUPERIOR_MAGIC_POTION = "Superior Magic Potion",
  SAWBONES = "Sawbones",
  SNACK_STAND = "Snack Stand",
  NOVICE_WIZARD = "Novice Wizard",
  PRAYERS_TO_NUFFLE = "Prayers to Nuffle",
  STAR_PLAYER = "Star Player",
}

/** A single purchasable line in a team's inducement catalogue. */
export interface InducementCatalogEntry {
  inducement: Inducement;
  price: number;
  /** Highest quantity a team may buy. */
  maxCount: number;
}

/** One team's requested purchase; quantity 0 is legal and removes a line. */
export interface InducementSelectionLine {
  inducement: Inducement;
  quantity: number;
}

/**
 * The match-wide inducement rules. Each team's catalogue depends on its
 * roster, so it is built per team in game/inducements/catalog.ts.
 */
export interface InducementRuleProfile {
  /** Lookup/debug key, e.g. "sevens" or "sevens-advanced-league". */
  id: string;
  /** Advanced League Sevens keeps Prayers to Nuffle results 10-13. */
  advancedLeague: boolean;
  starPlayersAllowed: boolean;
  /** Prayers to Nuffle results that are rerolled until legal; empty = none. */
  prayersRerollResults: number[];
}

/** The pregame offer: each team's catalogue, budget and current selection. */
export interface InducementOffer {
  profile: InducementRuleProfile;
  budgets: Record<string, number>;
  catalogs: Record<string, InducementCatalogEntry[]>;
  selections: Record<string, InducementSelectionLine[]>;
  confirmed: Record<string, boolean>;
}

/** Prayers to Nuffle results rerolled outside Advanced League (2025 p.36). */
export const SEVENS_RESTRICTED_PRAYERS = [10, 11, 12, 13] as const;

/**
 * Build the Sevens inducement rule profile. Prayers to Nuffle results
 * 10-13 are only rerolled outside Advanced League play, unless the
 * competition profile explicitly restricts them there too.
 */
export function buildSeventsInducementProfile(opts: {
  advancedLeague: boolean;
  /** Advanced League still restricting 10-13 is a competition-level override. */
  restrictPrayersInAdvancedLeague?: boolean;
}): InducementRuleProfile {
  const restrictPrayers =
    !opts.advancedLeague || opts.restrictPrayersInAdvancedLeague === true;
  return {
    id: opts.advancedLeague ? "sevens-advanced-league" : "sevens",
    advancedLeague: opts.advancedLeague,
    starPlayersAllowed: false,
    prayersRerollResults: restrictPrayers ? [...SEVENS_RESTRICTED_PRAYERS] : [],
  };
}

/** One confirmed purchase or free grant, copied into match-scoped state. */
export interface InducementInventoryEntry {
  inducement: Inducement;
  ownerTeamId: string;
  quantity: number;
  /** Uses left this match; starts equal to quantity. */
  remainingUses: number;
  /** Total gold spent across `quantity` (0 for a free/granted inducement). */
  price: number;
  provenance: "purchased" | "free";
}

/**
 * Team re-rolls the Halfling Master Chef moved this half: + for the chef's
 * team, - for the opposition. Keyed by half so it lapses at half-time.
 */
export interface MasterChefHalf {
  half: "h1" | "h2";
  rerolls: Record<string, number>;
}

/** One resolved Prayers to Nuffle roll, including any rejected rerolls. */
export interface PrayerRerollRecord {
  teamId: string;
  /** Rolls rerolled for landing on a restricted result, in order rolled. */
  rejectedRolls: number[];
  /** The final, accepted result. */
  result: number;
}

/**
 * All inducement/Apothecary state scoped to this match — resolved once at
 * pregame confirmation and carried in GameState so saves, online snapshots,
 * and headless resumes all see the same inventory, uses, and pending
 * decision (design.md "Persist a match-scoped inducement inventory").
 */
export interface InducementsMatchState {
  /** The resolved rule profile this match's offers were built from. */
  profile?: InducementRuleProfile;
  /** Petty-cash budget resolved once at pregame, per team id. */
  budgets: Record<string, number>;
  /** Confirmed purchases and free grants, match-scoped (not the roster). */
  inventory: InducementInventoryEntry[];
  /** Whether each team has confirmed its pregame selection. */
  confirmed: Record<string, boolean>;
  /** Whether each team's Apothecary has been consumed this match. */
  apothecaryUsed: Record<string, boolean>;
  /** The single in-flight Apothecary decision, if any. */
  pendingApothecaryDecision?: ApothecaryDecisionRequest;
  /** Monotonic counter for stable, deterministic decision ids. */
  decisionSeq: number;
  /** Every resolved Prayers to Nuffle roll, in order. */
  prayerLog: PrayerRerollRecord[];
  /** The Halfling Master Chef's re-roll swing for the current half. */
  masterChef?: MasterChefHalf;
}

/** A fresh, empty match-scoped inducements state. */
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
