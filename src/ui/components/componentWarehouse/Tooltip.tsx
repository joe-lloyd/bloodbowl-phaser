import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;

  children: ReactNode;
  className?: string;
}

let openTooltip: (() => void) | null = null;

const GAP_PX = 6;

export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const tooltipId = useId();
  const panel = useRef<HTMLSpanElement>(null);
  const [trigger, setTrigger] = useState<DOMRect | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null
  );

  const hide = useCallback(() => {
    setTrigger(null);
    setPlace(null);
    if (openTooltip === hide) openTooltip = null;
  }, []);
  const show = (event: React.SyntheticEvent<HTMLElement>) => {
    if (openTooltip && openTooltip !== hide) openTooltip();
    openTooltip = hide;
    setTrigger(event.currentTarget.getBoundingClientRect());
  };

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

  useEffect(() => {
    if (!trigger) return;
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
    };
  }, [trigger]);

  return (
    <span
      className={`relative inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold rounded-hud ${className}`}
      tabIndex={0}
      aria-describedby={tooltipId}
      onMouseEnter={show}
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
