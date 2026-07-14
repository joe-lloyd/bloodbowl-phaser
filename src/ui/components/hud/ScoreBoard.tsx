import { useEffect, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";

interface TeamRow {
  id: string;
  name: string;
  score: number;
  turn: number;
  rerolls: number;
}

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

      setRows(
        teams.map((team) => ({
          id: team.id,
          name: team.name,
          score: state.score[team.id] ?? 0,
          turn: gs.getTurnNumber(team.id),
          rerolls: team.rerolls,
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
              <span
                className={`truncate text-sm ${
                  row.id === activeTeamId
                    ? "font-bold text-white"
                    : "text-white/70"
                }`}
              >
                {row.name}
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
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
