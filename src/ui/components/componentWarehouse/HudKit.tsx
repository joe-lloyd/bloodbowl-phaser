/**
 * HudKit: the game's UI primitives ("Stadium Broadcast").
 *
 * Every floating panel, dialog and button in the match, and every page
 * around it (menu, team builder, competitions, lobby), is built from these,
 * so the look lives in one place. Tokens are Tailwind `hud-*` entries
 * (tailwind.config.js); `.hud-slab`, `.hud-label`, `.hud-field`,
 * `.hud-page`, `.hud-table` and `.hud-check` are in styles/global.css.
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

const TONE_TOP: Record<HudTone, string> = {
  gold: "border-t-hud-gold",
  blood: "border-t-hud-blood-hot",
  good: "border-t-hud-good",
  bad: "border-t-hud-bad",
  warn: "border-t-hud-warn",
  info: "border-t-hud-info",
  skill: "border-t-hud-skill",
  neutral: "border-t-hud-edge",
};

/**
 * A dark slab. `accent` draws a 3px rule along the top: a tone, or a team
 * colour as a CSS colour string.
 */
export const Panel = forwardRef<
  HTMLDivElement,
  DivProps & { accent?: HudTone | { color: string }; as?: "div" | "section" }
>(function Panel(
  { accent, as = "div", className, style, children, ...rest },
  ref
) {
  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={cx(
        "hud-slab overflow-hidden",
        accent && "border-t-[3px]",
        typeof accent === "string" && TONE_TOP[accent],
        className
      )}
      style={
        accent && typeof accent !== "string"
          ? { borderTopColor: accent.color, ...style }
          : style
      }
      {...rest}
    >
      {children}
    </Tag>
  );
});

/**
 * A panel's title bar: display-face title left, then a small label and any
 * compact controls on the right. It stays one line. When a row is crowded,
 * drop the label rather than shrink the type.
 */
export function PanelHeader({
  title,
  aside,
  controls,
  as: Title = "span",
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  /** Small buttons at the right end, such as xs HudButtons. */
  controls?: React.ReactNode;
  /** The title's element; pages use a real heading. */
  as?: "span" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex min-h-[40px] items-center justify-between gap-3 border-b border-hud-gold/20 px-3 py-2",
        className
      )}
    >
      <Title className="min-w-0 truncate font-hud-display text-hud-lg uppercase tracking-[0.04em] text-hud-bone">
        {title}
      </Title>
      {(aside !== undefined || controls !== undefined) && (
        <div className="flex shrink-0 items-center gap-2">
          {aside !== undefined && (
            <span className="hud-label truncate">{aside}</span>
          )}
          {controls}
        </div>
      )}
    </div>
  );
}

/**
 * A segmented switch between views of one panel, such as Dice and Chat.
 * It takes the place of a PanelHeader title. A count on a tab draws a
 * small blood badge.
 */
export function HudTabs<Id extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  /** The tab list's accessible name. */
  label: string;
  tabs: readonly { id: Id; label: string; count?: number }[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex shrink-0 rounded-hud border border-white/15 bg-black/35 p-0.5"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cx(
              "inline-flex min-h-[24px] items-center gap-1.5 rounded-[2px] px-2.5 font-hud-label text-hud-sm font-bold uppercase leading-none tracking-[0.08em] transition-colors duration-150 ease-bb",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hud-gold",
              selected
                ? "bg-hud-raise text-hud-gold shadow-[inset_0_-2px_0_theme(colors.hud.gold)]"
                : "text-hud-dim hover:text-hud-bone"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-hud-blood px-1 text-hud-2xs leading-none tracking-normal text-white">
                {tab.count}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </button>
        );
      })}
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
export type HudButtonSize = "xs" | "sm" | "md" | "lg";

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
  // A control inside a PanelHeader, which has 24px of height to give. The
  // text matches HudTabs so a header row keeps one size.
  xs: "min-h-[24px] min-w-[24px] px-1.5 text-hud-sm",
  sm: "min-h-[32px] px-3 text-hud-sm",
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
      className={cx(
        "inline-block h-3 w-3 shrink-0 -skew-x-12 border border-white/40",
        className
      )}
      style={{ backgroundColor: color }}
    />
  );
}

