import { useEffect, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

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
  /** Coach controlling this team (online only) */
  coach?: string;
  isMe?: boolean;
}

const hexColor = (color: number) =>
  `#${color.toString(16).padStart(6, "0")}`;

/**
 * Sidebar match tracker: score, per-team turn (of 6), half, and re-rolls.
 * Styled to match the other sidebar panels (SetupControls, DiceLog).
 * Bribes join once inducements exist in the engine.
 */
export function ScoreBoard({ eventBus }: { eventBus: IEventBus }) {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [half, setHalf] = useState(1);
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
      setRows(
        teams.map((team) => ({
          id: team.id,
          name: team.name,
          roster: team.rosterName,
          color: hexColor(team.colors.primary),
          score: state.score[team.id] ?? 0,
          turn: gs.getTurnNumber(team.id),
          rerolls: team.rerolls,
          freeRerolls: state.driveEffects?.freeRerolls[team.id] ?? 0,
          bribes: state.bribes?.[team.id] ?? 0,
          coach: online?.coachName(team.id),
          isMe: online?.myTeamId === team.id,
        }))
      );
      setHalf(state.turn.isHalf2 ? 2 : 1);
      setActiveTeamId(state.activeTeamId);
    };

    refresh();
    const events = [
      GameEventNames.Touchdown,
      GameEventNames.TurnStarted,
      GameEventNames.PhaseChanged,
      GameEventNames.GameStateRestored,
      GameEventNames.TeamUpdated,
      GameEventNames.DriveEffectGranted,
      GameEventNames.DriveEffectExpired,
    ] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events.forEach((e) => eventBus.on(e as any, refresh));
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events.forEach((e) => eventBus.off(e as any, refresh));
    };
  }, [eventBus]);

  if (rows.length === 0) return null;

  return (
    <div className="w-full flex flex-col pointer-events-auto">
      {/* Header (matches DiceLog/SetupControls) */}
      <div className="flex items-center justify-between bg-black/80 px-3 py-1 border-t-2 border-x-2 border-bb-gold rounded-t-md">
        <span className="font-heading text-bb-gold text-lg">MATCH</span>
        <span className="text-xs text-gray-400 font-bold uppercase">
          Half {half}
        </span>
      </div>

      {/* Body */}
      <div className="border-2 border-bb-gold rounded-b-md bg-black/60 divide-y divide-bb-gold/30">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`px-3 py-2 ${
              row.id === activeTeamId ? "bg-bb-gold/10" : ""
            }`}
          >
            {/* Name + score line */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-3 w-3 rounded-sm border border-white/40 shrink-0"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0">
                  <span
                    className={`block truncate text-sm ${
                      row.id === activeTeamId
                        ? "font-bold text-white"
                        : "text-white/70"
                    }`}
                  >
                    {row.name}
                    <span className="text-white/40 font-normal">
                      {" "}
                      ({row.roster})
                    </span>
                  </span>
                  {row.coach && (
                    <span className="block truncate text-[11px] text-bb-gold/80">
                      🎓 {row.coach}
                      {row.isMe && (
                        <span className="text-white/40"> (you)</span>
                      )}
                    </span>
                  )}
                </span>
              </span>
              <span className="font-heading text-2xl text-bb-gold ml-3">
                {row.score}
              </span>
            </div>

            {/* Turn track: big number + six pips, like the board's track */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] uppercase tracking-widest text-gray-400">
                Turn
              </span>
              <span
                className={`font-heading text-xl leading-none ${
                  row.id === activeTeamId ? "text-white" : "text-white/60"
                }`}
              >
                {row.turn}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-sm border ${
                      i < row.turn
                        ? "bg-bb-gold border-bb-gold"
                        : "border-bb-gold/40 bg-transparent"
                    }`}
                  />
                ))}
              </div>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
                RR {row.rerolls}
                {row.freeRerolls > 0 ? ` +${row.freeRerolls}` : ""}
                {row.bribes > 0 ? ` · Bribe ${row.bribes}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
