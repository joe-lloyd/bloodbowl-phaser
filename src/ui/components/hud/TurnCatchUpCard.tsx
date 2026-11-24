import { useEffect, useRef, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { PlayerStatus } from "../../../types/Player";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useEventBus } from "../../hooks/useEventBus";
import { DiceWatch } from "../../../game/presentation/diceWatch";
import { Panel, PanelHeader } from "../componentWarehouse/HudKit";
import {
  summarizeTurn,
  type TurnIncident,
  type TurnSummary,
} from "./turnSummary";

const MIN_READ_MS = 5000;

export function TurnCatchUpCard({ eventBus }: { eventBus: EventBus }) {
  const [summary, setSummary] = useState<TurnSummary | null>(null);
  const incidents = useRef<TurnIncident[]>([]);
  const activeTeam = useRef<string | null>(null);
  const shownAt = useRef(0);

  const shown = useRef(0);
  const actedEarly = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const service = () =>
    ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService
      : null;
  const clear = () => {
    shown.current += 1;
    incidents.current = [];
    setSummary(null);
    if (timer.current) clearTimeout(timer.current);
  };

  const watch = useRef<DiceWatch | null>(null);
  useEffect(() => {
    activeTeam.current = service()?.getState().activeTeamId ?? null;
    const tray = new DiceWatch(eventBus);
    watch.current = tray;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      watch.current = null;
      tray.dispose();
    };
  }, [eventBus]);

  const recordPlayer = (playerId: string) => {
    const game = service();
    const player = game?.getPlayerById(playerId);
    if (
      game?.getPhase() !== GamePhase.PLAY ||
      !player ||
      player.teamId === activeTeam.current
    )
      return;
    incidents.current.push({ kind: "player", playerId });
  };
  const recordBall = () => {
    if (service()?.getPhase() === GamePhase.PLAY)
      incidents.current.push({ kind: "ball" });
  };
  useEventBus(eventBus, GameEventNames.PlayerKnockedDown, ({ playerId }) => {
    recordPlayer(playerId);
  });
  useEventBus(eventBus, GameEventNames.PlayerStatusChanged, (player) => {
    if (
      player.status !== PlayerStatus.ACTIVE &&
      player.status !== PlayerStatus.RESERVE
    )
      recordPlayer(player.id);
  });
  useEventBus(
    eventBus,
    GameEventNames.PlayerCasualtyInflicted,
    ({ victimId }) => {
      recordPlayer(victimId);
    }
  );
  useEventBus(eventBus, GameEventNames.PlayerKilled, ({ victimId }) => {
    recordPlayer(victimId);
  });
  useEventBus(eventBus, GameEventNames.BallPlaced, recordBall);
  useEventBus(eventBus, GameEventNames.BallScattered, recordBall);
  useEventBus(eventBus, GameEventNames.BallThrownIn, recordBall);
  useEventBus(eventBus, GameEventNames.BallPickup, recordBall);
  useEventBus(eventBus, GameEventNames.CatchSucceeded, recordBall);
  useEventBus(eventBus, GameEventNames.PassCompleted, recordBall);
  useEventBus(eventBus, GameEventNames.PassIntercepted, recordBall);
  useEventBus(eventBus, GameEventNames.PlayerMoved, (data) => {
    if (data.ballFrom || data.ballPath?.length) recordBall();
  });

  useEventBus(eventBus, GameEventNames.TurnStarted, ({ teamId }) => {
    const game = service();
    const match = getActiveOnlineMatch();
    const next =
      game && (!match || match.myTeamId === teamId)
        ? summarizeTurn({
            incidents: incidents.current,
            teamId: teamId,
            players: game.getTeams().flatMap((team) => team.players),
            ball: game.getState().ballPosition,
          })
        : null;
    clear();
    activeTeam.current = teamId;
    actedEarly.current = false;
    shownAt.current = 0;
    const turn = ++shown.current;
    void (watch.current?.landed() ?? Promise.resolve()).then(() => {
      if (turn !== shown.current) return;
      shownAt.current = Date.now();
      setSummary(next);
      if (actedEarly.current) acted();
    });
  });
  useEventBus(eventBus, GameEventNames.GameStateRestored, (state) => {
    clear();
    activeTeam.current = state.activeTeamId;
  });
  useEventBus(eventBus, GameEventNames.ScenarioLoaded, () => {
    clear();
    activeTeam.current = service()?.getState().activeTeamId ?? null;
  });
  useEventBus(eventBus, GameEventNames.DriveEnded, clear);
  useEventBus(eventBus, GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase !== GamePhase.PLAY) clear();
  });

  function acted() {
    if (!shownAt.current) {
      actedEarly.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const remaining = MIN_READ_MS - (Date.now() - shownAt.current);
    if (remaining <= 0) setSummary(null);
    else
      timer.current = setTimeout(() => {
        setSummary(null);
      }, remaining);
  }
  useEventBus(eventBus, GameEventNames.UI_ActionSelected, acted);
  useEventBus(eventBus, GameEventNames.UI_EndActivation, acted);
  useEventBus(eventBus, GameEventNames.UI_EndTurn, acted);
  useEventBus(eventBus, GameEventNames.ActionModeChanged, acted);

  if (!summary) return null;
  return <TurnCatchUpCardView summary={summary} />;
}

interface TurnCatchUpCardViewProps {
  summary: TurnSummary;
}
function TurnCatchUpCardView({ summary }: TurnCatchUpCardViewProps) {
  return (
    <Panel
      as="section"
      data-testid="turn-catch-up"
      aria-label="Since your last turn"
      aria-live="polite"
      className="pointer-events-auto flex max-h-[22vh] phone:max-h-[50dvh] w-full shrink-0 flex-col"
    >
      <PanelHeader as="h2" title="Since your last turn" />
      <div className="overflow-y-auto hud-scroll p-3 phone:p-2 text-hud-sm text-hud-bone">
        <ul className="space-y-1">
          {summary.players.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {summary.ball && (
          <p
            data-testid="turn-catch-up-ball"
            className="mt-2 border-t border-hud-edge pt-2"
          >
            {summary.ball}
          </p>
        )}
      </div>
    </Panel>
  );
}
