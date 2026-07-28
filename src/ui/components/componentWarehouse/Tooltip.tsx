import { ReactNode } from "react";

interface TooltipProps {
  /** The rule/explanation text revealed on hover. */
  content: string;
  /** The hover target (e.g. a skill name badge). */
  children: ReactNode;
  className?: string;
}

/**
 * A small reusable hover tooltip (team-builder-rule-tooltips) — dark
 * parchment background, small serif body text, per
 * docs/design/blood-bowl-2025-style-guide.md's "Tooltips" spec. Pure CSS
 * (`group`/`group-hover`), matching the hover-reveal pattern already used
 * elsewhere in the UI (no new dependency).
 */
export function Tooltip({ content, children, className = "" }: TooltipProps) {
  return (
    <span className={`group relative inline-block ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-56 max-w-xs rounded border border-bb-gold bg-bb-text-dark p-2 font-body text-xs text-bb-parchment opacity-0 shadow-parchment-light transition-opacity duration-200 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
