import type { RefereeCallStep } from "../../../types/events";

type Cause = RefereeCallStep["cause"];
type Argued = Extract<RefereeCallStep, { step: "argued" }>;
type Bribed = Extract<RefereeCallStep, { step: "bribed" }>;
type Outcome = Extract<RefereeCallStep, { step: "outcome" }>;

export const ARGUE_TARGET = "5+";
export const BRIBE_TARGET = "2+";

export function calledLine(name: string, cause: Cause): string {
  return cause === "foul"
    ? `The referee spotted ${name}'s Foul.`
    : `${name}'s Secret Weapon is Sent-off at the end of the drive.`;
}

export function argueDice(step: Argued): string {
  return step.rolls.join(" → ");
}

export function arguedLine(name: string, step: Argued): string {
  const rerolled =
    step.rolls.length > 1 ? "Bribery and Corruption re-rolls the 1. " : "";
  if (!step.swayed) return `${rerolled}The referee ignores the argument.`;
  return step.cause === "foul"
    ? `${rerolled}Swayed! ${name} goes back to their square, but the Turnover stands.`
    : `${rerolled}Swayed! ${name} stays.`;
}

export function bribeOffer(name: string, cause: Cause, held: number): string {
  const keeps =
    cause === "foul"
      ? `keeps ${name} on the pitch and cancels the Turnover`
      : `keeps ${name} for the next drive`;
  return `A ${BRIBE_TARGET} ${keeps}. ${String(held)} Bribe${held === 1 ? "" : "s"} left.`;
}

export function bribedLine(name: string, step: Bribed): string {
  if (!step.works) return "The referee pockets the Bribe.";
  return step.cause === "foul"
    ? `Bribe accepted: ${name} stays, and there is no Turnover.`
    : `Bribe accepted: ${name} stays.`;
}

export function outcomeLine(name: string, step: Outcome): string {
  if (step.result === "sent-off") return `${name} is Sent-off`;
  return step.cause === "foul"
    ? `${name} stays on the pitch`
    : `${name} stays for the next drive`;
}
