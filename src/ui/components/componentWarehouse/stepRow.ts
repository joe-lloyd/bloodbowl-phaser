import { cx } from "./hudTone";

export type StepState = "todo" | "current" | "done";

const ROW: Record<StepState, string> = {
  todo: "border-white/10 text-hud-dim",
  current: "border-hud-gold bg-hud-gold/15 text-hud-bone",
  done: "border-hud-good/40 text-hud-bone/85",
};

export const stepRowClass = (state: StepState) =>
  cx(
    "flex w-full items-center gap-2 rounded-hud border px-2 py-1 phone:py-0.5 text-left font-hud-body text-hud-sm",
    ROW[state]
  );
