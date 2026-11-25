import { useRef, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { teamRerollsLeft } from "../../../game/teamRerolls";
import { useEventBus } from "../../hooks/useEventBus";
import { HudButton, Panel, PanelHeader } from "../componentWarehouse/HudKit";
import {
  type HalfTimeSummary,
  type KoRecovery,
  summarizeHalfTime,
} from "./turnSummary";

type HalfTimeView =
  | { kind: "closed" }
  | { kind: "summary"; summary: HalfTimeSummary; extraTime: boolean }
  | { kind: "plain" };

export function HalfTimeCard({ eventBus }: { eventBus: EventBus }) {
  const [card, setCard] = useState<HalfTimeView>({ kind: "closed" });
  const [ready, setReady] = useState(false);
  const open = useRef(false);
  const kickerId = useRef<string | null>(null);
  const recoveries = useRef<KoRecovery[]>([]);

  const refresh = () => {
    if (!open.current || !ServiceContainer.isInitialized()) return;

    try {
      const game = ServiceContainer.getInstance().gameService;
      const state = game.getState();
      setCard({
        kind: "summary",

        extraTime: !!state.turn.extraTime,
        summary: summarizeHalfTime({
          teams: game.getTeams(),
          score: state.score,
          rerollsLeft: (team) => teamRerollsLeft(state, team),
          recoveries: recoveries.current,
          kickerId: kickerId.current,
        }),
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
  const extraTime = card.kind === "summary" && card.extraTime;
  const title = extraTime ? "Extra time" : "Half time";
  return (
    <HalfTimeCardView
      title={title}
      close={close}
      summary={summary}
      extraTime={extraTime}
      ready={ready}
    />
  );
}

function HalfTimeDetails({
  summary,
  extraTime,
  ready,
}: {
  summary: HalfTimeSummary;
  extraTime: boolean;
  ready: boolean;
}) {
  return (
    <>
      <p className="font-bold">{summary.score}</p>
      <p>{extraTime ? "A roll-off decides who kicks" : summary.kicker}</p>
      <h3 className="hud-label mt-2">
        {extraTime ? "Re-rolls carried over" : "Re-rolls reset"}
      </h3>
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
        <p>{ready ? "Nobody was knocked out." : "Rolling for recovery."}</p>
      )}
      {summary.out.length > 0 && (
        <>
          <h3 className="hud-label mt-2">Out for the match</h3>
          <ul data-testid="half-time-out">
            {summary.out.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

interface HalfTimeCardViewProps {
  title: "Extra time" | "Half time";
  close: () => void;
  summary: HalfTimeSummary | null;
  extraTime: boolean;
  ready: boolean;
}
function HalfTimeCardView({
  title,
  close,
  summary,
  extraTime,
  ready,
}: HalfTimeCardViewProps) {
  return (
    <Panel
      as="section"
      data-testid="half-time-card"
      aria-label={title}
      aria-live="polite"
      className="pointer-events-auto flex max-h-[min(45vh,340px)] phone:max-h-[60dvh] w-full shrink-0 flex-col"
    >
      <PanelHeader
        as="h2"
        title={title}
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
          <HalfTimeDetails
            summary={summary}
            extraTime={extraTime}
            ready={ready}
          />
        ) : (
          <p>Second half next</p>
        )}
      </div>
    </Panel>
  );
}
