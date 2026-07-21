/**
 * Mid-action decision types - a roll path pauses on one of these and resumes
 * with the answer. Shared by the engine (DecisionService), the browser
 * dialogs, and the headless protocol (pendingDecision/reply commands), so
 * skills work identically in local and online play.
 */

/** "pro" = Pro's die-level reroll (3+ usage roll, locks out other sources). */
export type RerollSource = "skill" | "team" | "pro";

/** Roll kinds a reroll can be offered for ("activation" = negatrait gates). */
export type RerollableRollKind =
  | "dodge"
  | "pickup"
  | "catch"
  | "pass"
  | "rush"
  | "activation";

export interface RerollDecisionRequest {
  type: "reroll";
  playerId: string;
  /** Team whose coach answers (always the rolling player's team). */
  chooserTeamId: string;
  rollKind: RerollableRollKind;
  /** Sources the coach may spend, skill first when both are available. */
  sources: RerollSource[];
  /** The skill offering its reroll, when a skill source is available. */
  skill?: string;
  /** The failed die result being offered a reroll. */
  roll: number;
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

export type DecisionRequest =
  | RerollDecisionRequest
  | ReactionDecisionRequest
  | InterceptionDecisionRequest;
export type DecisionAnswer =
  | RerollDecisionAnswer
  | ReactionDecisionAnswer
  | InterceptionDecisionAnswer;
