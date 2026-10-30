/**
 * Mid-action decision types - a roll path pauses on one of these and resumes
 * with the answer. Shared by the engine (DecisionService), the browser
 * dialogs, and the headless protocol (pendingDecision/reply commands), so
 * skills work identically in local and online play.
 */

/**
 * "pro" = Pro's die-level reroll (3+ usage roll, locks out other sources).
 * "veteran" = the Sevens Veteran's once-per-game re-roll (D8).
 */
export type RerollSource = "skill" | "team" | "pro" | "veteran";

/** Roll kinds a reroll can be offered for ("activation" = negatrait gates). */
export type RerollableRollKind =
  | "dodge"
  | "pickup"
  | "catch"
  | "pass"
  | "rush"
  | "jump"
  | "activation"
  | "gaze";

export interface RerollDecisionRequest {
  type: "reroll";
  playerId: string;
  /** Team whose coach answers (always the rolling player's team). */
  chooserTeamId: string;
  rollKind: RerollableRollKind;
  /**
   * The roll's own name when the kind alone does not say it: an activation
   * roll is a Bone Head, Really Stupid or similar roll.
   */
  rollName?: string;
  /** Sources the coach may spend, skill first when both are available. */
  sources: RerollSource[];
  /** The skill offering its reroll, when a skill source is available. */
  skill?: string;
  /** The failed die result being offered a reroll. */
  roll: number;
  /** D6 face needed after modifiers, including natural 1 and 6. */
  needed?: number;
}

export interface RerollDecisionAnswer {
  accept: boolean;
  /** Which source to spend; defaults to the first offered. */
  source?: RerollSource;
}

/**
 * A reactive skill asks its owner's coach a yes/no question mid-flow
 * (Stand Firm "refuse the push?", Diving Tackle "drop prone to tackle?").
 * The chooser is the REACTING player's team, not the acting team.
 */
export interface ReactionDecisionRequest {
  type: "reaction";
  /** The reacting player (the skill owner) */
  playerId: string;
  chooserTeamId: string;
  skill: string;
  /** Human-readable question shown by the dialog */
  prompt: string;
}

export interface ReactionDecisionAnswer {
  accept: boolean;
}

/** One player the defending coach may pick to attempt an interception. */
export interface InterceptionCandidate {
  playerId: string;
  /** Display name for the dialog (engine-side requests populate this). */
  playerName?: string;
  /** Net modifier the interceptor would roll at (base -3/-2 plus marking). */
  modifier: number;
}

/**
 * After a pass' landing square is fixed, the DEFENDING coach may pick one
 * eligible player (under the Range Ruler) to attempt an interception, or
 * decline. The chooser is the team that does NOT own the passer.
 */
export interface InterceptionDecisionRequest {
  type: "interception";
  chooserTeamId: string;
  /** The passer, for context/logging. */
  passerId: string;
  candidates: InterceptionCandidate[];
}

export interface InterceptionDecisionAnswer {
  /** Chosen interceptor; omit/undefined to decline. */
  playerId?: string;
}

/** Where a Knocked Out result happened — changes the Apothecary patch-up. */
export type ApothecaryLocation = "pitch" | "crowd";

/** The three casualty results a Sevens Apothecary may patch up. */
export type ApothecaryCasualtyType = "badly-hurt" | "seriously-hurt" | "dead";

export type ApothecaryResultKind = "ko" | "casualty";

/**
 * An owned, unused Apothecary is offered once an eligible Knocked Out or
 * casualty result is known, before the player's final placement. Declining
 * leaves the Apothecary available for a later eligible result this match;
 * accepting always consumes it, win or lose the patch-up roll. Carries a
 * stable `id` and every field the resolution needs so a save/resume can
 * re-arm and resolve the same decision without re-rolling anything.
 */
export interface ApothecaryDecisionRequest {
  type: "apothecary";
  id: string;
  /** The injured player's own team; only its coach may answer. */
  chooserTeamId: string;
  playerId: string;
  resultKind: ApothecaryResultKind;
  /** KO only: on-pitch Stunned vs crowd-KO Reserves. */
  location?: ApothecaryLocation;
  /** On-pitch KO only: the square to return the player to if patched up. */
  position?: { x: number; y: number };
  /** Casualty only: which of the three eligible results was rolled. */
  casualtyType?: ApothecaryCasualtyType;
  /** Dead only: who caused the kill, credited if the result stands. */
  killerId?: string;
  /** Dead only: the kill spends the killer's Plague Ridden if it stands. */
  armsPlagueRidden?: boolean;
}

export interface ApothecaryDecisionAnswer {
  accept: boolean;
}

/**
 * A Prayer to Nuffle or Desperate Measure that needs the coach to pick:
 * Iron Man and Knuckle Dusters pick a player, Intensive Training picks a
 * Primary skill for its random player, Hangover picks an opposition player
 * and You Dope! picks a player and ST or AG. Desperate Measures may be
 * declined and kept for later; prayers may not.
 */
export type InducementChoiceKind =
  | "iron-man"
  | "knuckle-dusters"
  | "intensive-training"
  | "hangover"
  | "you-dope";

export type DopeStat = "ST" | "AG";

export interface InducementChoiceDecisionRequest {
  type: "inducement-choice";
  kind: InducementChoiceKind;
  chooserTeamId: string;
  /** Players the coach may pick; Intensive Training's single random player. */
  playerIds: string[];
  /** Intensive Training: the Primary skills the player may learn. */
  skills?: string[];
  /** You Dope!: the characteristics the coach may raise. */
  stats?: DopeStat[];
  /** True when the coach may decline and keep the measure for later. */
  optional: boolean;
}

/** An answer with no playerId declines an optional choice. */
export interface InducementChoiceDecisionAnswer {
  playerId?: string;
  skill?: string;
  stat?: DopeStat;
}

export type DecisionRequest =
  | RerollDecisionRequest
  | ReactionDecisionRequest
  | InterceptionDecisionRequest
  | ApothecaryDecisionRequest
  | InducementChoiceDecisionRequest;
export type DecisionAnswer =
  | RerollDecisionAnswer
  | ReactionDecisionAnswer
  | InterceptionDecisionAnswer
  | ApothecaryDecisionAnswer
  | InducementChoiceDecisionAnswer;
