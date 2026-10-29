import { ReactNode, useId } from "react";

interface TooltipProps {
  /** The rule/explanation text revealed on hover or focus. */
  content: string;
  /** The hover/focus target (e.g. a skill name badge). */
  children: ReactNode;
  className?: string;
}

/**
 * A small reusable hover/focus tooltip (team-builder-rule-tooltips): a dark HUD
 * slab with a gold hairline and small body text. Pure CSS
 * (`group`/`group-hover`/`group-focus`), matching the hover-reveal pattern
 * already used elsewhere in the UI (no new dependency).
 *
 * The wrapper itself is the keyboard-reachable trigger (`tabIndex={0}`), so
 * callers don't need to make their `children` focusable separately, and its
 * `aria-describedby` links to the tooltip panel for screen readers.
 */
export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const tooltipId = useId();

  return (
    <span
      className={`group relative inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold rounded-hud ${className}`}
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-56 max-w-[80vw] -translate-x-1/2 rounded-hud border border-hud-gold/40 bg-hud-sunk px-2.5 py-2 text-left font-hud-body text-hud-sm normal-case not-italic tracking-normal text-hud-bone opacity-0 shadow-hud transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100 group-focus-within:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
