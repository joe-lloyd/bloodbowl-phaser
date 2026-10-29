import { ReactNode, useEffect, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { AllEvents, GameEventNames } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { Chip } from "../componentWarehouse/HudKit";
import {
  driveEffectText,
  spentActions,
  spentSummary,
  turnProgress,
  weatherSummary,
} from "./matchStripText";

function readStrip() {
  if (!ServiceContainer.isInitialized()) return null;
  const gs = ServiceContainer.getInstance().gameService;
  const state = gs.getState();
  const playing = state.phase === GamePhase.PLAY;
  const spent = playing ? spentSummary(spentActions(state.turn)) : null;
  return {
    weather: weatherSummary(state.weather),
    progress: playing ? turnProgress(state.turn.turnNumber) : null,
    teams: Object.keys(state.score).flatMap((id) => {
      const team = gs.getTeam(id);
      return team
        ? [
            {
              id,
              name: team.name,
              spent: id === state.activeTeamId ? spent : null,
              effects: driveEffectText(state, team),
            },
          ]
        : [];
    }),
  };
}

/** A flap hanging off the score bug, slanted like the turn tab. */
const FLAP =
  "flex -skew-x-12 items-center gap-2 border-b border-hud-gold/30 bg-hud-sunk/95 px-3 py-1 shadow-hud";

/** Persistent rules and turn reminders below the broadcast score bug. */
export function MatchStrip({
  eventBus,
  children,
}: {
  eventBus: IEventBus;
  /** The turn tab, hung between the weather and turn flaps. */
  children?: ReactNode;
}) {
  const [strip, setStrip] = useState(readStrip);
  useEffect(() => {
    const refresh = () => setStrip(readStrip());
    const events: (keyof AllEvents)[] = [
      GameEventNames.PhaseChanged,
      GameEventNames.TurnStarted,
      GameEventNames.TurnDataUpdated,
      GameEventNames.GameStateRestored,
      GameEventNames.WeatherChanged,
      GameEventNames.DriveEffectGranted,
      GameEventNames.DriveEffectExpired,
      GameEventNames.RerollUsed,
      GameEventNames.ActionResolved,
      GameEventNames.TeamUpdated,
    ];
    events.forEach((event) => eventBus.on(event, refresh));
    refresh();
    return () => events.forEach((event) => eventBus.off(event, refresh));
  }, [eventBus]);

  return (
    <div
      data-testid="match-strip"
      className="flex w-[clamp(380px,calc(100vw-38rem),620px)] flex-col items-center font-hud-body text-hud-xs leading-tight text-hud-bone"
    >
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-stretch">
        <div className="flex min-w-0 justify-end">
          {strip && (
            <span
              data-testid="match-weather"
              title={strip.weather.title}
              className={`${FLAP} -mr-1 min-w-0 border-l`}
            >
              <span className="skew-x-12 truncate whitespace-nowrap">
                <span aria-hidden="true" className="mr-1 text-hud-gold">
                  {strip.weather.icon}
                </span>
                {strip.weather.text}
              </span>
            </span>
          )}
        </div>
        {children}
        <div className="flex min-w-0 justify-start">
          {strip?.progress && (
            <span className={`${FLAP} -ml-1 border-r`}>
              <span
                data-testid="turns-left"
                className="skew-x-12 whitespace-nowrap font-semibold text-hud-gold"
              >
                {strip.progress}
              </span>
            </span>
          )}
          <div
            id="match-strip-clock"
            data-testid="match-strip-clock"
            className={`${FLAP} pointer-events-auto -ml-1 border-r empty:hidden`}
          />
        </div>
      </div>
      {strip?.teams.some((team) => team.spent || team.effects.length > 0) && (
        <div className="mt-1 grid w-full grid-cols-2 gap-2">
          {strip.teams.map((team, index) => (
            <div
              key={team.id}
              data-testid={`drive-effects-${team.id}`}
              aria-label={`${team.name} drive effects`}
              className={`flex min-w-0 flex-wrap content-start items-start gap-1 ${index === 0 ? "justify-start" : "justify-end"}`}
            >
              {team.spent && (
                <span data-testid="spent-actions" className="inline-flex">
                  <Chip className="!bg-hud-sunk/95 !normal-case !leading-tight text-left">
                    {team.spent}
                  </Chip>
                </span>
              )}
              {team.effects.map((effect) => (
                <Chip
                  key={effect}
                  tone="warn"
                  className="!bg-hud-sunk/95 !normal-case !leading-tight text-left"
                >
                  {effect}
                </Chip>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
