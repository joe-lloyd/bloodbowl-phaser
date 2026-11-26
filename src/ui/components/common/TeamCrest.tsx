import { type TeamColors } from "../../../types/Team";
import { cx } from "../componentWarehouse/HudKit";
import { numToHex } from "../TeamManagement/TeamStatsOverview";

export function crestInitials(name?: string): string {
  const [first, second] = (name ?? "").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

const SHIELD = "polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%)";

const SIZES = {
  md: "h-8 w-7 text-hud-xs",
  lg: "h-11 w-10 text-hud-sm",
} as const;

export function TeamCrest({
  name,
  colors,
  size = "md",
  className,
}: {
  name?: string;
  colors?: TeamColors;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const kit = colors
    ? { fill: numToHex(colors.primary), trim: numToHex(colors.secondary) }
    : undefined;
  return (
    <span
      aria-hidden
      data-crest={kit ? "kit" : "fallback"}
      className={cx(
        "relative inline-flex shrink-0",
        SIZES[size],
        !kit && "bg-white/25",
        className
      )}
      style={{
        clipPath: SHIELD,
        ...(kit && { backgroundColor: kit.trim }),
      }}
    >
      <span
        className={cx(
          "absolute inset-[2px] flex items-start justify-center pt-[18%] font-hud-label font-bold leading-none tracking-[0.04em]",
          !kit && "bg-hud-raise text-hud-dim"
        )}
        style={{
          clipPath: SHIELD,
          ...(kit && {
                backgroundColor: kit.fill,
                color: kit.trim,
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.85)",
              }),
        }}
      >
        {crestInitials(name)}
      </span>
    </span>
  );
}
