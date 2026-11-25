import type { ReactNode } from "react";
import { cx } from "./hudTone";

const HEADLINE = {
  strong: { edge: "border-hud-gold bg-hud-ink/95", text: "text-hud-bone" },
  quiet: { edge: "border-white/30 bg-hud-ink/85", text: "text-hud-dim" },
} as const;

export function BroadcastBanner({
  headline,
  subtitle,
  tone = "strong",
}: {
  headline: ReactNode;
  subtitle?: ReactNode;
  tone?: keyof typeof HEADLINE;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cx(
          "max-w-[calc(100vw-48px)] -skew-x-12 border-y-2 px-10 py-2 shadow-hud phone:px-6 phone:py-1",
          HEADLINE[tone].edge
        )}
      >
        <span
          className={cx(
            "block skew-x-12 text-center font-hud-display text-hud-4xl uppercase tracking-[0.04em] [text-shadow:0_3px_0_theme(colors.hud.ink)] phone:text-hud-2xl",
            HEADLINE[tone].text
          )}
        >
          {headline}
        </span>
      </div>
      {subtitle && (
        <div className="-mt-px max-w-[min(900px,calc(100vw-40rem))] -skew-x-12 bg-hud-blood px-6 py-1 phone:max-w-[calc(100vw-48px)]">
          <span className="block skew-x-12 text-center font-hud-label text-hud-lg font-bold tracking-[0.04em] text-white phone:text-hud-base">
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
}

const NOTICE_EDGE = {
  gold: "border-l-hud-gold",
  bad: "border-l-hud-bad",
} as const;

export function PitchNotice({
  tone,
  detail,
  children,
  className,
  ...rest
}: {
  tone: keyof typeof NOTICE_EDGE;
  detail?: string;
  children: ReactNode;
  className?: string;
  role?: "status" | "alert";
  "data-testid": string;
}) {
  return (
    <div
      className={cx(
        "hud-slab max-w-[calc(100vw-2rem)] border-l-[3px] px-4 py-2 text-center font-hud-label text-hud-base font-bold text-hud-bone animate-hud-in",
        NOTICE_EDGE[tone],
        className
      )}
      {...rest}
    >
      {children}
      {detail && (
        <p className="font-hud-body text-hud-sm font-normal text-hud-dim">
          {detail}
        </p>
      )}
    </div>
  );
}

export function WaitingLine({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="font-hud-label text-hud-base font-bold text-hud-bone [overflow-wrap:anywhere]"
    >
      {children}
    </p>
  );
}
