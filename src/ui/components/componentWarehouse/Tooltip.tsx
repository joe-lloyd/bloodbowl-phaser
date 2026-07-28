import { ReactNode, useId } from "react";

interface TooltipProps {
  /** The rule/explanation text revealed on hover or focus. */
  content: string;
  /** The hover/focus target (e.g. a skill name badge). */
  children: ReactNode;
  className?: string;
}

/**
 * A small reusable hover/focus tooltip (team-builder-rule-tooltips) — dark
 * parchment background, small serif body text, per
 * docs/design/blood-bowl-2025-style-guide.md's "Tooltips" spec. Pure CSS
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
      className={`group relative inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-bb-gold ${className}`}
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-56 max-w-[80vw] -translate-x-1/2 rounded border border-bb-gold bg-bb-text-dark p-2 font-body text-xs text-bb-parchment opacity-0 shadow-parchment-light transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100 group-focus-within:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
