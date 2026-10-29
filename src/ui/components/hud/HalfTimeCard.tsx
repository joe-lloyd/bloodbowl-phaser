import { useRef, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { teamRerollsLeft } from "../../../game/teamRerolls";
import { useEventBus } from "../../hooks/useEventBus";
import { HudButton, Panel } from "../componentWarehouse/HudKit";
import { HalfTimeSummary, KoRecovery, summarizeHalfTime } from "./turnSummary";

/**
 * The half time summary in the left column. It opens when the first half
 * ends, fills in as KO recovery rolls land, and stays until the coach closes
 * it or the second half's first turn starts. It only reads state, so online
 * lockstep play is untouched, and each coach closes their own copy.
 */
export function HalfTimeCard({ eventBus }: { eventBus: EventBus }) {
  const [summary, setSummary] = useState<HalfTimeSummary | null>(null);
  const [ready, setReady] = useState(false);
  const open = useRef(false);
  const kickerId = useRef<string | null>(null);
  const recoveries = useRef<KoRecovery[]>([]);

  const refresh = () => {
    if (!open.current || !ServiceContainer.isInitialized()) return;
    const game = ServiceContainer.getInstance().gameService;
    const state = game.getState();
    setSummary(
      summarizeHalfTime(
        game.getTeams(),
        state.score,
        (team) => teamRerollsLeft(state, team),
        recoveries.current,
        kickerId.current
      )
    );
  };
  const close = () => {
    open.current = false;
    setSummary(null);
    setReady(false);
  };

  useEventBus(eventBus, GameEventNames.DriveEnded, (data) => {
    close();
    if (data.reason !== "halftime") return;
    open.current = true;
    kickerId.current = data.nextKickingTeamId;
    recoveries.current = [];
    refresh();
  });
  useEventBus(eventBus, GameEventNames.KORecoveryRolled, (result) => {
    if (!open.current) return;
    recoveries.current.push(result);
    refresh();
  });
  useEventBus(eventBus, GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase === GamePhase.GAME_OVER) close();
    if (phase !== GamePhase.SETUP || !open.current) return;
    setReady(true);
    refresh();
  });
  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    if (open.current) close();
  });
  useEventBus(eventBus, GameEventNames.GameStateRestored, close);
  useEventBus(eventBus, GameEventNames.ScenarioLoaded, close);

  if (!summary) return null;
  return (
    <Panel className="pointer-events-auto w-full shrink-0 p-3">
      <section
        data-testid="half-time-card"
        aria-label="Half time"
        aria-live="polite"
        className="max-h-[min(45vh,340px)] overflow-y-auto hud-scroll text-hud-sm text-hud-bone"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-hud-display text-hud-xl text-hud-gold">
            Half time
          </h2>
          <HudButton
            size="sm"
            data-testid="half-time-close"
            aria-label="Close half time summary"
            onClick={close}
          >
            Close
          </HudButton>
        </div>
        <p className="mt-1 font-bold">{summary.score}</p>
        <p>{summary.kicker}</p>
        <h3 className="mt-2 font-bold text-hud-dim">Re-rolls reset</h3>
        <ul data-testid="half-time-rerolls">
          {summary.rerolls.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h3 className="mt-2 font-bold text-hud-dim">KO recovery</h3>
        {summary.recovery.length ? (
          <ul data-testid="half-time-recovery">
            {summary.recovery.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>{ready ? "Nobody was knocked out." : "Rolling for recovery."}</p>
        )}
        <h3 className="mt-2 font-bold text-hud-dim">Out for the match</h3>
        {summary.out.length ? (
          <ul data-testid="half-time-out">
            {summary.out.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>Nobody</p>
        )}
      </section>
    </Panel>
  );
}
