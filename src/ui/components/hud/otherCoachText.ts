import type { StepPrompt } from "../../../types/events";

const ROLL_NAMES: Record<StepPrompt["rolls"][number]["type"], string> = {
  dodge: "Dodge",
  rush: "Rush",
  pickup: "Pick up",
  secureBall: "Secure the Ball",
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
