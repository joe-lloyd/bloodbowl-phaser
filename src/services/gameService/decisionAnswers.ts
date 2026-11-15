/**
 * Answers to the decision a match waits on, from a dialog or a protocol
 * reply. Each is false when no decision of its type is pending or the
 * answer is not one it offered.
 */

import { DecisionService } from "@/game/skills";
import {
  InducementChoiceDecisionAnswer,
  RerollSource,
} from "@/types/decisions";
import { validChoiceAnswer } from "@/game/inducements/matchInducements";

export function answerReroll(
  decisions: DecisionService,
  accept: boolean,
  source?: RerollSource
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "reroll") return false;
  return decisions.answer({ accept, source });
}

export function answerReaction(
  decisions: DecisionService,
  accept: boolean
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "reaction") return false;
  return decisions.answer({ accept });
}

/**
 * The Thrall Lineman a Bloodlust player bites, or undefined to bite nobody.
 * False when the player is not one of the offered targets.
 */
export function answerBiteTarget(
  decisions: DecisionService,
  targetId?: string
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "bite-target") return false;
  if (targetId !== undefined && !pending.targetIds.includes(targetId))
    return false;
  return decisions.answer({ targetId });
}

/** The defending coach's chosen interceptor, or undefined to decline. */
export function answerInterception(
  decisions: DecisionService,
  playerId?: string
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "interception") return false;
  return decisions.answer({ playerId });
}

export function answerApothecary(
  decisions: DecisionService,
  accept: boolean
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "apothecary") return false;
  return decisions.answer({ accept });
}

/** A Prayer or Desperate Measure choice. */
export function answerInducementChoice(
  decisions: DecisionService,
  answer: InducementChoiceDecisionAnswer
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "inducement-choice") return false;
  const valid = validChoiceAnswer(pending, answer);
  if (!valid) return false;
  return decisions.answer(valid);
}

/** How many Offensive Assists add +1 to a Foul. */
export function answerFoulAssists(
  decisions: DecisionService,
  count: number
): boolean {
  const pending = decisions.pending();
  if (!pending || pending.type !== "foul-assists") return false;
  if (!Number.isInteger(count) || count < 0 || count > pending.available)
    return false;
  return decisions.answer({ count });
}
