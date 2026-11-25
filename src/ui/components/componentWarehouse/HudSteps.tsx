import type { ReactNode } from "react";
import { cx } from "./hudTone";
import { type StepState, stepRowClass } from "./stepRow";

const MARK: Record<StepState, string> = {
  todo: "border border-white/15 text-hud-dim",
  current: "bg-hud-gold text-hud-ink",
  done: "bg-hud-good text-hud-ink",
};

export function StepMark({
  state,
  number,
}: {
  state: StepState;
  number?: number;
}) {
  return (
    <span
      aria-hidden={number === undefined || undefined}
      className={cx(
        "flex h-6 w-6 phone:h-5 phone:w-5 shrink-0 items-center justify-center rounded-hud font-hud-label font-bold leading-none tabular-nums",
        MARK[state]
      )}
    >
      {state === "done" ? "✓" : number}
    </span>
  );
}

export function StepRow({
  state,
  number,
  children,
  ...rest
}: {
  state: StepState;
  number?: number;
  children: ReactNode;
  title?: string;
  "data-testid"?: string;
  "data-satisfied"?: boolean;
}) {
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={stepRowClass(state)}
      {...rest}
    >
      <StepMark state={state} {...(number === undefined ? {} : { number })} />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
