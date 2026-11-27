import type { ReactElement } from "react";
import { GAME_TYPE_LABELS, type GameType } from "../../../game/variants/gameTypes";
import { cx } from "../componentWarehouse/HudKit";

const BADGE_FILLS: Record<GameType, string> = {
  sevens: "fill-hud-game-sevens",
  "street-bowl": "fill-hud-game-street",
  "beach-bowl": "fill-hud-game-beach",
  "gutter-bowl": "fill-hud-game-gutter",
};

const PALM_FRONDS = [
  "M11.8 9.4C9.8 7.4 6.8 7.4 5.2 10.4 7.2 9.2 9.6 9 11.8 9.4Z",
  "M11.8 9.4C13.8 7.4 16.8 7.4 18.4 10.4 16.4 9.2 14 9 11.8 9.4Z",
  "M11.8 9.4C10.6 6.4 8.6 5 6.6 5.4 8.4 6.2 10.2 7.6 11.8 9.4Z",
  "M11.8 9.4C13 6.4 15 5 17 5.4 15.2 6.2 13.4 7.6 11.8 9.4Z",
];

const MARKS: Record<GameType, ReactElement> = {
  sevens: (
    <path
      d="M8 7.2h8l-4.8 10.2"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.8}
      strokeLinecap="square"
    />
  ),
  "street-bowl": (
    <g fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x={6.5} y={7.2} width={11} height={9.6} rx={0.5} />
      <path d="M6.5 10.4h11M6.5 13.6h11M12 7.2v3.2M9.2 10.4v3.2M14.8 10.4v3.2M12 13.6v3.2" />
    </g>
  ),
  "beach-bowl": (
    <g fill="currentColor">
      <g transform="translate(2.4 0.8) scale(0.8)">
        <path
          d="M12.2 9.6c1.2 3 1.4 6.2.8 9.4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <g stroke="currentColor" strokeWidth={0.6} strokeLinejoin="round">
          {PALM_FRONDS.map((frond) => (
            <path key={frond} d={frond} />
          ))}
        </g>
        <circle cx={11.1} cy={10.5} r={1} />
        <circle cx={12.7} cy={10.7} r={1} />
      </g>
      <path d="M5.4 18.4c1.8-2.4 4.2-3 6.6-3s4.8.6 6.6 3Z" />
    </g>
  ),
  "gutter-bowl": (
    <g fill="none" stroke="currentColor" strokeWidth={1.7}>
      <circle cx={12} cy={12} r={5.6} />
      <path d="M6.7 10.3h10.6M6.7 13.7h10.6" />
    </g>
  ),
};

export function GameTypeBadge({ gameType, size }: { gameType: GameType; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-game-type-badge={gameType}
      className="shrink-0 text-hud-ink"
    >
      <circle
        cx={12}
        cy={12}
        r={11}
        className={BADGE_FILLS[gameType]}
        stroke="currentColor"
        strokeWidth={1}
      />
      {MARKS[gameType]}
    </svg>
  );
}

export function GameTypeName({
  gameType,
  size = 16,
  className,
}: {
  gameType: GameType;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 align-middle", className)}>
      <GameTypeBadge gameType={gameType} size={size} />
      {GAME_TYPE_LABELS[gameType]}
    </span>
  );
}
