import type { StepPrompt } from "../../../types/events";
import { ROUTE_ROLL_NAMES } from "../../../game/rules/rollPreview";

const ROLL_NAMES: Record<StepPrompt["rolls"][number]["type"], string> = {
  ...ROUTE_ROLL_NAMES,
  pass: "Pass",
  catch: "Catch",
  armour: "Foul armour",
};

export function stepPromptLine(teamName: string, prompt: StepPrompt): string {
  const rolls = prompt.rolls
    .map((roll) => `${ROLL_NAMES[roll.type]} ${String(roll.target)}+`)
    .join(", then ");
  return `${teamName}: ${rolls}`;
}
