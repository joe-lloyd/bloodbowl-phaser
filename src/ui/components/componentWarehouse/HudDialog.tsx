/** The decision dialog shell and its row of buttons. */
import React from "react";
import { cx, type HudTone } from "./hudTone";
import { Eyebrow, Panel } from "./HudPanel";

type DialogPlacement = "top" | "center" | "dock";

const OVERLAY = "absolute inset-0 flex justify-center px-4 pointer-events-auto";

const PLACEMENT: Record<DialogPlacement, string> = {
  // A phone on its side: dialogs start under the score strip
  top: `${OVERLAY} items-start pt-44 [@media(max-height:500px)]:pt-14`,
  center: `${OVERLAY} items-center`,
  dock: "w-full pointer-events-auto",
};

const BACKDROP = {
  light:
    "bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]",
  heavy: "bg-black/70 backdrop-blur-[2px]",
};

/**
 * A decision panel. Docked panels fill the HUD column. Other placements
 * keep the board visible behind a vignette. `testId` stays on the wrapper.
 */
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
          placement === "dock"
            ? "w-full px-4 py-3"
            : `px-6 pb-5 pt-5 ${width} max-h-[calc(100dvh-1rem)] overflow-y-auto [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:py-3`,
          className
        )}
      >
        {eyebrow && (
          <Eyebrow tone={tone === "gold" ? undefined : tone}>{eyebrow}</Eyebrow>
        )}
        <Heading className="mt-1 font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-bone">
          {title}
        </Heading>
        {children && (
          <div className="mt-3 font-hud-body text-hud-base text-[#ddd5c6]">
            {children}
          </div>
        )}
        {actions && <div className="mt-5">{actions}</div>}
      </Panel>
    </div>
  );
}

/** A row of dialog buttons, the main action last (rightmost). */
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
