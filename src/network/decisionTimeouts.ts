/**
 * Decisions the coach whose turn it is NOT has to make during the other
 * coach's turn (an uphill block's dice, Stand Firm, an interception, …).
 * While one is open the main turn clock stops and the deciding coach gets a
 * short clock of their own; when it runs out their screen answers with the
 * default below, so a slow or absent decider cannot eat the other coach's
 * turn.
 */

import { HeadlessCommand, PendingDecision } from "../headless/protocol";

/** Seconds the deciding coach gets, per decision. Tune here. */
export const DEFENDER_DECISION_SECONDS: Record<
  PendingDecision["type"],
  number
> = {
  "block-dice": 10,
  reaction: 10,
  interception: 10,
  apothecary: 10,
  reroll: 10,
  "push-direction": 10,
  "follow-up": 10,
  "inducement-choice": 10,
  touchback: 10,
  "kickoff-event": 10,
};

/**
 * What the decider's screen answers when their clock runs out: decline
 * anything optional, otherwise the first option. Null when there is no
 * safe answer to make on their behalf.
 */
export function defaultAnswer(
  pending: PendingDecision
): HeadlessCommand | null {
  switch (pending.type) {
    case "block-dice":
      return pending.choiceStage === "attacker-reroll"
        ? { type: "keep-block-dice", attackerId: pending.attackerId }
        : { type: "choose-block-result", index: 0 };
    case "push-direction": {
      const [first] = pending.options;
      return first
        ? { type: "choose-push-direction", x: first.x, y: first.y }
        : null;
    }
    case "reaction":
      return { type: "use-reaction", accept: false };
    case "reroll":
      return { type: "use-reroll", accept: false };
    case "interception":
      return { type: "choose-interception" };
    case "apothecary":
      return { type: "use-apothecary", accept: false };
    case "follow-up":
      return { type: "choose-follow-up", followUp: false };
    case "touchback":
    case "kickoff-event":
    case "inducement-choice":
      return null;
  }
}
