import React, { forwardRef } from "react";
import { Title } from "./HudTitle";
import { cx, toneText, type HudTone } from "./hudTone";

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

export const Panel = forwardRef<
  HTMLDivElement,
  DivProps & {
    accent?: HudTone | { color: string } | undefined;
    as?: "div" | "section";
  }
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

export function PanelHeader({
  title,
  aside,
  controls,
  as = "span",
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;

  controls?: React.ReactNode;

  as?: "span" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      data-panel-header=""
      className={cx(
        "flex min-h-[40px] items-center justify-between gap-3 border-b border-hud-gold/20 px-3 py-1.5",
        className
      )}
    >
      <Title level="section" as={as} className="min-w-0 truncate">
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

export const hudTabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;

export function HudTabs<Id extends string>({
  label,
  idBase,
  tabs,
  value,
  onChange,
}: {
  label: string;

  idBase: string;
  tabs: readonly { id: Id; label: string; count?: number }[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + last) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    const { id } = tab;
    onChange(id);
    document.getElementById(hudTabId(idBase, id))?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex shrink-0 overflow-hidden rounded-hud border border-white/15 bg-black/35"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={hudTabId(idBase, tab.id)}
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(tab.id);
            }}
            className={cx(
              "inline-flex min-h-[24px] items-center gap-1.5 px-2.5 font-hud-label text-hud-sm font-bold uppercase leading-none tracking-[0.08em] transition-colors duration-150 ease-bb",
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

export function Eyebrow({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: HudTone | undefined;
  className?: string;
}) {
  return (
    <span className={cx("hud-label block", tone && toneText(tone), className)}>
      {children}
    </span>
  );
}
