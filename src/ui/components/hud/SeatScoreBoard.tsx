import { Chip, Panel } from "../componentWarehouse/HudKit";
import type { Rotation } from "../../../game/seating";

export interface TeamRow {
  id: string;
  name: string;
  roster: string;
  color: string;
  score: number;
  points: number;
  turn: number;
  rerolls: number;
  freeRerolls: number;
  bribes: number;
  blitzed: boolean;
  fouled: boolean;

  coach: string | undefined;
  isMe?: boolean;
}

export interface ScoreView {
  rows: TeamRow[];
  half: string;
  activeTeamId: string | null;
  rotation: Rotation;
  order: string[];
}

const DIRECTION = {
  1: { label: "Clockwise", arrow: "↻" },
  [-1]: { label: "Anticlockwise", arrow: "↺" },
} as const;

function nameOf(rows: readonly TeamRow[], id: string): string {
  return rows.find((row) => row.id === id)?.name ?? id;
}

function SpentAgainst({ row }: { row: TeamRow }) {
  if (!row.blitzed && !row.fouled) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {row.blitzed && <Chip tone="bad">Blitzed</Chip>}
      {row.fouled && <Chip tone="skill">Fouled</Chip>}
    </span>
  );
}

function SeatRow({ row, active }: { row: TeamRow; active: boolean }) {
  return (
    <div
      data-testid={`seat-row-${row.id}`}
      aria-current={active ? "true" : undefined}
      className={`relative grid grid-cols-[minmax(0,1fr)_40px_32px_40px] items-center gap-2 px-2.5 py-1 ${
        active ? "bg-hud-gold/15" : ""
      }`}
      style={{ borderLeft: `4px solid ${row.color}` }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={`truncate font-hud-label text-hud-base font-bold uppercase leading-tight tracking-[0.03em] ${
            active ? "text-hud-bone" : "text-hud-bone/70"
          }`}
        >
          {active && <span aria-hidden>▶ </span>}
          {row.name}
          {row.isMe && (
            <span className="font-hud-body text-hud-xs font-normal normal-case text-hud-dim">
              {" "}
              (you)
            </span>
          )}
        </span>
        <SpentAgainst row={row} />
      </span>
      <span className="text-right font-hud-display text-hud-lg leading-none text-hud-bone">
        {row.points}
      </span>
      <span className="text-right font-hud-display text-hud-base leading-none text-hud-dim">
        {row.score}
      </span>
      <span className="text-right font-hud-display text-hud-sm leading-none text-hud-gold">
        {row.rerolls}
      </span>
    </div>
  );
}

function SeatChip({ row, active }: { row: TeamRow; active: boolean }) {
  return (
    <Panel
      data-testid={`seat-row-${row.id}`}
      aria-current={active ? "true" : undefined}
      className="relative flex min-w-0 max-w-[132px] flex-1 flex-col px-1.5 py-0.5"
      style={{ borderLeft: `4px solid ${row.color}` }}
    >
      <span className="truncate font-hud-label text-hud-xs font-bold uppercase leading-tight text-hud-bone">
        {row.name}
      </span>
      <span className="whitespace-nowrap font-hud-display text-hud-sm leading-none text-hud-gold">
        {row.points} pts · {row.score} TD
      </span>
      {active && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-hud-gold" />
      )}
    </Panel>
  );
}

export function SeatScoreBoard({
  view,
  compact,
}: {
  view: ScoreView;
  compact: boolean;
}) {
  const { rows, half, activeTeamId, rotation, order } = view;
  const direction = DIRECTION[rotation];
  const turnOrder = order.map((id) => nameOf(rows, id)).join(" → ");
  if (compact) {
    return (
      <div
        data-testid="seat-scoreboard"
        className="pointer-events-auto flex w-full max-w-[560px] gap-1 animate-hud-in"
      >
        <Panel
          data-testid="turn-direction"
          title={`${direction.label}: ${turnOrder}`}
          className="flex shrink-0 flex-col items-center justify-center px-1.5 font-hud-display text-hud-sm leading-none text-hud-gold"
        >
          <span>H{half}</span>
          <span aria-label={direction.label}>{direction.arrow}</span>
        </Panel>
        {rows.map((row) => (
          <SeatChip key={row.id} row={row} active={row.id === activeTeamId} />
        ))}
      </div>
    );
  }
  return (
    <Panel
      data-testid="seat-scoreboard"
      className="pointer-events-auto w-[min(460px,calc(100vw-2rem))] animate-hud-in"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_40px_32px_40px] items-center gap-2 border-b border-hud-gold/30 px-2.5 py-1">
        <span className="hud-label text-hud-2xs">
          Half {half} ·{" "}
          <span data-testid="turn-direction">
            {direction.label} {direction.arrow}
          </span>
        </span>
        <span className="hud-label text-right text-hud-2xs">Pts</span>
        <span className="hud-label text-right text-hud-2xs">TD</span>
        <span className="hud-label text-right text-hud-2xs">RR</span>
      </div>
      {rows.map((row) => (
        <SeatRow key={row.id} row={row} active={row.id === activeTeamId} />
      ))}
      {turnOrder && (
        <p
          data-testid="turn-order"
          className="truncate border-t border-hud-gold/20 px-2.5 py-1 font-hud-body text-hud-xs text-hud-dim"
        >
          Order: {turnOrder}
        </p>
      )}
    </Panel>
  );
}
