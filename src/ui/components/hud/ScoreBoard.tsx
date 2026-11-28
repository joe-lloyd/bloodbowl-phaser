import { useEffect, useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { teamRerollsLeft } from "../../../game/teamRerolls";
import { kitOf } from "../../../game/presentation/kits";
import { GameConfig } from "../../../config/GameConfig";
import { activeLayout } from "../../../game/variants/activeMatch";
import { possessive } from "../../../game/managers/TurnManager";

interface TeamRow {
  id: string;
  name: string;
  roster: string;
  color: string;
  score: number;
  turn: number;
  rerolls: number;
  freeRerolls: number;
  bribes: number;

  coach: string | undefined;
  isMe?: boolean;
}

const hexColor = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

function SeatTurnBanner({ row }: { row: TeamRow | undefined }) {
  if (!row) return null;
  return (
    <div
      data-testid="seat-turn-banner"
      className="hud-slab pointer-events-auto px-3 py-1.5 font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone animate-hud-in"
      style={{ borderLeft: `4px solid ${row.color}` }}
    >
      {possessive(row.name)} turn{row.isMe ? " · you" : ""}
    </div>
  );
}

export function ScoreBoard({
  eventBus,
  compact = false,
}: {
  eventBus: IEventBus;

  compact?: boolean;
}) {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [half, setHalf] = useState("1");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (!ServiceContainer.isInitialized()) return;
      const gs = ServiceContainer.getInstance().gameService;
      const state = gs.getState();

      const teams = Object.keys(state.score)
        .map((teamId) => gs.getTeam(teamId))
        .filter((t): t is NonNullable<typeof t> => !!t);

      const online = getActiveOnlineMatch();
      const seated = gs.getTeams();
      setRows(
        teams.map((team) => ({
          id: team.id,
          name: team.name,
          roster: team.rosterName,
          color: hexColor(kitOf(seated, team.id).primary),
          score: state.score[team.id] ?? 0,
          turn: gs.getTurnNumber(team.id),
          rerolls: teamRerollsLeft(state, team),
          freeRerolls: state.driveEffects?.freeRerolls[team.id] ?? 0,
          bribes: state.bribes?.[team.id] ?? 0,
          coach: online?.coachName(team.id),
          isMe: online?.myTeamId === team.id,
        }))
      );
      setHalf(state.turn.extraTime ? "ET" : state.turn.isHalf2 ? "2" : "1");
      setActiveTeamId(state.activeTeamId);
    };

    refresh();
    const events = [
      GameEventNames.Touchdown,
      GameEventNames.TurnStarted,
      GameEventNames.PhaseChanged,
      GameEventNames.GameStateRestored,
      GameEventNames.TeamUpdated,
      GameEventNames.RerollUsed,
      GameEventNames.DriveEffectGranted,
      GameEventNames.DriveEffectExpired,

      GameEventNames.RefereeCall,
    ] as const;

    for (const e of events) {
      eventBus.on(e, refresh);
    }
    return () => {
      for (const e of events) {
        eventBus.off(e, refresh);
      }
    };
  }, [eventBus]);

  if (rows.length === 0) return null;
  if (activeLayout().frames.length !== 2)
    return <SeatTurnBanner row={rows.find(({ id }) => id === activeTeamId)} />;

  if (compact) {
    const slim = (row: TeamRow, mirrored: boolean) => (
      <div
        key={row.id}
        className={`hud-slab relative flex min-w-0 items-center gap-2 px-2.5 py-1 ${
          mirrored ? "flex-row-reverse" : ""
        }`}
        style={{
          [mirrored ? "borderRight" : "borderLeft"]: `4px solid ${row.color}`,
        }}
      >
        <span className="min-w-0 flex-1 truncate font-hud-label text-hud-base font-bold uppercase leading-none tracking-[0.03em] text-hud-bone">
          {row.name}
        </span>
        <span
          data-testid={`rerolls-${row.id}`}
          className="whitespace-nowrap font-hud-display text-hud-sm leading-none text-hud-gold"
        >
          RR {row.rerolls}
          {row.freeRerolls > 0 ? `+${String(row.freeRerolls)}` : ""}
        </span>
        <span className="font-hud-display text-hud-2xl leading-none text-hud-bone">
          {row.score}
        </span>
        {row.id === activeTeamId && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px] bg-hud-gold"
          />
        )}
      </div>
    );
    return (
      <div
        data-testid="scoreboard"
        className="grid w-full max-w-[520px] grid-cols-[1fr_52px_1fr] pointer-events-auto animate-hud-in"
      >
        {rows[0] && slim(rows[0], false)}
        <div className="flex flex-col items-center justify-center border-y border-hud-gold/30 bg-hud-sunk/95">
          <span className="hud-label text-hud-2xs">Half</span>
          <span className="font-hud-display text-hud-lg leading-none text-hud-gold">
            {half}
          </span>
        </div>
        {rows.slice(1).map((row) => slim(row, true))}
      </div>
    );
  }

  const side = (row: TeamRow, mirrored: boolean) => {
    const active = row.id === activeTeamId;
    return (
      <div
        key={row.id}
        className={`hud-slab relative flex min-w-0 items-center gap-3 px-3 py-1.5 ${
          mirrored ? "flex-row-reverse text-right" : ""
        }`}
        style={{
          [mirrored ? "borderRight" : "borderLeft"]: `5px solid ${row.color}`,
          backgroundImage: `linear-gradient(${String(mirrored ? 270 : 90)}deg, ${row.color}38, transparent 75%)`,
        }}
      >
        <div className="min-w-0 flex-1">
          <span
            className={`block truncate font-hud-label text-hud-lg font-bold uppercase leading-tight tracking-[0.03em] ${
              active ? "text-hud-bone" : "text-hud-bone/70"
            }`}
          >
            {row.name}
            <span className="font-hud-body text-hud-sm font-normal normal-case tracking-normal text-hud-dim">
              {" "}
              ({row.roster})
            </span>
          </span>
          {row.coach && (
            <span className="block truncate font-hud-body text-hud-xs tracking-normal text-hud-gold/90">
              <span className="sr-only">Coach </span>
              {row.coach}
              {row.isMe && <span className="text-hud-dim"> (you)</span>}
            </span>
          )}

          <div
            className={`mt-0.5 flex items-center gap-2 ${
              mirrored ? "flex-row-reverse" : ""
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="hud-label text-hud-2xs">Turn</span>
              <span
                className={`font-hud-display text-hud-base leading-none ${
                  active ? "text-hud-bone" : "text-hud-dim"
                }`}
              >
                {row.turn}
              </span>
              <div className="flex gap-[3px]">
                {Array.from({ length: GameConfig.TURNS_PER_HALF }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 -skew-x-12 border ${
                      i < row.turn
                        ? "border-hud-gold bg-hud-gold"
                        : "border-hud-gold/40 bg-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>
            <span
              data-testid={`rerolls-${row.id}`}
              className="whitespace-nowrap font-hud-display text-hud-lg leading-none text-hud-gold"
            >
              RR {row.rerolls}
              {row.freeRerolls > 0 ? ` +${String(row.freeRerolls)}` : ""}
              {row.bribes > 0 ? ` · Bribe ${String(row.bribes)}` : ""}
            </span>
          </div>
        </div>
        <span
          className={`font-hud-display text-hud-3xl leading-none ${
            active ? "text-hud-bone" : "text-hud-bone/75"
          }`}
        >
          {row.score}
        </span>
        {active && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px] bg-hud-gold"
          />
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="scoreboard"
      className="grid w-[clamp(380px,calc(100vw-38rem),620px)] grid-cols-[1fr_60px_1fr] pointer-events-auto animate-hud-in"
    >
      {rows[0] && side(rows[0], false)}
      <div className="flex flex-col items-center justify-center border-y border-hud-gold/30 bg-hud-sunk/95">
        <span className="hud-label text-hud-2xs">Half</span>
        <span className="font-hud-display text-hud-xl leading-none text-hud-gold">
          {half}
        </span>
      </div>
      {rows.slice(1).map((row) => side(row, true))}
    </div>
  );
}
