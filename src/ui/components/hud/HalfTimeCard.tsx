import { useRef, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { teamRerollsLeft } from "../../../game/teamRerolls";
import { useEventBus } from "../../hooks/useEventBus";
import { HudButton, Panel, PanelHeader } from "../componentWarehouse/HudKit";
import { HalfTimeSummary, KoRecovery, summarizeHalfTime } from "./turnSummary";

type HalfTimeView =
  | { kind: "closed" }
  | { kind: "summary"; summary: HalfTimeSummary }
  | { kind: "plain" };

/**
 * The half time summary in the left column. It opens when the first half
 * ends, fills in as KO recovery rolls land, and stays until the coach closes
 * it or the second half's first turn starts. It only reads state, so online
 * lockstep play is untouched, and each coach closes their own copy.
 */
export function HalfTimeCard({ eventBus }: { eventBus: EventBus }) {
  const [card, setCard] = useState<HalfTimeView>({ kind: "closed" });
  const [ready, setReady] = useState(false);
  const open = useRef(false);
  const kickerId = useRef<string | null>(null);
  const recoveries = useRef<KoRecovery[]>([]);

  const refresh = () => {
    if (!open.current || !ServiceContainer.isInitialized()) return;
    // The card replaces the half time banner, so half time must show even
    // when the summary cannot be read.
    try {
      const game = ServiceContainer.getInstance().gameService;
      const state = game.getState();
      setCard({
        kind: "summary",
        summary: summarizeHalfTime(
          game.getTeams(),
          state.score,
          (team) => teamRerollsLeft(state, team),
          recoveries.current,
          kickerId.current
        ),
      });
    } catch (error) {
      console.error(
        "[HalfTimeCard] could not read the half time summary",
        error
      );
      setCard({ kind: "plain" });
    }
  };
  const close = () => {
    open.current = false;
    setCard({ kind: "closed" });
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

  if (card.kind === "closed") return null;
  const summary = card.kind === "summary" ? card.summary : null;
  return (
    <Panel
      as="section"
      data-testid="half-time-card"
      aria-label="Half time"
      aria-live="polite"
      className="pointer-events-auto flex max-h-[min(45vh,340px)] w-full shrink-0 flex-col"
    >
      <PanelHeader
        as="h2"
        title="Half time"
        controls={
          <HudButton
            size="xs"
            variant="ghost"
            data-testid="half-time-close"
            aria-label="Close half time summary"
            onClick={close}
          >
            Close
          </HudButton>
        }
      />
      <div className="overflow-y-auto hud-scroll p-3 text-hud-sm text-hud-bone">
        {summary ? (
          <>
            <p className="font-bold">{summary.score}</p>
            <p>{summary.kicker}</p>
            <h3 className="hud-label mt-2">Re-rolls reset</h3>
            <ul data-testid="half-time-rerolls">
              {summary.rerolls.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h3 className="hud-label mt-2">KO recovery</h3>
            {summary.recovery.length ? (
              <ul data-testid="half-time-recovery">
                {summary.recovery.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>
                {ready ? "Nobody was knocked out." : "Rolling for recovery."}
              </p>
            )}
            <h3 className="hud-label mt-2">Out for the match</h3>
            {summary.out.length ? (
              <ul data-testid="half-time-out">
                {summary.out.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Nobody</p>
            )}
          </>
        ) : (
          <p>Second half next</p>
        )}
      </div>
    </Panel>
  );
}
