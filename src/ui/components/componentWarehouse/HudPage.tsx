import React from "react";
import { Link } from "react-router-dom";
import { cx, toneText, type HudTone } from "./hudTone";
import { Eyebrow, Panel, PanelHeader } from "./HudPanel";

const PAGE_WIDTH = {
  narrow: "max-w-[640px]",
  medium: "max-w-[960px]",
  wide: "max-w-[1240px]",
} as const;

export function PageShell({
  children,
  width = "wide",
  actionBar,
  className,
}: {
  children: React.ReactNode;
  width?: keyof typeof PAGE_WIDTH;

  actionBar?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="hud-page hud-scroll flex h-[100dvh] flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] overflow-y-auto pointer-events-auto">
      <main
        className={cx(
          "mx-auto w-full flex-1 px-6 pb-12 pt-8 lg:px-10 phone:px-4 phone:pb-6 phone:pt-4",
          PAGE_WIDTH[width],
          className
        )}
      >
        {children}
      </main>
      {actionBar && (
        <div className="sticky bottom-0 z-40 border-t border-hud-gold/25 bg-hud-sunk/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
          <div
            className={cx(
              "mx-auto flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3 lg:px-10 phone:flex-nowrap phone:px-4 phone:py-2 phone:[&_button]:px-3 phone:[&_button]:text-[16px]",
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

  back?: BackTarget;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 phone:mb-4">
      {back && <BackLink {...back} />}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <Eyebrow tone="gold">{eyebrow}</Eyebrow>}
          <h1 className="mt-1 break-words font-hud-display text-[40px] uppercase leading-[1.05] tracking-[0.02em] text-hud-bone lg:text-[48px] phone:text-[28px]">
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

export type BackTarget =
  | { label: string; to: string; onClick?: never }
  | { label: string; onClick: () => void; to?: never };

function BackLink({
  label,
  className,
  ...target
}: BackTarget & { className?: string }) {
  const classes = cx(
    "mb-4 inline-flex min-h-[32px] items-center gap-1.5 rounded-hud font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-dim transition-colors hover:text-hud-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold",
    className
  );
  const content = (
    <>
      <span aria-hidden>←</span>
      {label.replace(/^←\s*/, "")}
    </>
  );
  if (target.to !== undefined) {
    return (
      <Link to={target.to} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={target.onClick} className={classes}>
      {content}
    </button>
  );
}

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
  accent?: HudTone | { color: string } | undefined;
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
        "rounded-hud border border-l-[3px] border-white/10 bg-black/35 px-4 py-3 font-hud-body text-hud-sm text-hud-bone",
        NOTICE_EDGE[tone],
        className
      )}
    >
      {title && (
        <p
          className={cx(
            "font-hud-label text-hud-base font-bold uppercase tracking-[0.06em]",
            tone === "neutral" ? "text-hud-bone" : toneText(tone)
          )}
        >
          {title}
        </p>
      )}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

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

export const hudChoiceClass = (selected: boolean) =>
  cx(
    "rounded-hud border text-left transition-[background-color,border-color,box-shadow] duration-150 ease-bb",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold focus-visible:ring-offset-2 focus-visible:ring-offset-hud-ink",
    "disabled:cursor-not-allowed disabled:opacity-45",
    selected
      ? "border-hud-gold bg-hud-raise shadow-hud-glow"
      : "border-white/10 bg-black/30 enabled:hover:border-hud-gold/60 enabled:hover:bg-hud-raise/70"
  );