/** A gold coin for the toss, turned on its vertical axis by `spin` degrees. */
export function HudCoin({ spin }: { spin: number }) {
  return (
    <div
      aria-hidden
      className="flex h-20 w-20 select-none items-center justify-center rounded-full border-4 border-[#ffe08a] bg-[radial-gradient(circle_at_35%_30%,#ffe9a8,#e3b448_45%,#8a6a22)] font-hud-display text-hud-2xl text-hud-ink shadow-[0_8px_20px_rgba(0,0,0,0.6)] transition-transform"
      style={{ transform: `rotateY(${spin}deg)` }}
    >
      BB
    </div>
  );
}

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
  placement?: "top" | "center" | "dock";
  zClass?: string;
  backdrop?: "light" | "heavy";
  className?: string;
}) {
  const Heading = titleAs;
  return (
    <div
      data-testid={testId}
      data-decision-dialog={placement === "dock" ? "" : undefined}
      className={cx(
        placement === "dock"
          ? "w-full pointer-events-auto"
          : "absolute inset-0 flex justify-center px-4 pointer-events-auto",
        placement !== "dock" &&
          (placement === "top" ? "items-start pt-44" : "items-center"),
        placement === "dock"
          ? false
          : backdrop === "light"
            ? "bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]"
            : "bg-black/70 backdrop-blur-[2px]",
        zClass
      )}
    >
      <Panel
        accent={tone}
        className={cx(
          "max-w-full animate-hud-pop",
          placement === "dock" ? "w-full px-4 py-3" : `px-6 pb-5 pt-5 ${width}`,
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

// ------------------------------------------------------------------ pages

const PAGE_WIDTH = {
  narrow: "max-w-[640px]",
  medium: "max-w-[960px]",
  wide: "max-w-[1240px]",
} as const;

/**
 * A full-screen page outside the match: the floodlit stadium backdrop, a
 * centred column that scrolls, and an optional bar pinned to the bottom
 * for the page's main action.
 */
export function PageShell({
  children,
  width = "wide",
  actionBar,
  className,
}: {
  children: React.ReactNode;
  width?: keyof typeof PAGE_WIDTH;
  /** Sticky bottom bar: Back on the left, the main action on the right. */
  actionBar?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="hud-page hud-scroll flex h-screen flex-col overflow-y-auto pointer-events-auto">
      <main
        className={cx(
          "mx-auto w-full flex-1 px-6 pb-12 pt-8 lg:px-10",
          PAGE_WIDTH[width],
          className
        )}
      >
        {children}
      </main>
      {actionBar && (
        <div className="sticky bottom-0 z-40 border-t border-hud-gold/25 bg-hud-sunk/95 backdrop-blur-sm">
          <div
            className={cx(
              "mx-auto flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3 lg:px-10",
              PAGE_WIDTH[width]
            )}
          >
            {actionBar}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A page's title block: eyebrow, display-face h1, one line of context, and
 * the page's actions on the right. A blood-to-gold rule closes it off.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  back,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A small back link above the title. */
  back?: { label: string; onClick: () => void };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      {back && <BackLink label={back.label} onClick={back.onClick} />}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <Eyebrow tone="gold">{eyebrow}</Eyebrow>}
          <h1 className="mt-1 break-words font-hud-display text-[40px] uppercase leading-[1.05] tracking-[0.02em] text-hud-bone lg:text-[48px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-2xl font-hud-body text-hud-base text-hud-dim">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
      <div
        aria-hidden
        className="mt-5 h-[3px] bg-gradient-to-r from-hud-blood via-hud-gold/60 to-transparent"
      />
    </header>
  );
}

/** A small "← Back" text button. */
export function BackLink({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "mb-4 inline-flex min-h-[32px] items-center gap-1.5 rounded-hud font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-dim transition-colors hover:text-hud-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold",
        className
      )}
    >
      <span aria-hidden>←</span>
      {label.replace(/^←\s*/, "")}
    </button>
  );
}

/** A titled slab for one block of a page. */
export function Section({
  title,
  aside,
  accent,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  accent?: HudTone | { color: string };
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel as="section" accent={accent} className={cx("mb-6", className)}>
      <PanelHeader as="h2" title={title} aside={aside} className="px-4" />
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </Panel>
  );
}

/** A labelled form control. The label wraps the control. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="hud-label">{label}</span>
      {children}
      {hint && <span className="text-hud-sm text-hud-mute">{hint}</span>}
    </label>
  );
}

const NOTICE_EDGE: Record<HudTone, string> = {
  gold: "border-l-hud-gold",
  blood: "border-l-hud-blood-hot",
  good: "border-l-hud-good",
  bad: "border-l-hud-bad",
  warn: "border-l-hud-warn",
  info: "border-l-hud-info",
  skill: "border-l-hud-skill",
  neutral: "border-l-hud-edge",
};

/** A boxed message with a rule down the left in the tone's colour. */
export function Notice({
  tone = "neutral",
  title,
  children,
  role,
  className,
}: {
  tone?: HudTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cx(
        "rounded-hud border border-l-[3px] border-white/10 bg-black/35 px-4 py-3 font-hud-body text-hud-sm text-[#ddd5c6]",
        NOTICE_EDGE[tone],
        className
      )}
    >
      {title && (
        <p
          className={cx(
            "font-hud-label text-hud-base font-bold uppercase tracking-[0.06em]",
            tone === "neutral" ? "text-hud-bone" : TONE_TEXT[tone]
          )}
        >
          {title}
        </p>
      )}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

/** What a list shows when it is empty, with the way forward. */
export function EmptyState({
  title,
  titleAs: Heading = "h2",
  children,
  action,
  className,
}: {
  title: React.ReactNode;
  titleAs?: "h2" | "h3" | "p";
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-hud border border-dashed border-hud-gold/30 bg-black/25 px-6 py-12 text-center",
        className
      )}
    >
      <Heading className="font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-bone">
        {title}
      </Heading>
      {children && (
        <div className="mt-2 max-w-md font-hud-body text-hud-base text-hud-dim">
          {children}
        </div>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Classes for a selectable tile or row (a team, an entrant, a pitch): dark
 * at rest, gold edge on hover, gold edge and glow when chosen.
 */
export const hudChoiceClass = (selected: boolean) =>
  cx(
    "rounded-hud border text-left transition-[background-color,border-color,box-shadow] duration-150 ease-bb",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold focus-visible:ring-offset-2 focus-visible:ring-offset-hud-ink",
    "disabled:cursor-not-allowed disabled:opacity-45",
    selected
      ? "border-hud-gold bg-hud-raise shadow-hud-glow"
      : "border-white/10 bg-black/30 enabled:hover:border-hud-gold/60 enabled:hover:bg-hud-raise/70"
  );
