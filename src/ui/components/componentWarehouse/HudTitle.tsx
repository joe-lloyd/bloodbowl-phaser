import type { ReactNode } from "react";
import { cx } from "./hudTone";

const LEVEL = {
  hero: "font-hud-display text-hud-4xl phone:text-hud-3xl tracking-[0.02em]",
  page: "break-words font-hud-display text-hud-3xl phone:text-hud-2xl tracking-[0.02em]",
  section: "font-hud-display text-hud-lg tracking-[0.04em]",
  card: "break-words font-hud-display text-hud-xl tracking-[0.02em]",
  row: "font-hud-label text-hud-base font-bold tracking-[0.04em]",
} as const;

export function Title({
  level,
  as: Tag,
  className,
  children,
}: {
  level: keyof typeof LEVEL;
  as: "h1" | "h2" | "h3" | "span" | "p";
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Tag className={cx(LEVEL[level], "uppercase text-hud-bone", className)}>
      {children}
    </Tag>
  );
}

export function ChoiceText({
  title,
  detail,
}: {
  title: ReactNode;
  detail: ReactNode;
}) {
  return (
    <>
      <Title level="row" as="span" className="block">
        {title}
      </Title>
      <span className="block text-hud-sm text-hud-dim">{detail}</span>
    </>
  );
}
