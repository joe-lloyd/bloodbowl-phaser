import {
  useEffect,
  useRef,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  HUD_PANELS_ATTRIBUTE,
  HUD_RESERVED,
} from "../../../game/presentation/hudRects";

interface HUDLayoutProps {
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  overlays?: ReactNode;
  phone?: boolean;
}

const column =
  "absolute top-4 bottom-4 flex w-72 max-w-[40vw] flex-col gap-3 overflow-y-auto no-scrollbar";
const stack = "flex min-h-0 flex-col gap-3";
const top = `${stack} overflow-y-auto hud-scroll empty:hidden`;
const bottom = `${stack} mt-auto shrink-0`;
const filling = `${stack} flex-1 [justify-content:safe_flex-end]`;
const panels = { [HUD_PANELS_ATTRIBUTE]: "" };
const reserved = { [HUD_PANELS_ATTRIBUTE]: HUD_RESERVED };
const phoneColumn =
  "phone-column absolute flex flex-col gap-2 overflow-y-auto no-scrollbar";

export function HUDLayout({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  overlays,
  phone = false,
}: HUDLayoutProps) {
  const { startPress, endPress } = useHudPressGuard();
  return (
    <div
      className={
        phone
          ? "absolute inset-0 pointer-events-none touch-manipulation select-none phone-hud"
          : "absolute inset-0 pointer-events-none"
      }
      onMouseDown={startPress}
      onMouseUp={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
    >
      <HudColumn
        phone={phone}
        side="left"
        topSlot={topLeft}
        bottomSlot={bottomLeft}
      />
      <HudColumn
        phone={phone}
        side="right"
        topSlot={topRight}
        bottomSlot={bottomRight}
      />
      {overlays}
    </div>
  );
}

function useHudPressGuard() {
  const pressedHere = useRef(false);
  useEffect(() => {
    const clear = () => {
      pressedHere.current = false;
    };
    window.addEventListener("mousedown", clear, true);
    window.addEventListener("touchstart", clear, true);
    return () => {
      window.removeEventListener("mousedown", clear, true);
      window.removeEventListener("touchstart", clear, true);
    };
  }, []);
  const startPress = (event: SyntheticEvent) => {
    pressedHere.current = true;
    event.stopPropagation();
  };
  const endPress = (event: SyntheticEvent) => {
    if (!pressedHere.current) return;
    pressedHere.current = false;
    event.stopPropagation();
  };
  return { startPress, endPress };
}

function HudColumn({
  phone,
  side,
  topSlot,
  bottomSlot,
}: {
  phone: boolean;
  side: "left" | "right";
  topSlot: ReactNode;
  bottomSlot: ReactNode;
}) {
  const right = side === "right";
  const inset = right ? "right-4" : "left-4";
  const columnClass = phone
    ? `${phoneColumn} phone-column-${side}`
    : `${column} ${inset}`;
  const fills = !right && !phone;
  const bottomClass = fills ? filling : bottom;
  const slotClass = right ? " w-full items-end" : "";
  return (
    <div
      className={`${columnClass}${right ? " items-end" : ""}`}
    >
      <div className={`${top}${slotClass}`} {...panels}>
        {topSlot}
      </div>
      <div
        className={`${bottomClass}${slotClass}`}
        {...(fills ? reserved : panels)}
      >
        {bottomSlot}
      </div>
    </div>
  );
}
