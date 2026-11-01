import {
  ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  /** The rule/explanation text revealed on hover or focus. */
  content: string;
  /** The hover/focus target (e.g. a skill name badge). */
  children: ReactNode;
  className?: string;
}

/** Space kept between the panel, its trigger and the window's edge. */
const GAP_PX = 6;

/**
 * A small reusable hover/focus tooltip (team-builder-rule-tooltips): a dark HUD
 * slab with a gold hairline and small body text.
 *
 * The panel lives on the page body, fixed beside its trigger, so a table's
 * scroll box or a panel's clipping never cuts it off or grows to fit it.
 * It opens below the trigger, or above when there is more room there, and
 * goes when the page scrolls.
 *
 * The wrapper itself is the keyboard-reachable trigger (`tabIndex={0}`), so
 * callers don't need to make their `children` focusable separately, and its
 * `aria-describedby` links to the tooltip panel for screen readers.
 */
export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const tooltipId = useId();
  const panel = useRef<HTMLSpanElement>(null);
  const [trigger, setTrigger] = useState<DOMRect | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null
  );

  const show = (event: React.SyntheticEvent<HTMLElement>) =>
    setTrigger(event.currentTarget.getBoundingClientRect());
  const hide = () => {
    setTrigger(null);
    setPlace(null);
  };

  // Place the panel once its height is known: below, or above if it fits
  // better there, and never past the window's edge
  useLayoutEffect(() => {
    if (!trigger || !panel.current) return;
    const { width, height } = panel.current.getBoundingClientRect();
    const below = window.innerHeight - trigger.bottom - GAP_PX;
    const above = trigger.top - GAP_PX;
    const top =
      height <= below || below >= above
        ? trigger.bottom + GAP_PX
        : trigger.top - GAP_PX - height;
    const centre = trigger.left + trigger.width / 2;
    setPlace({
      left: Math.min(
        Math.max(GAP_PX, centre - width / 2),
        window.innerWidth - GAP_PX - width
      ),
      top: Math.max(GAP_PX, top),
    });
  }, [trigger]);

  // A fixed panel would drift from its trigger as the page scrolls
  useEffect(() => {
    if (!trigger) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [trigger]);

  return (
    <span
      className={`relative inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold rounded-hud ${className}`}
      tabIndex={0}
      aria-describedby={tooltipId}
      onMouseEnter={show}
      // A focused trigger keeps its panel until focus leaves
      onMouseLeave={(event) => {
        if (document.activeElement !== event.currentTarget) hide();
      }}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {createPortal(
        <span
          ref={panel}
          id={tooltipId}
          role="tooltip"
          style={{
            left: place?.left ?? 0,
            top: place?.top ?? 0,
            visibility: place ? "visible" : "hidden",
          }}
          className={`pointer-events-none fixed z-[1000] w-80 max-w-[80vw] rounded-hud border border-hud-gold/40 bg-hud-sunk px-2.5 py-2 text-left font-hud-body text-hud-sm normal-case not-italic tracking-normal text-hud-bone shadow-hud ${trigger ? "block" : "hidden"}`}
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}

export default Tooltip;
