import React from "react";
import { cx, toneText, type HudTone } from "./hudTone";

const TONE_CHIP: Record<HudTone, string> = {
  gold: "border-hud-gold/60 text-hud-gold",
  blood: "border-hud-blood-hot/70 text-hud-bad-soft",
  good: "border-hud-good/60 text-hud-good",
  bad: "border-hud-bad/60 text-hud-bad",
  warn: "border-hud-warn/60 text-hud-warn",
  info: "border-hud-info/60 text-hud-info",
  skill: "border-hud-skill/60 text-hud-skill",
  neutral: "border-white/15 text-hud-dim",
};

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
        "inline-flex items-center gap-1 rounded-hud border bg-black/30 px-1.5 py-0.5 font-hud-label text-hud-xs font-bold uppercase leading-none tracking-[0.12em]",
        TONE_CHIP[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

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
          tone ? toneText(tone) : "text-hud-bone"
        )}
      >
        {value}
      </span>
    </div>
  );
}

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

export function HudCoin({ spin }: { spin: number }) {
  return (
    <div
      aria-hidden
      className="flex h-20 w-20 select-none items-center justify-center rounded-full border-4 border-hud-gold-hi bg-[radial-gradient(circle_at_35%_30%,#ffe9a8,#e3b448_45%,#8a6a22)] font-hud-display text-hud-2xl text-hud-ink shadow-[0_8px_20px_rgba(0,0,0,0.6)] transition-transform"
      style={{ transform: `rotateY(${String(spin)}deg)` }}
    >
      BB
    </div>
  );
}
