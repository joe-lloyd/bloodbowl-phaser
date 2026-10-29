/**
 * HudKit: the in-match HUD's primitives ("Stadium Broadcast").
 *
 * Every floating panel, dialog and button in the match is built from these,
 * so the look lives in one place. Tokens are Tailwind `hud-*` entries
 * (tailwind.config.js); `.hud-slab`, `.hud-label` and `.hud-field` are in
 * styles/global.css. Menus and the team builder keep their parchment kit
 * (Button.tsx, Titles.tsx) and do not use this file.
 */
import React, { forwardRef } from "react";

export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/** Accent colours shared by panels, chips and log rows. */
export type HudTone =
  | "gold"
  | "blood"
  | "good"
  | "bad"
  | "warn"
  | "info"
  | "skill"
  | "neutral";

const TONE_TEXT: Record<HudTone, string> = {
  gold: "text-hud-gold",
  blood: "text-hud-blood-hot",
  good: "text-hud-good",
  bad: "text-hud-bad",
  warn: "text-hud-warn",
  info: "text-hud-info",
  skill: "text-hud-skill",
  neutral: "text-hud-dim",
};

const TONE_BAR: Record<HudTone, string> = {
  gold: "bg-hud-gold",
  blood: "bg-gradient-to-r from-hud-blood to-hud-gold",
  good: "bg-hud-good",
  bad: "bg-hud-bad",
  warn: "bg-hud-warn",
  info: "bg-hud-info",
  skill: "bg-hud-skill",
  neutral: "bg-hud-edge",
};

const TONE_CHIP: Record<HudTone, string> = {
  gold: "border-hud-gold/60 text-hud-gold",
  blood: "border-hud-blood-hot/70 text-[#ff8a8a]",
  good: "border-hud-good/60 text-hud-good",
  bad: "border-hud-bad/60 text-hud-bad",
  warn: "border-hud-warn/60 text-hud-warn",
  info: "border-hud-info/60 text-hud-info",
  skill: "border-hud-skill/60 text-hud-skill",
  neutral: "border-white/15 text-hud-dim",
};

export const toneText = (tone: HudTone) => TONE_TEXT[tone];
export const toneBar = (tone: HudTone) => TONE_BAR[tone];

type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  "data-testid"?: string;
};

/**
 * A dark slab. `accent` draws a 3px bar along the top: a tone, or a team
 * colour as a CSS colour string.
 */
export const Panel = forwardRef<
  HTMLDivElement,
  DivProps & { accent?: HudTone | { color: string }; as?: "div" | "section" }
>(function Panel({ accent, as = "div", className, children, ...rest }, ref) {
  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={cx("hud-slab relative overflow-hidden", className)}
      {...rest}
    >
      {accent &&
        (typeof accent === "string" ? (
          <span
            aria-hidden
            className={cx("absolute inset-x-0 top-0 h-[3px]", TONE_BAR[accent])}
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ backgroundColor: accent.color }}
          />
        ))}
      {children}
    </Tag>
  );
});

/** A panel's title bar: display-face title left, a small label right. */
export function PanelHeader({
  title,
  aside,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex min-h-[40px] items-center justify-between gap-3 border-b border-hud-gold/20 px-3 py-2",
        className
      )}
    >
      <span className="min-w-0 truncate font-hud-display text-hud-lg uppercase tracking-[0.04em] text-hud-bone">
        {title}
      </span>
      {aside !== undefined && (
        <span className="hud-label shrink-0 truncate">{aside}</span>
      )}
    </div>
  );
}

/** Small caps label text. */
export function Eyebrow({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: HudTone;
  className?: string;
}) {
  return (
    <span className={cx("hud-label block", tone && TONE_TEXT[tone], className)}>
      {children}
    </span>
  );
}

export type HudButtonVariant =
  | "primary"
  | "gold"
  | "success"
  | "secondary"
  | "ghost"
  | "danger";
export type HudButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<HudButtonVariant, string> = {
  // The main call to action: blood red, with a pressed edge.
  primary:
    "bg-hud-blood text-white border-[#ff5a5a]/70 shadow-hud-press-blood hover:bg-hud-blood-hot",
  gold: "bg-hud-gold text-hud-ink border-[#ffe08a] shadow-hud-press-gold hover:bg-[#f0c45a]",
  success:
    "bg-[#2f7a3a] text-white border-hud-good/80 shadow-[0_3px_0_#123d1a] hover:bg-[#38904a]",
  secondary:
    "bg-hud-raise text-hud-bone border-white/15 shadow-hud-press-dark hover:border-hud-gold/60 hover:bg-hud-edge",
  ghost:
    "bg-transparent text-hud-bone border-white/20 hover:border-hud-gold/70 hover:text-hud-gold",
  danger:
    "bg-transparent text-[#ff8a8a] border-hud-bad/50 hover:bg-hud-blood-deep/60 hover:border-hud-bad",
};

const SIZE: Record<HudButtonSize, string> = {
  sm: "min-h-[32px] px-3 text-[13px]",
  md: "min-h-[44px] px-5 text-[16px]",
  lg: "min-h-[52px] px-7 text-[20px]",
};

/** Button classes, for the few places that cannot use HudButton itself. */
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
    "data-testid"?: string;
  }
>(function HudButton(
  { variant = "secondary", size = "md", block, className, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cx(hudButtonClass(variant, size, block), className)}
      {...rest}
    />
  );
});

/** A small outlined tag: a modifier, a count, a status. */
export function Chip({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: HudTone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-hud border bg-black/30 px-1.5 py-0.5 font-hud-label text-hud-xs font-bold uppercase leading-none",
        TONE_CHIP[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** A statline cell: small label over a big number. */
export function Stat({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: React.ReactNode;
  tone?: HudTone;
  title?: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center rounded-hud border border-white/10 bg-black/35 px-1 py-1"
      title={title}
    >
      <span className="hud-label text-hud-2xs">{label}</span>
      <span
        className={cx(
          "font-hud-display text-hud-xl leading-none",
          tone ? TONE_TEXT[tone] : "text-hud-bone"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** A bone-coloured die face for a rolled value. */
export function DieFace({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-[1.75em] min-w-[1.75em] shrink-0 items-center justify-center rounded-[4px] bg-hud-bone px-1 font-hud-display text-[1em] leading-none text-hud-ink shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]",
        className
      )}
    >
      {children}
    </span>
  );
}

/** A team colour swatch. */
export function TeamSwatch({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-3 w-3 shrink-0 -skew-x-12 border border-white/40", className)}
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * A decision dialog: the overlay that blocks the board, and the slab on it.
 * The overlay keeps the board visible behind a soft vignette. `testId` goes
 * on the overlay, where the e2e suites already look for it.
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
  placement?: "top" | "center";
  zClass?: string;
  backdrop?: "light" | "heavy";
  className?: string;
}) {
  const Heading = titleAs;
  return (
    <div
      data-testid={testId}
      className={cx(
        "absolute inset-0 flex justify-center px-4 pointer-events-auto",
        placement === "top" ? "items-start pt-44" : "items-center",
        backdrop === "light"
          ? "bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]"
          : "bg-black/70 backdrop-blur-[2px]",
        zClass
      )}
    >
      <Panel
        accent={tone}
        className={cx(
          "max-w-full animate-hud-pop px-6 pb-5 pt-5",
          width,
          className
        )}
      >
        {eyebrow && <Eyebrow tone={tone === "gold" ? undefined : tone}>{eyebrow}</Eyebrow>}
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
