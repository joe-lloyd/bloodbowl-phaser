import {
  type HeadlessCommand,
  type PendingDecision,
} from "../headless/protocol";
import { type InducementChoiceKind } from "../types/decisions";

export const DEFENDER_DECISION_SECONDS: Record<
  PendingDecision["type"],
  number
> = {
  "block-dice": 10,
  reaction: 10,
  "bite-target": 10,
  interception: 10,
  apothecary: 10,
  reroll: 10,
  "push-direction": 10,
  "follow-up": 10,
  "inducement-choice": 10,
  "foul-assists": 10,
  touchback: 10,
  "kickoff-event": 10,
  "reserve-move": 10,
};

type Decision<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

function blockDiceDefault(pending: Decision<"block-dice">): HeadlessCommand {
  return pending.choiceStage === "attacker-reroll"
    ? { type: "keep-block-dice", attackerId: pending.attackerId }
    : { type: "choose-block-result", index: 0 };
}

function pushDefault(
  pending: Decision<"push-direction">
): HeadlessCommand | null {
  const [first] = pending.options;
  return first
    ? { type: "choose-push-direction", x: first.x, y: first.y }
    : null;
}

const DECLINED_BY_DEFAULT: ReadonlySet<InducementChoiceKind> = new Set([
  "sports-wizard",
  "magic-potion",
  "lesser-magic-potion",
  "superior-magic-potion",
  "souvenir",
  "novice-wizard",
]);

function inducementDefault(
  pending: Decision<"inducement-choice">
): HeadlessCommand | null {
  return DECLINED_BY_DEFAULT.has(pending.kind)
    ? { type: "choose-inducement" }
    : null;
}

const fixedAnswers: Partial<Record<PendingDecision["type"], HeadlessCommand>> = {
  reaction: { type: "use-reaction", accept: false },
  reroll: { type: "use-reroll", accept: false },
  interception: { type: "choose-interception" },
  apothecary: { type: "use-apothecary", accept: false },
  "follow-up": { type: "choose-follow-up", followUp: false },
  "reserve-move": { type: "keep-reserves" },
};

export function defaultAnswer(pending: PendingDecision): HeadlessCommand | null {
  const fixed = fixedAnswers[pending.type];
  if (fixed) return { ...fixed };
  if (pending.type === "bite-target") {
    const target = pending.targetIds[0];
    return pending.purpose === "squig-block" && target
      ? { type: "choose-bite-target", playerId: target }
      : { type: "choose-bite-target" };
  }
  if (pending.type === "block-dice") return blockDiceDefault(pending);
  if (pending.type === "push-direction") return pushDefault(pending);
  if (pending.type === "inducement-choice") return inducementDefault(pending);
  if (pending.type === "foul-assists") return { type: "choose-foul-assists", count: pending.available };
  return null;
}
