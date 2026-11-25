import React from "react";
import { cx, type HudTone } from "./hudTone";
import { Eyebrow, Panel } from "./HudPanel";

type DialogPlacement = "center" | "dock";

const BACKDROP = {
  light:
    "bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]",
  heavy: "bg-black/70 backdrop-blur-[2px]",
};

export function DialogShell({
  testId,
  tone = "gold",
  eyebrow,
  title,
  titleAs = "h2",
  children,
  actions,
  placement = "dock",
  zClass = "z-[100]",
  backdrop = "light",
  className,
}: {
  testId?: string;
  tone?: HudTone;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleAs?: "h1" | "h2" | "h3";
  children?: React.ReactNode;
  actions?: React.ReactNode;
  placement?: DialogPlacement;
  zClass?: string;
  backdrop?: keyof typeof BACKDROP;
  className?: string;
}) {
  const Heading = titleAs;
  const docked = placement === "dock";
  return (
    <div
      data-testid={testId}
      data-hotkey-scope=""
      data-decision-dialog={docked ? "" : undefined}
      className={cx(
        "pointer-events-auto",
        docked
          ? "w-full"
          : cx(
              "absolute inset-0 flex items-center justify-center px-4",
              BACKDROP[backdrop]
            ),
        zClass
      )}
    >
      <Panel
        accent={tone}
        className={cx(
          "max-w-full animate-hud-pop",
          docked
            ? "w-full"
            : "hud-scroll max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[440px] overflow-y-auto",
          className
        )}
      >
        <div
          data-panel-header=""
          className="border-b border-hud-gold/20 px-3 py-1.5 phone:px-2 phone:py-1"
        >
          {eyebrow && (
            <Eyebrow tone={tone === "gold" ? undefined : tone}>
              {eyebrow}
            </Eyebrow>
          )}
          <Heading className="font-hud-display text-hud-lg uppercase tracking-[0.04em] text-hud-bone">
            {title}
          </Heading>
        </div>
        <div className="p-3 phone:p-2">
          {children && (
            <div className="font-hud-body text-hud-base text-hud-bone phone:text-hud-sm">
              {children}
            </div>
          )}
          {actions && <div className="mt-3 phone:mt-2">{actions}</div>}
        </div>
      </Panel>
    </div>
  );
}

export function DialogActions({
  children,
  stack = false,
}: {
  children: React.ReactNode;
  stack?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex gap-2",
        stack ? "flex-col" : "flex-wrap [&>button]:flex-auto"
      )}
    >
      {children}
    </div>
  );
}
