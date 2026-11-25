import React from "react";
import { cx, type HudTone } from "./hudTone";
import { Eyebrow, Panel } from "./HudPanel";

type DialogPlacement = "top" | "center" | "dock";

const OVERLAY = "absolute inset-0 flex justify-center px-4 pointer-events-auto";

const PLACEMENT: Record<DialogPlacement, string> = {
  top: `${OVERLAY} items-start pt-44 [@media(max-height:500px)]:pt-14`,
  center: `${OVERLAY} items-center`,
  dock: "w-full pointer-events-auto",
};

const PANEL_HEADER =
  "border-b border-hud-gold/20 px-3 py-1.5 phone:px-2 phone:py-1";

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
  width = "w-[440px]",
  placement = "top",
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
  width?: string;
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
      data-decision-dialog={placement === "dock" ? "" : undefined}
      className={cx(
        PLACEMENT[placement],
        placement !== "dock" && BACKDROP[backdrop],
        zClass
      )}
    >
      <Panel
        accent={tone}
        className={cx(
          "max-w-full animate-hud-pop",
          docked
            ? "w-full"
            : `px-6 pb-5 pt-5 ${width} max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:py-3`,
          className
        )}
      >
        <div
          data-panel-header={docked ? "" : undefined}
          className={cx(docked && PANEL_HEADER)}
        >
          {eyebrow && (
            <Eyebrow tone={tone === "gold" ? undefined : tone}>
              {eyebrow}
            </Eyebrow>
          )}
          <Heading
            className={cx(
              "font-hud-display uppercase text-hud-bone",
              docked
                ? "text-hud-lg tracking-[0.04em]"
                : "mt-1 text-hud-2xl tracking-[0.02em] phone:mt-0 phone:text-hud-xl phone:leading-tight"
            )}
          >
            {title}
          </Heading>
        </div>
        <div className={cx(docked && "p-3 phone:p-2")}>
          {children && (
            <div
              className={cx(
                "font-hud-body text-hud-base text-[#ddd5c6] phone:text-hud-sm",
                !docked && "mt-3 phone:mt-1"
              )}
            >
              {children}
            </div>
          )}
          {actions && (
            <div className={docked ? "mt-3 phone:mt-2" : "mt-5 phone:mt-2"}>
              {actions}
            </div>
          )}
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
        "flex gap-3",
        stack ? "flex-col" : "flex-wrap items-center justify-end"
      )}
    >
      {children}
    </div>
  );
}
