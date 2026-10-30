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

/** One side of the bar, with the slant of the turn tab. */
const FLAP = "flex min-w-0 -skew-x-12 items-center gap-2 px-3 py-1";

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
      <div
        data-testid="match-strip-bar"
        className="hud-slab grid w-full grid-cols-[1fr_auto_1fr] items-stretch !border-t-0"
      >
        <div className="flex min-w-0 justify-end">
          {strip && (
            <span
              data-testid="match-weather"
              title={strip.weather.title}
              className={FLAP}
            >
              {/* The word always shows. The effect wraps onto a hidden
                  second line when the flap is too narrow, rather than being
                  cut mid-word; the tooltip has it in full. */}
              <span className="flex h-[1.25em] skew-x-12 flex-wrap justify-end overflow-hidden whitespace-nowrap leading-[1.25em]">
                <span>
                  <span aria-hidden="true" className="mr-1 text-hud-gold">
                    {strip.weather.icon}
                  </span>
                  {strip.weather.word}
                </span>
                {strip.weather.effect && <span>: {strip.weather.effect}</span>}
              </span>
            </span>
          )}
        </div>
        {children}
        <div className="flex min-w-0 justify-start">
          <div
            id="match-strip-clock"
            data-testid="match-strip-clock"
            className={`${FLAP} pointer-events-auto whitespace-nowrap empty:hidden`}
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
