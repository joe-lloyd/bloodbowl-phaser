import { DecisionService } from "@/game/skills";
import {
  type InducementChoiceDecisionAnswer,
  type RerollSource,
  canChooseBiteTarget,
} from "@/types/decisions";
import { validChoiceAnswer } from "@/game/inducements/matchInducements";

export function answerReroll(
  decisions: DecisionService,
  accept: boolean,
  source?: RerollSource
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "reroll") return false;
  return decisions.answer({ accept, source });
}

export function answerReaction(
  decisions: DecisionService,
  accept: boolean
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "reaction") return false;
  return decisions.answer({ accept });
}

export function answerBiteTarget(
  decisions: DecisionService,
  targetId?: string
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "bite-target") return false;
  if (!canChooseBiteTarget(pending, targetId)) return false;
  return decisions.answer(targetId === undefined ? {} : { targetId });
}

export function answerInterception(
  decisions: DecisionService,
  playerId?: string
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "interception") return false;
  return decisions.answer(playerId === undefined ? {} : { playerId });
}

export function answerApothecary(
  decisions: DecisionService,
  accept: boolean
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "apothecary") return false;
  return decisions.answer({ accept });
}

export function answerInducementChoice(
  decisions: DecisionService,
  answer: InducementChoiceDecisionAnswer
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "inducement-choice") return false;
  const valid = validChoiceAnswer(pending, answer);
  if (!valid) return false;
  return decisions.answer(valid);
}

export function answerFoulAssists(
  decisions: DecisionService,
  count: number
): boolean {
  const pending = decisions.pending();
  if (pending?.type !== "foul-assists") return false;
  if (!Number.isSafeInteger(count) || count < 0 || count > pending.available)
    return false;
  return decisions.answer({ count });
}
