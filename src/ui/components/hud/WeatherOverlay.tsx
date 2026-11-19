import React, { useEffect, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { type Team } from "../../../types/Team";
import { HudButton } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { weatherRolled } from "../../../services/gameService/matchStart";
import { WeatherPanel } from "./WeatherReveal";
import { useWeatherThrow } from "./weatherThrow";

export const WeatherOverlay: React.FC<{ eventBus: EventBus }> = ({
  eventBus,
}) => {
  const [teams, setTeams] = useState<{ team1: Team; team2: Team } | null>(null);

  useEventBus(eventBus, GameEventNames.UI_StartWeather, (data) => {
    const match = getActiveOnlineMatch();
    if (match && match.kind !== "computer") return;
    setTeams({ team1: data.team1, team2: data.team2 });
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      eventBus.emit(GameEventNames.UI_RequestWeatherState, undefined);
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [eventBus]);

  if (!teams) return null;
  return (
    <WeatherDialog
      eventBus={eventBus}
      teams={teams}
      onDone={() => {
        setTeams(null);
        eventBus.emit(GameEventNames.UI_WeatherComplete, undefined);
      }}
    />
  );
};

function WeatherDialog({
  eventBus,
  teams,
  onDone,
}: {
  eventBus: EventBus;
  teams: { team1: Team; team2: Team };
  onDone: () => void;
}) {
  const { gameService } = ServiceContainer.getInstance();
  const { stage, step, total } = useWeatherThrow({
    eventBus: eventBus,
    teamId: teams.team1.id,
    rolled: () => weatherRolled(gameService.getState()),
  });
  const weather = gameService.getState().weather;

  const roll = () => {
    for (const team of [teams.team1, teams.team2])
      gameService.readyForWeather(team.id);
  };

  return (
    <WeatherPanel
      zClass="z-50"
      stage={stage}
      step={step}
      weather={weather}
      total={total}
      onDone={onDone}
      waiting={
        <HudButton variant="primary" size="lg" block onClick={roll}>
          ROLL WEATHER
        </HudButton>
      }
    />
  );
}
