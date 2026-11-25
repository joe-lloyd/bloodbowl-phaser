import React, { forwardRef, useRef } from "react";
import { type Hotkey, hotkeyLabel, useHotkey } from "../../hotkeys";
import { cx } from "./hudTone";

export type HudButtonVariant =
  | "primary"
  | "selected"
  | "secondary"
  | "ghost"
  | "danger";
export type HudButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<HudButtonVariant, string> = {
  primary:
    "bg-hud-blood text-white border-hud-blood-edge/70 shadow-hud-press-blood hover:bg-hud-blood-hot",
  selected: "bg-hud-gold text-hud-ink border-hud-gold-hi shadow-hud-press-gold hover:bg-[#f0c45a]",
  secondary:
    "bg-hud-raise text-hud-bone border-white/15 shadow-hud-press-dark hover:border-hud-gold/60 hover:bg-hud-edge",
  ghost:
    "bg-transparent text-hud-bone border-white/20 hover:border-hud-gold/70 hover:text-hud-gold",
  danger:
    "bg-transparent text-hud-bad-soft border-hud-bad/50 hover:bg-hud-blood-deep/60 hover:border-hud-bad",
};

const SIZE: Record<HudButtonSize, string> = {
  xs: "min-h-[24px] min-w-[24px] px-1.5 text-hud-sm",
  sm: "min-h-[32px] px-3 text-hud-sm",
  md: "min-h-[44px] px-5 text-[16px]",
  lg: "min-h-[52px] px-7 text-[20px]",
};

export const hudButtonClass = (
  variant: HudButtonVariant = "secondary",
  size: HudButtonSize = "md",
  block = false
) =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-hud border font-hud-label font-bold uppercase tracking-[0.06em] leading-none",
    "transition-[background-color,border-color,color,transform] duration-150 ease-bb",
    "active:translate-y-[2px] active:shadow-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold focus-visible:ring-offset-2 focus-visible:ring-offset-hud-ink",
    "disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-hud-raise/60 disabled:text-hud-mute disabled:shadow-none disabled:active:translate-y-0",
    VARIANT[variant],
    SIZE[size],
    block && "w-full"
  );

export const HudButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: HudButtonVariant;
    size?: HudButtonSize;
    block?: boolean;

    hotkey?: Hotkey;
    "data-testid"?: string;
  }
>(function HudButton(
  {
    variant = "secondary",
    size = "md",
    block,
    className,
    type,
    hotkey,
    children,
    ...rest
  },
  ref
) {
  const button = useRef<HTMLButtonElement | null>(null);
  useHotkey(hotkey, () => button.current?.click(), !rest.disabled, button);
  return (
    <button
      ref={(node) => {
        button.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type={type ?? "button"}
      className={cx(hudButtonClass(variant, size, block), className)}
      {...rest}
    >
      {children}
      {hotkey && <KeyBadge hotkey={hotkey} />}
    </button>
  );
});

export function KeyBadge({ hotkey }: { hotkey: Hotkey }) {
  return (
    <kbd
      aria-hidden="true"
      className="hidden min-w-[1.4em] rounded-[3px] border border-current px-1 py-0.5 text-center font-hud-label text-[0.7em] font-bold leading-none opacity-60 [@media(pointer:fine)]:inline-block"
    >
      {hotkeyLabel(hotkey)}
    </kbd>
  );
}
