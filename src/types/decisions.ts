/**
 * Mid-action decision types - a roll path pauses on one of these and resumes
 * with the answer. Shared by the engine (DecisionService), the browser
 * dialogs, and the headless protocol (pendingDecision/reply commands), so
 * skills work identically in local and online play.
 */

export type RerollSource = "skill" | "team";

/** Roll kinds a reroll can be offered for. */
export type RerollableRollKind = "dodge" | "pickup" | "catch" | "pass" | "rush";

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

export type DecisionRequest = RerollDecisionRequest | ReactionDecisionRequest;
export type DecisionAnswer = RerollDecisionAnswer | ReactionDecisionAnswer;
